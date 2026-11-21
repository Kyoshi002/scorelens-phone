import { scanOnDevice } from './device-scan.js'
import { packRoot, packId, scannerFiles } from './pack-info.js'

const base = new URL(packRoot, import.meta.url)
const cacheName = 'scorelens-phone-pack-' + packId
const total = scannerFiles.reduce((sum, file) => sum + file.bytes, 0)
const mb = bytes => Math.ceil(bytes / 1_000_000) + ' MB'
const panel = document.querySelector('.phone-setup')
const heading = document.getElementById('scanner-state')
const detail = document.getElementById('scanner-detail')
const button = document.getElementById('scanner-install')
const meter = document.getElementById('scanner-progress')
const updateButton = document.getElementById('app-update')
let ready = false
let download
let registration
let scanning = 0
let updating = false

function reflectUpdate() {
  updateButton.hidden = !updating && !(registration?.waiting && navigator.serviceWorker.controller)
  updateButton.disabled = Boolean(download || scanning || updating)
  updateButton.textContent = updating ? 'Updating ScoreLens…' : 'Update ScoreLens'
}

async function registerApp() {
  if (registration) return
  const worker = await navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { updateViaCache: 'none' })
  if (registration) return
  registration = worker
  function watchWorker() {
    registration.installing?.addEventListener('statechange', reflectUpdate)
    reflectUpdate()
  }
  registration.addEventListener('updatefound', watchWorker)
  watchWorker()
}

function checkForUpdate() {
  if (!document.hidden && navigator.onLine) void registration?.update().catch(() => {})
}

async function controllerReady() {
  if (!('serviceWorker' in navigator) || !window.caches) {
    throw new Error('This browser cannot install the offline scanner. Open ScoreLens in Safari or Chrome.')
  }
  if (navigator.serviceWorker.controller) return
  await registerApp()
  await new Promise((resolve, reject) => {
    function finish() {
      if (!navigator.serviceWorker.controller) return
      clearTimeout(timer)
      navigator.serviceWorker.removeEventListener('controllerchange', finish)
      resolve()
    }
    const timer = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', finish)
      reject(new Error('The app download did not finish. Reconnect and reload ScoreLens.'))
    }, 90000)
    navigator.serviceWorker.addEventListener('controllerchange', finish)
    finish()
  })
}

async function inventory(cache) {
  const entries = new Set((await cache.keys()).map(request => request.url))
  return scannerFiles.filter(file => !entries.has(new URL(file.path, base).href))
}

function showReady() {
  ready = true
  panel.dataset.ready = 'true'
  heading.textContent = 'Scanner ready offline'
  detail.textContent = 'Open the camera or choose a photo or PDF. Your score stays on this device.'
  button.hidden = true
  meter.hidden = true
}

async function downloadAsset(file, url, signal, progress) {
  const chunkSize = 4 * 1024 * 1024
  const parts = []
  let offset = 0
  let type = 'application/octet-stream'
  while (offset < file.bytes) {
    const end = Math.min(offset + chunkSize, file.bytes) - 1
    for (let attempt = 1; ; attempt++) {
      if (signal.aborted) throw new DOMException('Download paused.', 'AbortError')
      const transfer = new AbortController()
      const cancel = () => transfer.abort()
      signal.addEventListener('abort', cancel, { once: true })
      const timer = setTimeout(cancel, 60000)
      try {
        const headers = file.bytes > chunkSize ? { Range: 'bytes=' + offset + '-' + end } : {}
        const response = await fetch(url, { headers, signal: transfer.signal })
        if (!response.ok) throw new Error('The download was interrupted.')
        const partial = response.status === 206
        if (partial && response.headers.get('Content-Range') !== 'bytes ' + offset + '-' + end + '/' + file.bytes) {
          throw new Error('Unexpected scanner file range.')
        }
        const bytes = await response.blob()
        if (bytes.size !== (partial ? end - offset + 1 : file.bytes)) throw new Error('Incomplete scanner file.')
        if (!partial) {
          parts.length = 0
          offset = 0
        }
        parts.push(bytes)
        type = response.headers.get('Content-Type') || type
        offset += bytes.size
        progress(offset)
        break
      } catch (error) {
        if (signal.aborted || attempt >= 3) throw error
      } finally {
        clearTimeout(timer)
        signal.removeEventListener('abort', cancel)
      }
    }
  }
  if (/\.m?js$/.test(file.path)) type = 'text/javascript'
  if (file.path.endsWith('.wasm')) type = 'application/wasm'
  return new Blob(parts, { type })
}

async function install() {
  if (updating) return
  if (download) {
    download.abort()
    return
  }
  const request = new AbortController()
  download = request
  reflectUpdate()
  let failed = false
  button.textContent = 'Pause download'
  meter.hidden = false
  heading.textContent = 'Downloading offline scanner'
  try {
    await controllerReady()
    const cache = await caches.open(cacheName)
    const missing = await inventory(cache)
    let received = total - missing.reduce((sum, file) => sum + file.bytes, 0)
    function progress(current = 0) {
      meter.value = (received + current) * 100 / total
      detail.textContent = mb(received + current) + ' of ' + mb(total) + ' · Keep ScoreLens open.'
    }
    progress()
    for (const file of missing) {
      const url = new URL(file.path, base)
      const blob = await downloadAsset(file, url, request.signal, progress)
      if (blob.size !== file.bytes) throw new Error('A scanner file was incomplete.')
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
      const checksum = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')
      if (checksum !== file.sha256) throw new Error('A scanner file could not be verified.')
      if (request.signal.aborted) throw new DOMException('Download paused.', 'AbortError')
      await cache.put(url, new Response(blob, { headers: { 'Content-Type': blob.type } }))
      received += file.bytes
      progress()
    }
    showReady()
    void navigator.storage?.persist?.().catch(() => {})
  } catch (error) {
    failed = true
    heading.textContent = request.signal.aborted ? 'Download paused' : 'Scanner download incomplete'
    detail.textContent = error.name === 'QuotaExceededError'
      ? 'Free some storage on this device, then resume the download.'
      : 'Reconnect and resume here. Files already saved can be reused.'
  } finally {
    download = null
    reflectUpdate()
    if (failed) button.textContent = 'Resume scanner download'
  }
}

export async function scanLocal(blob, options) {
  if (updating) throw new Error('ScoreLens is updating. Scan again after it reopens.')
  if (!ready) throw new Error('Download the offline scanner before scanning a score.')
  scanning++
  reflectUpdate()
  try {
    return await scanOnDevice(blob, options)
  } finally {
    scanning--
    reflectUpdate()
  }
}

button.addEventListener('click', install)
document.addEventListener('visibilitychange', checkForUpdate)
window.addEventListener('online', checkForUpdate)
updateButton.addEventListener('click', () => {
  const waiting = registration?.waiting
  if (!waiting || download || scanning || updating) return
  updating = true
  reflectUpdate()
  function activated() {
    clearTimeout(timeout)
    location.reload()
  }
  const timeout = setTimeout(() => {
    navigator.serviceWorker.removeEventListener('controllerchange', activated)
    updating = false
    reflectUpdate()
  }, 20000)
  navigator.serviceWorker.addEventListener('controllerchange', activated, { once: true })
  waiting.postMessage({ type: 'SKIP_WAITING' })
})
async function setup() {
  try {
    // An installed, offline app already has a controlling worker.
    if (!navigator.serviceWorker?.controller) await controllerReady()
    else void registerApp().then(checkForUpdate).catch(() => {})
    const missing = await inventory(await caches.open(cacheName))
    if (!missing.length) return showReady()
    heading.textContent = missing.length === scannerFiles.length ? 'Set up offline scanning' : 'Finish scanner download'
    detail.textContent = 'Add ScoreLens to your Home Screen, open it there, then download the ' + mb(total) + ' scanner once over Wi-Fi.'
    button.disabled = false
    if (missing.length !== scannerFiles.length) button.textContent = 'Resume scanner download'
  } catch (error) {
    heading.textContent = 'Offline setup unavailable'
    detail.textContent = error.message || 'Reconnect and reopen ScoreLens to finish setup.'
  }
}
void setup()
