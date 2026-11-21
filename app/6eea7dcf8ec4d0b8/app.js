import { scanLocal } from './setup.js'
import { initCapture } from './capture.js'
import { icon, hydrateIcons } from './icons.js'
import { soundingAt, keyboardRange, buildPlayback } from './practice.js'
import { initTeacher } from './teacher.js'
import { initFollow } from './follow.js'
import { savePdf, readPdf, removePdf, pdfSummaries } from './pdf-library.js'

const el = (id) => document.getElementById(id)
const text = (id, value) => {
  el(id).textContent = value
}
const make = (tag, cls, value) => {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (value != null) node.textContent = value
  return node
}
hydrateIcons()
let score,
  pieceId,
  builtIn,
  savedPreview,
  frame,
  frameBlob,
  frameMatches = false,
  loadedFromLibrary = false
let cameraActive = false,
  cameraPending = false
let pdfPageIndex = -1
let savedPdfs = []
let libraryRead = 0
let measureIndex = 0,
  eventIndex = 0,
  audio,
  transport = null,
  noticeTimer,
  soundGeneration = 0
const storageKey = 'scorelens.pieces.v1'
const measure = () => score?.measures[measureIndex]
const currentEvent = () => measure()?.events[eventIndex]
function notify(message) {
  clearTimeout(noticeTimer)
  text('notice', message)
  noticeTimer = setTimeout(() => text('notice', ''), 3400)
}
function library() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) || '[]')
    return Array.isArray(data)
      ? data.filter((item) => item?.id && item?.score?.measures?.length)
      : []
  } catch {
    return []
  }
}
function updateSave() {
  const saved = [...savedPdfs, ...library()].some((item) => item.id === pieceId)
  el('save').innerHTML = icon(saved ? 'check' : 'bookmark')
  el('save').setAttribute('aria-label', saved ? 'Piece saved' : 'Save piece')
  el('save').title = saved ? 'Piece saved' : 'Save piece'
}
function onState(state, meta = {}) {
  cameraActive = !!meta.cameraActive
  cameraPending = !!meta.cameraPending
  el('camera').hidden = !cameraActive
  el('photo').hidden = cameraActive || !frame
  const pdfVisible = !!score?.pages?.length && frameMatches && !cameraActive
  el('pdf-navigation').hidden = !pdfVisible || score.pages.length < 2
  el('viewfinder').classList.toggle('pdf-view', pdfVisible)
  el('sample-paper').hidden = cameraActive || !!frame || (!builtIn && !!score)
  el('open-camera').querySelector('span').textContent = cameraPending
    ? 'Cancel camera'
    : cameraActive
      ? 'Stop camera'
      : 'Open camera'
  text(
    'camera-label',
    state === 'scanning'
      ? 'Reading score'
      : cameraActive
        ? 'Camera live'
        : cameraPending
          ? 'Starting…'
          : 'Camera off'
  )
  el('camera-label').parentElement.classList.toggle('active', cameraActive || state === 'scanning')
  text(
    'view-tag',
    state === 'scanning'
      ? 'Reading passage…'
      : cameraActive
        ? 'Live camera'
        : frame
          ? 'Captured passage'
          : builtIn || !score
            ? 'Example score'
            : 'Saved transcription'
  )
  el('rescan').hidden =
    state === 'scanning' || (!cameraActive && (!meta.canRescan || loadedFromLibrary))
  el('cancel-scan').hidden = state !== 'scanning'
  text('rescan', cameraActive ? 'Scan now' : 'Scan again')
  layoutMarks()
}
const capture = initCapture({
  scanLocal,
  video: el('camera'),
  onStatus: (message) => text('scan-message', message),
  onState,
  onFrame(url, blob) {
    frame = url
    frameBlob = blob
    frameMatches = false
    loadedFromLibrary = false
    if (url) el('photo').src = url
    else el('photo').removeAttribute('src')
    el('photo').hidden = cameraActive || !url
    el('sample-paper').hidden = cameraActive || !!url || !builtIn
    el('picked-note').hidden = true
    layoutMarks()
  },
  onScore(result) {
    if (!result?.measures?.length) {
      text('scan-message', 'No readable measures came back. Try a closer, straighter view.')
      return
    }
    frameMatches = true
    loadedFromLibrary = false
    if (result.pages?.length) frameBlob = null
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('')
    setScore(
      result,
      id,
      false,
      result.pages?.length ? null : frameBlob ? URL.createObjectURL(frameBlob) : frame
    )
  }
})
el('open-camera').onclick = () => (cameraActive || cameraPending ? capture.stop() : capture.start())
el('open-photo').onclick = () => el('file').click()
el('file').onchange = () => {
  const file = el('file').files[0]
  el('file').value = ''
  if (file) {
    loadedFromLibrary = false
    capture.upload(file)
  }
}
el('rescan').onclick = () => capture.rescan()
el('cancel-scan').onclick = () => capture.stop()

function setScore(result, id, sample, preview) {
  stopPlayback()
  if (savedPreview?.startsWith('blob:') && savedPreview !== preview)
    URL.revokeObjectURL(savedPreview)
  score = result
  pieceId = id
  builtIn = sample
  savedPreview = preview
  pdfPageIndex = -1
  measureIndex = 0
  eventIndex = 0
  text(
    'source',
    result.pages?.length
      ? 'PDF score · check against print'
      : sample
        ? 'Built-in study'
        : 'Scanned passage · check against print'
  )
  text('piece-title', result.title || 'Scanned passage')
  el('measure').replaceChildren(
    ...result.measures.map((bar, index) => {
      const option = make('option', '', 'Measure ' + bar.number)
      option.value = String(index)
      return option
    })
  )
  el('pdf-page').replaceChildren(
    ...(result.pages || []).map((page, index) => {
      const option = make(
        'option',
        '',
        page.number + ' of ' + (result.pageCount || result.pages.length)
      )
      option.value = String(index)
      return option
    })
  )
  renderMeasure()
  updateSave()
  buildMarks()
  if (location.hash === '#follow') loadFollow()
}
function buildMarks() {
  const target = builtIn ? el('sample-marks') : el('photo-marks')
  el('sample-marks').replaceChildren()
  el('photo-marks').replaceChildren()
  el('picked-note').hidden = true
  const size = score.pages?.[pdfPageIndex]?.imageSize || score.imageSize
  if (!size) return
  const [w, h] = size,
    fragment = document.createDocumentFragment()
  score.measures.forEach((bar, m) => {
    if (score.pages?.length && bar.pageIndex !== pdfPageIndex) return
    bar.events.forEach((event, e) =>
      event.notes.forEach((note) => {
        if (!Array.isArray(note.position)) return
        const button = make('button', 'mark'),
          [x, y] = note.position
        button.style.left = (100 * x) / w + '%'
        button.style.top = (100 * y) / h + '%'
        button.setAttribute(
          'aria-label',
          note.name + ', measure ' + bar.number + ', ' + note.rhythm
        )
        button.dataset.measure = m
        button.dataset.event = e
        button.onclick = () => {
          stopPlayback()
          measureIndex = m
          eventIndex = e
          renderMeasure()
          drawKeys([note])
          audition({ notes: [note], duration: note.duration })
          text(
            'picked-note',
            [
              note.name,
              note.rhythm,
              note.hand === 'unknown' ? 'Hand unmarked' : note.hand + ' hand',
              note.finger ? 'finger ' + note.finger + ' (' + note.fingeringSource + ')' : '',
              event.count ? 'count ' + event.count : ''
            ]
              .filter(Boolean)
              .join(' · ')
          )
          el('picked-note').hidden = false
          target.querySelectorAll('.selected').forEach((mark) => mark.classList.remove('selected'))
          button.classList.add('selected')
        }
        fragment.append(button)
      })
    )
  })
  target.append(fragment)
  layoutMarks()
  highlightMarks()
}
function highlightMarks() {
  const target = builtIn ? el('sample-marks') : el('photo-marks')
  target.querySelectorAll('.selected').forEach((mark) => mark.classList.remove('selected'))
  target
    .querySelectorAll('[data-measure="' + measureIndex + '"][data-event="' + eventIndex + '"]')
    .forEach((mark) => mark.classList.add('selected'))
}
function layoutMarks() {
  const layer = el('photo-marks'),
    host = el('viewfinder')
  layer.hidden = !frameMatches || cameraActive || builtIn || !score?.imageSize
  if (layer.hidden) return
  const [width, height] = score.pages?.[pdfPageIndex]?.imageSize || score.imageSize,
    scale = Math.min(host.clientWidth / width, host.clientHeight / height)
  Object.assign(layer.style, {
    inset: 'auto',
    left: (host.clientWidth - width * scale) / 2 + 'px',
    top: (host.clientHeight - height * scale) / 2 + 'px',
    width: width * scale + 'px',
    height: height * scale + 'px'
  })
}
new ResizeObserver(layoutMarks).observe(el('viewfinder'))
function renderMeasure() {
  const bar = measure()
  if (!bar) return
  if (score.pages?.[bar.pageIndex] && pdfPageIndex !== bar.pageIndex) {
    pdfPageIndex = bar.pageIndex
    const page = score.pages[pdfPageIndex]
    frame = page.preview
    el('photo').src = frame
    el('photo').alt = 'Sheet music on PDF page ' + page.number
    el('pdf-page').value = String(pdfPageIndex)
    buildMarks()
  } else if (!score.pages?.length) {
    el('photo').alt = 'Passage sent for recognition'
  }
  el('measure').value = String(measureIndex)
  el('prev').disabled = measureIndex === 0
  el('next').disabled = measureIndex === score.measures.length - 1
  text('meter', bar.timeSignature || score.timeSignature)
  const sameSignature = bar.key === score.measures[0].key
  text('key', sameSignature ? score.key : bar.key)
  text(
    'key-detail',
    (sameSignature ? score.keyDetail : bar.keyDetail) ||
      'Check the accidentals and where the phrase resolves.'
  )
  const detected = teacher.match(el('key').textContent).keys
  text(
    'learn-detected',
    detected.length > 1 ? 'Explore both keys' : detected.length ? 'Learn this key' : 'Browse keys'
  )
  text('counts', bar.countPattern || 'Meter unclear')
  text('tip', score.tips?.[0] || 'Practice each hand slowly, then bring them together.')
  el('events').replaceChildren(
    ...bar.events.map((event, index) => {
      const button = make('button', 'event')
      button.append(
        make('small', '', event.count ? 'Count ' + event.count : 'Event ' + (index + 1)),
        make('strong', '', event.notes.map((n) => n.name).join(' · ') || 'Rest')
      )
      button.onclick = () => {
        stopPlayback()
        eventIndex = index
        renderEvent()
        audition(event)
      }
      return button
    })
  )
  renderEvent()
}
el('pdf-page').onchange = () => {
  const pageIndex = Number(el('pdf-page').value)
  const first = score.measures.findIndex((bar) => bar.pageIndex === pageIndex)
  if (first >= 0) gotoMeasure(first)
}
function renderEvent() {
  const ev = currentEvent()
  el('picked-note').hidden = true
  highlightMarks()
  Array.from(el('events').children).forEach((button, i) =>
    button.setAttribute('aria-pressed', String(i === eventIndex))
  )
  const values = ev?.notes || []
  const rhythms = [...new Set(values.map((n) => n.rhythm).filter(Boolean))]
  text(
    'rhythm',
    ev
      ? [
          rhythms.length > 1 ? values.map((n) => n.name + ' · ' + n.rhythm).join(' / ') : ev.rhythm,
          ev.technique
        ]
          .filter(Boolean)
          .join('. ')
      : 'This measure has no readable attacks.'
  )
  text(
    'fingers',
    values.length
      ? values
          .map((n) => {
            const hand =
              n.hand === 'left' ? 'Left hand' : n.hand === 'right' ? 'Right hand' : 'Hand unmarked'
            const finger = n.finger
              ? 'finger ' + n.finger + ' (' + n.fingeringSource + ')'
              : 'fingering unavailable'
            return n.name + ' · ' + hand + ' · ' + finger
          })
          .join('  /  ')
      : 'Rest both hands if no earlier notes are still sounding.'
  )
  drawKeys(soundingAt(score, measureIndex, eventIndex))
  el('play').disabled = !score?.measures.some((bar) => bar.events.length)
}
const white = [0, 2, 4, 5, 7, 9, 11]
function drawKeys(notes) {
  paintPiano(el('keyboard'), notes, keyboardRange(score, measureIndex))
}
function paintPiano(keyboard, notes, { low, high }) {
  const active = new Map(notes.map((n) => [n.midi, n]))
  keyboard.replaceChildren()
  const count = Array.from({ length: high - low + 1 }, (_, i) => i + low).filter((m) =>
    white.includes(m % 12)
  ).length
  let drawn = 0
  for (let midi = low; midi <= high; midi++) {
    const natural = white.includes(midi % 12)
    const key = make('span', natural ? 'white-key' : 'black-key')
    if (natural) drawn++
    else {
      key.style.left = (100 * drawn) / count + '%'
      key.style.width = 61 / count + '%'
    }
    if (active.has(midi)) {
      key.classList.add('pressed')
      if (active.get(midi).held) key.classList.add('held')
      key.append(make('span', 'key-label', active.get(midi).finger || '•'))
    } else if (midi % 12 === 0) {
      key.append(make('span', 'key-label', 'C' + (Math.floor(midi / 12) - 1)))
    }
    keyboard.append(key)
  }
  keyboard.setAttribute(
    'aria-label',
    'Piano keys · ' + (notes.map((n) => n.name + (n.held ? ' held' : '')).join(', ') || 'rest')
  )
}
function gotoMeasure(index) {
  stopPlayback()
  measureIndex = index
  eventIndex = 0
  renderMeasure()
}
el('prev').onclick = () => gotoMeasure(measureIndex - 1)
el('next').onclick = () => gotoMeasure(measureIndex + 1)
el('measure').onchange = () => gotoMeasure(Number(el('measure').value))
function secondsPerQuarter() {
  return 60 / Math.max(30, Math.min(200, Number(el('tempo').value) || 72))
}
el('tempo').onchange = () => {
  stopPlayback()
  el('tempo').value = Math.round(60 / secondsPerQuarter())
}
async function audioReady() {
  audio ??= new (window.AudioContext || window.webkitAudioContext)()
  if (audio.state !== 'running') await audio.resume()
}
const sounding = new Set()
function sound(note, when, length, volume) {
  if (!Number.isFinite(note.midi) || length <= 0) return
  const osc = audio.createOscillator(),
    gain = audio.createGain()
  const end = when + Math.max(0.065, length),
    peak = 0.18 / Math.sqrt(Math.max(1, volume))
  osc.type = 'triangle'
  osc.frequency.value = 440 * 2 ** ((note.midi - 69) / 12)
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.012)
  gain.gain.exponentialRampToValueAtTime(peak * 0.38, Math.min(end - 0.02, when + 0.2))
  gain.gain.exponentialRampToValueAtTime(0.0001, end)
  osc.connect(gain).connect(audio.destination)
  sounding.add(osc)
  osc.onended = () => {
    sounding.delete(osc)
    osc.disconnect()
    gain.disconnect()
  }
  osc.start(when)
  osc.stop(end + 0.01)
}
async function audition(event) {
  const generation = soundGeneration
  try {
    await audioReady()
    if (generation === soundGeneration)
      event.notes.forEach((n) =>
        sound(
          n,
          audio.currentTime + 0.02,
          Math.min(2, (n.duration ?? event.duration) * secondsPerQuarter()),
          event.notes.length
        )
      )
  } catch {
    notify('Sound is unavailable in this browser.')
  }
}
function stopPlayback() {
  soundGeneration++
  if (transport) {
    clearInterval(transport.timer)
    transport = null
  }
  for (const osc of sounding) {
    try {
      osc.stop()
    } catch {}
  }
  el('play').querySelector('i').innerHTML = icon('play')
  el('play').querySelector('span').textContent = 'Play passage'
}
async function play() {
  if (transport) {
    stopPlayback()
    return
  }
  stopPlayback()
  const session = { timer: 0 }
  transport = session
  try {
    await audioReady()
  } catch {
    stopPlayback()
    notify('Sound is unavailable in this browser.')
    return
  }
  if (transport !== session) return
  const playback = buildPlayback(score, measureIndex, eventIndex),
    seconds = secondsPerQuarter()
  let nextSound = 0,
    nextHighlight = 0,
    lastKeys = ''
  const start = audio.currentTime + 0.06
  el('play').querySelector('i').innerHTML = icon('stop')
  el('play').querySelector('span').textContent = 'Stop playback'
  function tick() {
    const now = (audio.currentTime - start) / seconds
    while (
      nextSound < playback.tones.length &&
      playback.tones[nextSound].time <= now + 0.15 / seconds
    ) {
      const tone = playback.tones[nextSound++]
      sound(
        tone,
        Math.max(audio.currentTime + 0.002, start + tone.time * seconds),
        tone.duration * seconds,
        playback.activeAt(tone.time).length
      )
    }
    while (
      nextHighlight < playback.timeline.length &&
      playback.timeline[nextHighlight].time <= now
    ) {
      const { m, index } = playback.timeline[nextHighlight++],
        changed = m !== measureIndex
      measureIndex = m
      eventIndex = index
      changed ? renderMeasure() : renderEvent()
    }
    if (now >= 0) {
      const keys = playback.activeAt(now),
        stamp = measureIndex + '|' + keys.map((n) => n.midi + '-' + n.held).join(',')
      if (stamp !== lastKeys) {
        drawKeys(keys)
        lastKeys = stamp
      }
    }
    if (now >= playback.duration) {
      stopPlayback()
      gotoMeasure(0)
    }
  }
  session.timer = setInterval(tick, 35)
  tick()
}
el('play').onclick = play
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    teacher.stop()
    stopPlayback()
  }
})

async function thumbnail(url) {
  if (!url) return null
  const img = new Image()
  img.src = url
  await img.decode()
  const scale = Math.min(1, 800 / Math.max(img.width, img.height)),
    canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.67)
}
el('save').onclick = async () => {
  if (!score) return
  const item = { id: pieceId, score, sample: builtIn, preview: null }
  if ([...savedPdfs, ...library()].some((p) => p.id === item.id)) {
    notify('Already saved on this device.')
    return
  }
  try {
    if (item.score.pages?.length) {
      await savePdf(item)
      savedPdfs = await pdfSummaries()
    } else {
      if (!item.sample) item.preview = await thumbnail(savedPreview)
      const pieces = library().filter((p) => p.id !== item.id)
      localStorage.setItem(storageKey, JSON.stringify([item, ...pieces]))
    }
    updateSave()
    notify('Piece saved on this device.')
  } catch {
    notify('Could not save this piece. Device storage may be full or unavailable.')
  }
}
async function renderLibrary() {
  const request = ++libraryRead
  try {
    const summaries = await pdfSummaries()
    if (request !== libraryRead) return
    savedPdfs = summaries.sort((a, b) => b.savedAt - a.savedAt)
  } catch {
    if (request !== libraryRead) return
    if (savedPdfs.length) notify('Saved PDFs could not be read from this browser.')
  }
  const list = el('saved-list')
  list.replaceChildren()
  for (const entry of [...savedPdfs, ...library()]) {
    const card = make('article', 'library-item'),
      info = make('div')
    info.append(
      make('strong', '', entry.score?.title || entry.title || 'Scanned passage'),
      make(
        'p',
        '',
        (entry.score?.measures.length ?? entry.measures) +
          ' measures · ' +
          (entry.score?.timeSignature ?? entry.timeSignature)
      )
    )
    const open = make('button', 'secondary', 'Open piece')
    open.onclick = async () => {
      let item
      try {
        item = entry.score ? entry : await readPdf(entry.id)
        if (!item) throw new Error('Missing piece')
      } catch {
        notify('This saved piece could not be opened.')
        return
      }
      if (location.hash !== '#library' || request !== libraryRead) return
      capture.stop()
      frame = item.preview || null
      frameBlob = null
      loadedFromLibrary = true
      frameMatches = true
      if (frame) el('photo').src = frame
      setScore(item.score, item.id, item.sample, frame)
      onState('idle')
      el('rescan').hidden = true
      text(
        'scan-message',
        item.sample
          ? 'Frame the clefs and one full system of music.'
          : 'Showing your saved passage.'
      )
      location.hash = 'reader'
    }
    const remove = make('button', 'link-button', 'Remove')
    remove.onclick = async () => {
      if (!confirm('Remove this piece from this device?')) return
      try {
        if (entry.score)
          localStorage.setItem(
            storageKey,
            JSON.stringify(library().filter((p) => p.id !== entry.id))
          )
        else await removePdf(entry.id)
        await renderLibrary()
        updateSave()
      } catch {
        notify('Device storage is unavailable.')
      }
    }
    const actions = make('div')
    actions.append(open, remove)
    card.append(info, actions)
    list.append(card)
  }
  if (!list.children.length) {
    const empty = make('div', 'empty'),
      link = make('a', '', 'Open reader')
    link.href = '#reader'
    empty.append(
      make('h2', '', 'Your practice shelf is empty'),
      make('p', '', 'Use the bookmark in the passage guide to save a piece here.'),
      link
    )
    list.append(empty)
  }
}
const follower = initFollow(el('follow-panel'))
const teacher = initTeacher({
  paintPiano,
  silence: stopPlayback,
  hear: (notes) =>
    audition({ notes: notes.map((note) => ({ ...note, duration: 0.5 / secondsPerQuarter() })) }),
  beginPractice() {
    el('lesson-source').value = 'scale'
    loadFollow({ useLessonHand: true })
    location.hash = 'follow'
  }
})
function loadFollow({ useLessonHand = false } = {}) {
  const source = el('lesson-source')
  if (source.value === 'scale') teacher.open()
  const scale = teacher.score()
  source.options[0].textContent = score?.title || 'Current passage'
  source.options[1].textContent = scale.title
  if (source.value === 'scale') follower.load(scale, { useLessonHand })
  else if (score) follower.load(score, { passageId: pieceId })
}
el('lesson-source').onchange = () => loadFollow()
el('follow-score').onclick = () => {
  el('lesson-source').value = 'passage'
  location.hash = 'follow'
}
el('learn-detected').onclick = () => {
  teacher.selectFromScan(el('key').textContent)
  location.hash = 'keys'
}
const pages = ['reader', 'keys', 'follow', 'library']
function route() {
  const page = pages.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'reader'
  for (const name of pages) {
    el(name).hidden = name !== page
    el('nav-' + name).setAttribute('aria-current', name === page ? 'page' : 'false')
  }
  if (page !== 'reader') capture.stop()
  if (page !== 'follow') follower.leave()
  teacher.stop()
  stopPlayback()
  if (page === 'library') renderLibrary()
  if (page === 'keys') teacher.open()
  if (page === 'follow') loadFollow()
  window.scrollTo(0, 0)
}
window.addEventListener('hashchange', route)
route()
try {
  const res = await fetch(new URL('./example.json', import.meta.url))
  if (!res.ok) throw Error()
  const example = await res.json()
  if (!score) {
    setScore(example, 'morning-walk', true, null)
    if (!frame && !cameraActive && !cameraPending) onState('idle')
  }
} catch {
  notify('The example is unavailable. You can still scan a passage.')
}
