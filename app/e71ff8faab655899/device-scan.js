import { convertRecognizedPages } from './score-conversion.js'

const PDF_TYPE = 'application/pdf'
const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_PDF_PAGES = 64
const MAX_RENDER_EDGE = 2600
const MAX_RENDER_PIXELS = 4_500_000
const PREVIEW_BUDGET = 3_600_000
const WORKER_TIMEOUT = 180_000
const NO_STAFF = /no (?:noteheads or clefs|staffs|staves)(?: were)? found/i

function abortReason(signal) {
  return signal?.reason ?? new DOMException('Scan cancelled.', 'AbortError')
}

function requireActive(signal) {
  if (signal?.aborted) throw abortReason(signal)
}

function workerExchange(worker, request, responseType, signal, report) {
  requireActive(signal)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      finish(reject, new Error('The on-device scan took too long. Try a smaller score or photo.'))
    }, WORKER_TIMEOUT)
    function finish(callback, result) {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      worker.removeEventListener('message', message)
      worker.removeEventListener('error', workerError)
      worker.removeEventListener('messageerror', workerError)
      callback(result)
    }
    function abort() {
      finish(reject, abortReason(signal))
    }
    function workerError() {
      finish(reject, new Error('The on-device scanner could not start. Check that the scanner is downloaded.'))
    }
    function message({ data }) {
      if (data?.type === responseType && data.id === request.id) finish(resolve, data)
      else if (data?.type === 'error' && (data.id === request.id || request.type === 'init')) {
        const error = new Error(data.msg || 'The printed notes could not be recognized.')
        error.noStaff = NO_STAFF.test([data.msg, data.seen].join(' '))
        finish(reject, error)
      } else if (data?.type === 'progress' && request.type === 'init') {
        report('Preparing the on-device scanner…')
      }
    }
    signal?.addEventListener('abort', abort, { once: true })
    worker.addEventListener('message', message)
    worker.addEventListener('error', workerError)
    worker.addEventListener('messageerror', workerError)
    try {
      const buffer = request.image?.buffer ?? request.image?.data?.buffer
      worker.postMessage(request, buffer ? [buffer] : [])
    } catch (error) {
      finish(reject, error)
    }
  })
}

function openRecognizer(signal, report) {
  let worker
  let ready
  let nextId = 0
  return {
    async read(source, message) {
      requireActive(signal)
      if (!worker) {
        worker = new Worker(new URL('../../packs/310103c8489a4d1a/engine/omr-worker.js', import.meta.url), { type: 'module' })
        const isiOS = /iP(ad|hone|od)/.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        report('Preparing the on-device scanner…')
        ready = workerExchange(worker, { type: 'init', ios: isiOS }, 'ready', signal, report)
      }
      const { needsPixels } = await ready
      report(message)
      const canvas = source instanceof HTMLCanvasElement
      let image
      if (needsPixels) {
        image = canvas ? canvasPixels(source) : await withRaster(source, rasterPixels)
      } else {
        const blob = canvas ? await canvasJpeg(source) : source
        image = new Uint8Array(await blob.arrayBuffer())
      }
      const result = await workerExchange(
        worker, { type: 'recognise', id: ++nextId, image }, 'result', signal, report
      )
      if (typeof result.xml !== 'string' || !result.xml.trim()) {
        throw new Error('The scanner returned an empty score.')
      }
      return result.xml
    },
    close() {
      worker?.terminate()
    }
  }
}

function canvasJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('The scanned page could not be prepared as an image.'))
    }, 'image/jpeg', 0.94)
  })
}

function thumbnail(source, target, edge) {
  const scale = Math.min(1, edge / Math.max(source.width, source.height))
  target.width = Math.max(1, Math.round(source.width * scale))
  target.height = Math.max(1, Math.round(source.height * scale))
  const context = target.getContext('2d', { alpha: false, willReadFrequently: true })
  context.drawImage(source, 0, 0, target.width, target.height)
  return context
}

function isBlankPage(canvas, small) {
  const context = thumbnail(canvas, small, 420)
  const { data } = context.getImageData(0, 0, small.width, small.height)
  const threshold = Math.max(1, Math.ceil(small.width * small.height * 0.00008))
  let dark = 0
  for (let i = 0; i < data.length; i += 4) {
    if (0.30 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2] < 145 && ++dark >= threshold) return false
  }
  return true
}

function previewPage(canvas, small, pageCount) {
  const budget = Math.min(Math.floor(PREVIEW_BUDGET / pageCount), 280_000)
  for (const edge of [1440, 1100, 820, 580, 380, 200]) {
    thumbnail(canvas, small, edge)
    const preview = small.toDataURL('image/jpeg', 0.77)
    if (preview.length < budget * 4 / 3) return preview
  }
  throw new Error('A PDF page preview could not be prepared.')
}

function hasMusic(xml) {
  const score = new DOMParser().parseFromString(xml, 'application/xml')
  return [...score.getElementsByTagNameNS('*', 'note')].some((note) =>
    [...note.children].some(({ localName }) => localName === 'pitch' || localName === 'rest')
  )
}

async function renderPage(pdf, number, canvas, signal, annotationMode) {
  const page = await pdf.getPage(number)
  try {
    requireActive(signal)
    const { width, height } = page.getViewport({ scale: 1 })
    if (!(width > 0 && height > 0 && Number.isFinite(width * height)) || Math.max(width, height) > 6 * Math.min(width, height)) {
      throw new Error('The page has unsupported dimensions.')
    }
    const scale = Math.min(MAX_RENDER_EDGE / Math.max(width, height), Math.sqrt(MAX_RENDER_PIXELS / (width * height)))
    const viewport = page.getViewport({ scale })
    canvas.width = Math.max(1, Math.ceil(viewport.width))
    canvas.height = Math.max(1, Math.ceil(viewport.height))
    const rendering = page.render({
      canvas,
      viewport,
      background: '#fff',
      annotationMode
    })
    const cancel = () => rendering.cancel()
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      await rendering.promise
      requireActive(signal)
      return [canvas.width, canvas.height]
    } finally {
      signal?.removeEventListener('abort', cancel)
    }
  } finally {
    page.cleanup()
  }
}

async function readPdf(file, recognizer, signal, report) {
  report('Opening the PDF on this device…')
  const directory = new URL('../../packs/310103c8489a4d1a/pdf/', import.meta.url)
  const pdfjs = await import(new URL('pdf.min.mjs', directory).href)
  requireActive(signal)
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', directory).href
  const data = new Uint8Array(await file.arrayBuffer())
  requireActive(signal)
  const loading = pdfjs.getDocument({
    data,
    cMapUrl: new URL('cmaps/', directory).href,
    standardFontDataUrl: new URL('standard_fonts/', directory).href,
    iccUrl: new URL('iccs/', directory).href,
    wasmUrl: new URL('wasm/', directory).href,
    enableXfa: false
  })
  let destruction
  const close = () => destruction ??= loading.destroy().catch(() => {})
  const canvas = document.createElement('canvas')
  const small = document.createElement('canvas')
  signal?.addEventListener('abort', close, { once: true })
  try {
    const pdf = await loading.promise
    requireActive(signal)
    const pageCount = pdf.numPages
    if (!pageCount) throw new Error('This PDF contains no pages.')
    if (pageCount > MAX_PDF_PAGES) {
      throw new Error('This PDF has more than 64 pages. Split it into smaller PDFs.')
    }
    const titleValue = (await pdf.getMetadata().catch(() => null))?.info?.Title
    const title = typeof titleValue === 'string' ? titleValue.replace(/\s+/g, ' ').trim().slice(0, 250) : ''
    const pages = []
    const skippedPages = []
    for (let number = 1; number <= pageCount; number += 1) {
      const label = 'PDF page ' + number
      const step = label + ' of ' + pageCount
      report('Rendering ' + step + ' on this device…')
      try {
        requireActive(signal)
        const imageSize = await renderPage(pdf, number, canvas, signal, pdfjs.AnnotationMode.DISABLE)
        if (isBlankPage(canvas, small)) {
          skippedPages.push({ number, reason: 'Blank page' })
          continue
        }
        const xml = await recognizer.read(canvas, 'Reading ' + step + ' on this device…')
        if (!hasMusic(xml)) throw new Error('No readable notes or rests were found.')
        pages.push({ number, imageSize, preview: previewPage(canvas, small, pageCount), xml })
      } catch (error) {
        requireActive(signal)
        if (error.noStaff && !pages.length) {
          skippedPages.push({ number, reason: 'No music staves detected' })
          continue
        }
        throw new Error(label + ' could not be read. Try a clearer copy or extract that page.', { cause: error })
      } finally {
        canvas.width = canvas.height = small.width = small.height = 1
      }
    }
    if (!pages.length) throw new Error('No readable sheet music was found in this PDF.')
    return { pages, pageCount, skippedPages, title, pdf: true }
  } catch (error) {
    requireActive(signal)
    if (error.name === 'PasswordException') {
      throw new Error('This PDF is password protected. Upload an unlocked copy.')
    }
    if (error.name === 'InvalidPDFException') {
      throw new Error('This PDF could not be opened. Try exporting another copy.')
    }
    throw error
  } finally {
    signal?.removeEventListener('abort', close)
    await close()
  }
}

async function withRaster(file, read) {
  let bitmap
  if (typeof createImageBitmap === 'function') {
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      // An image element provides a second browser decoding path.
    }
  }
  if (bitmap) {
    try {
      return read(bitmap, bitmap.width, bitmap.height)
    } finally {
      bitmap.close()
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return read(image, image.naturalWidth, image.naturalHeight)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasPixels(canvas) {
  const { width, height } = canvas
  const context = canvas.getContext('2d')
  return { width, height, data: context.getImageData(0, 0, width, height).data }
}

function rasterPixels(source, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  try {
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
    context.drawImage(source, 0, 0)
    return canvasPixels(canvas)
  } finally {
    canvas.width = canvas.height = 1
  }
}

export async function scanOnDevice(file, { signal, onProgress = () => {} } = {}) {
  requireActive(signal)
  if (!file.size) throw new Error('Choose an image or PDF to scan.')
  if (file.size > MAX_FILE_BYTES) throw new Error('Choose an image or PDF smaller than 20 MiB.')
  const recognizer = openRecognizer(signal, onProgress)
  let source
  try {
    if (file.type === PDF_TYPE) {
      source = await readPdf(file, recognizer, signal, onProgress)
    } else {
      const imageSize = await withRaster(file, (_, width, height) => [width, height])
      const xml = await recognizer.read(file, 'Reading the sheet music on this device…')
      source = { pages: [{ number: 1, imageSize, xml }] }
    }
  } finally {
    recognizer.close()
  }
  requireActive(signal)
  return convertRecognizedPages(source, { signal, onProgress })
}
