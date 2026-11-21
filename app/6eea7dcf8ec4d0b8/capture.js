const SAMPLE_INTERVAL_MS = 180
const STABLE_DURATION_MS = 650
const PROBE_WIDTH = 240
const PROBE_HEIGHT = 216
const IMAGE_EDGE_LIMIT = 2400
const SLOPES = [-0.18, -0.09, 0, 0.09, 0.18]
const PDF_TYPE = 'application/pdf'

function cameraError(error) {
  switch (error.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'Camera access was denied. Allow it in your browser settings or upload a photo.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found. You can upload a photo instead.'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is busy or unavailable. Close other apps using it, or upload a photo.'
    default:
      return 'The camera could not start. Try again or upload a photo.'
  }
}

function sceneDifference(first, second) {
  if (!first || first.width !== second.width || first.height !== second.height) {
    return { average: Infinity, fraction: 1 }
  }

  // Subtract each frame's mean so auto-exposure does not look like a page turn.
  const brightnessShift = first.mean - second.mean
  let total = 0
  let changed = 0
  for (let i = 0; i < first.pixels.length; i += 1) {
    const difference = Math.abs(first.pixels[i] - second.pixels[i] - brightnessShift)
    total += difference
    changed += Number(difference > 17)
  }
  return {
    average: total / first.pixels.length,
    fraction: changed / first.pixels.length
  }
}

function isReadableScore(score) {
  return (
    Array.isArray(score?.measures) &&
    score.measures.length > 0 &&
    score.measures.every(
      (measure) =>
        Array.isArray(measure?.events) &&
        measure.events.every(
          (event) =>
            Array.isArray(event?.notes) &&
            event.notes.every((note) => note && typeof note === 'object')
        )
    )
  )
}

function hasStaff({ pixels, width, height }) {
  const margin = Math.floor(width * 0.08)
  const span = width - 2 * margin
  const projection = new Float32Array(height)
  const peaks = new Float32Array(height)
  const runStart = new Int16Array(height)
  const lastInk = new Int16Array(height)
  const longestRun = new Int16Array(height)

  for (const slope of SLOPES) {
    projection.fill(0)
    peaks.fill(0)
    runStart.fill(0)
    lastInk.fill(-width)
    longestRun.fill(0)

    for (let x = margin; x < width - margin; x += 1) {
      const shift = Math.round((x - width / 2) * slope)
      const start = Math.max(2, 2 - shift)
      const end = Math.min(height - 2, height - 2 - shift)
      for (let row = start; row < end; row += 1) {
        const offset = (row + shift) * width + x
        const center = pixels[offset]
        const above = Math.max(pixels[offset - width], pixels[offset - 2 * width])
        const below = Math.max(pixels[offset + width], pixels[offset + 2 * width])
        const contrast = Math.min(above, below) - center
        if (contrast > 15) {
          projection[row] += Math.min(contrast / 50, 1)
          if (x - lastInk[row] > 2) runStart[row] = x
          lastInk[row] = x
          longestRun[row] = Math.max(longestRun[row], x - runStart[row] + 1)
        }
      }
    }

    for (let row = 2; row < height - 2; row += 1) {
      const line = projection[row]
      if (line >= span * 0.25 && line >= projection[row - 1] && line > projection[row + 1]) {
        peaks[row] = line
      }
    }

    // A staff produces five parallel peaks with approximately uniform spacing.
    for (let top = 2; top < height - 8; top += 1) {
      if (!peaks[top]) continue
      for (let gap = 2; gap <= Math.min(12, (height - top - 3) / 4); gap += 0.25) {
        let strength = peaks[top]
        let found = 1
        let continuous = Number(longestRun[top] >= span * 0.15)
        let last = top
        for (let line = 1; line < 5; line += 1) {
          const row = Math.round(top + line * gap)
          let best = 0
          let bestRow = row
          for (let candidate = row - 1; candidate <= row + 1; candidate += 1) {
            if (candidate > last + 1 && peaks[candidate] > best) {
              best = peaks[candidate]
              bestRow = candidate
            }
          }
          if (best) {
            found += 1
            strength += best
            continuous += Number(longestRun[bestRow] >= span * 0.15)
            last = bestRow
          }
        }
        if (found === 5 && continuous >= 2 && strength >= span * 2.55) return true
      }
    }
  }
  return false
}

function preparedImage(source, width, height) {
  const scale = Math.min(1, IMAGE_EDGE_LIMIT / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d', { alpha: false })
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('The image could not be prepared. Try another photo.'))
      },
      'image/jpeg',
      0.93
    )
  })
}

async function preparePhoto(file) {
  if (/\.(heic|heif)$/i.test(file.name || '') || /^image\/hei[cf]/i.test(file.type)) {
    throw new Error('Choose a JPG or PNG photo. HEIC and HEIF photos need to be converted first.')
  }
  if (typeof createImageBitmap === 'function') {
    let bitmap
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Some browsers only support their image element for certain image formats.
    }
    if (bitmap) {
      try {
        return await preparedImage(bitmap, bitmap.width, bitmap.height)
      } finally {
        bitmap.close()
      }
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode().catch(() => {
      throw new Error('This photo could not be opened. Try a JPG or PNG image.')
    })
    return await preparedImage(image, image.naturalWidth, image.naturalHeight)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function prepareUpload(file) {
  const type = file.type.split(';', 1)[0].trim().toLowerCase()
  const isPdf =
    type === PDF_TYPE ||
    /\.pdf$/i.test(file.name || '') ||
    (!type.startsWith('image/') && (await file.slice(0, 5).text()) === '%PDF-')
  if (!isPdf) return preparePhoto(file)
  return file.type === PDF_TYPE ? file : new File([file], file.name, { type: PDF_TYPE })
}

function pdfCompletion(score) {
  const count = score.pages.length
  const skipped = Array.isArray(score.skippedPages)
    ? score.skippedPages
        .map((page) => page?.number)
        .filter((number) => Number.isInteger(number) && number > 0)
    : []
  const recognized = `PDF ready. Recognized ${count} ${count === 1 ? 'page' : 'pages'}.`
  if (!skipped.length) return recognized
  return `${recognized} Skipped ${skipped.length === 1 ? 'page' : 'pages'} ${skipped.join(', ')}.`
}

async function scanOnHost(body, { signal }) {
  const response = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': body.type },
    body,
    signal
  }).catch((error) => {
    if (error.name === 'AbortError') throw error
    throw new Error('The scanner could not be reached. Check your connection and try again.')
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = result?.detail || result?.error || result?.message
    throw new Error(
      typeof detail === 'string' && detail
        ? detail
        : body.type === PDF_TYPE
          ? 'The PDF scan could not be completed. Try the file again.'
          : 'The scan could not be completed. Try again with a clear photo.'
    )
  }
  return result
}

export function initCapture({ video, onStatus, onFrame, onScore, onState, scanLocal }) {
  const scanBody = scanLocal ?? scanOnHost
  const probe = document.createElement('canvas')
  const probeContext = probe.getContext('2d', { willReadFrequently: true })
  let cameraStream = null
  let cameraPending = false
  let timer = null
  let scan = null
  let generation = 0
  let preview = null
  let previewBody = null
  let lastPayload = null
  let hasScore = false
  let previousScene = null
  let steadySince = 0
  let attemptedScene = null
  let status = ''

  function setStatus(message) {
    if (message === status) return
    status = message
    onStatus(message)
  }

  function setState(state) {
    onState(state, {
      cameraActive: Boolean(cameraStream),
      cameraPending,
      canRescan: Boolean(lastPayload)
    })
  }

  function restingState() {
    return hasScore ? 'captured' : cameraStream ? 'camera' : 'idle'
  }

  function cancelWork() {
    generation += 1
    cameraPending = false
    scan?.controller.abort()
    scan = null
  }

  function releaseCamera() {
    clearInterval(timer)
    timer = null
    previousScene = null
    attemptedScene = null
    const stream = cameraStream
    cameraStream = null
    if (!stream) return
    for (const track of stream.getTracks()) track.stop()
    video.srcObject = null
  }

  function stop() {
    const wasTracking = cameraPending || cameraStream
    const wasScanning = Boolean(scan)
    cancelWork()
    releaseCamera()
    setState(restingState())
    if (wasTracking) setStatus('Camera stopped.')
    else if (wasScanning) setStatus('Scan cancelled.')
  }

  function sampleVideo() {
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height || video.readyState < 2) return null
    const scale = Math.min(PROBE_WIDTH / width, PROBE_HEIGHT / height, 1)
    const sampleWidth = Math.max(1, Math.round(width * scale))
    const sampleHeight = Math.max(1, Math.round(height * scale))
    if (probe.width !== sampleWidth) probe.width = sampleWidth
    if (probe.height !== sampleHeight) probe.height = sampleHeight
    probeContext.imageSmoothingQuality = 'high'
    probeContext.drawImage(video, 0, 0, sampleWidth, sampleHeight)
    const { data } = probeContext.getImageData(0, 0, sampleWidth, sampleHeight)
    const pixels = new Uint8Array(sampleWidth * sampleHeight)
    let total = 0
    for (let i = 0; i < pixels.length; i += 1) {
      const offset = 4 * i
      const luminance = (77 * data[offset] + 150 * data[offset + 1] + 29 * data[offset + 2]) >> 8
      pixels[i] = luminance
      total += luminance
    }
    return { pixels, mean: total / pixels.length, width: sampleWidth, height: sampleHeight }
  }

  function discardImagePreview() {
    if (preview) URL.revokeObjectURL(preview)
    preview = null
    previewBody = null
  }

  function showImage(blob) {
    if (blob === previewBody) return
    discardImagePreview()
    preview = URL.createObjectURL(blob)
    previewBody = blob
    onFrame(preview, blob)
  }

  async function recognize(prepare, preparingMessage = 'Reading the sheet music…') {
    if (scan) {
      setStatus('A scan is in progress.')
      return
    }
    const request = { controller: new AbortController() }
    scan = request
    setState('scanning')
    setStatus(preparingMessage)
    try {
      const body = await prepare()
      if (scan !== request) return
      lastPayload = body
      const isPdf = body.type === PDF_TYPE
      setStatus(
        isPdf
          ? 'Reading the PDF pages… Larger scores may take a few minutes.'
          : 'Reading the sheet music…'
      )
      const result = await scanBody(body, {
        signal: request.controller.signal,
        onProgress(message) {
          if (scan === request) setStatus(message)
        }
      })
      if (scan !== request) return
      let score = result?.score ?? result
      if (
        !isReadableScore(score) ||
        (isPdf && (!Array.isArray(score.pages) || !score.pages.length))
      ) {
        throw new Error('The scanner returned an unreadable result. Try scanning again.')
      }
      if (isPdf) {
        if (typeof score.title !== 'string' || !score.title.trim()) {
          const title = body.name.replace(/\.[^.]+$/, '').trim()
          score = { ...score, title: title || 'Scanned score' }
        }
      } else {
        showImage(body)
      }
      onScore(score)
      if (isPdf) discardImagePreview()
      hasScore = true
      setStatus(
        cameraStream
          ? 'Score ready. Stop the camera to tap notes, or move to a new passage.'
          : isPdf
            ? pdfCompletion(score)
            : 'Score ready.'
      )
    } catch (error) {
      if (scan === request && error.name !== 'AbortError') {
        setStatus(error.message || 'The scan could not be completed.')
      }
    } finally {
      if (scan === request) {
        scan = null
        setState(restingState())
      }
    }
  }

  function scanCamera(scene = sampleVideo()) {
    if (scan) {
      setStatus('A scan is in progress.')
      return
    }
    if (!scene) {
      setStatus('The camera is still starting. Try again in a moment.')
      return
    }
    attemptedScene = scene
    return recognize(() => preparedImage(video, video.videoWidth, video.videoHeight))
  }

  function trackPassage() {
    if (!cameraStream || scan) return
    const scene = sampleVideo()
    if (!scene) return
    const now = performance.now()
    const movement = sceneDifference(previousScene, scene)
    if (movement.average > 4.5 || movement.fraction > 0.075) {
      previousScene = scene
      steadySince = now
      if (!attemptedScene) setStatus('Hold the sheet music steady to scan.')
      return
    }
    if (now - steadySince < STABLE_DURATION_MS) return
    const difference = sceneDifference(attemptedScene, scene)
    if (difference.average <= 7.5 || difference.fraction <= 0.09) return
    if (!hasStaff(scene)) {
      setStatus('Fit the staff lines in the camera view, or tap Scan now.')
      return
    }
    void scanCamera(scene)
  }

  async function start() {
    if (cameraPending || cameraStream) return
    if (globalThis.isSecureContext === false) {
      setStatus('Camera access requires HTTPS or localhost. You can still upload a photo.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Camera access is unavailable in this browser. You can upload a photo.')
      return
    }
    cancelWork()
    const opening = generation
    cameraPending = true
    setState(restingState())
    setStatus('Opening the camera…')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        audio: false
      })
      if (generation !== opening) {
        for (const track of stream.getTracks()) track.stop()
        return
      }
      cameraStream = stream
      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => {
          if (cameraStream !== stream) return
          stop()
          setStatus('The camera disconnected. Restart it or upload a photo.')
        })
      }
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      setState('camera')
      await video.play()
      if (generation !== opening) return
      cameraPending = false
      setState('camera')
      setStatus('Point the camera at the sheet music and hold steady.')
      timer = setInterval(trackPassage, SAMPLE_INTERVAL_MS)
    } catch (error) {
      if (generation !== opening) return
      cameraPending = false
      releaseCamera()
      setState(restingState())
      setStatus(cameraError(error))
    }
  }

  function upload(file) {
    if (!file) return
    cancelWork()
    releaseCamera()
    return recognize(() => prepareUpload(file), 'Preparing the file…')
  }

  function rescan() {
    if (cameraStream) return scanCamera()
    if (cameraPending) {
      setStatus('The camera is still starting. Try again in a moment.')
      return
    }
    if (lastPayload) return recognize(() => lastPayload)
    setStatus('Start the camera or upload a photo or PDF first.')
  }

  function stopWhenHidden() {
    if (cameraStream || cameraPending || (scanLocal && scan)) stop()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopWhenHidden()
  })
  window.addEventListener('pagehide', stopWhenHidden)

  return { start, stop, upload, rescan }
}
