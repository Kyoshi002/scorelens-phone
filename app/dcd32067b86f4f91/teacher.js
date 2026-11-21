import { keys, keysForScore, makeScaleScore } from './keys.js'
import { recognitionClue } from './key-reading.js'

export function initTeacher({ hear, silence, paintPiano, beginPractice }) {
  const el = (id) => document.getElementById(id)
  let selected = keys.find((key) => key.id === 'c-major'),
    hand = 'both',
    scaleScore,
    events,
    degree = 0
  let interval = null
  const button = (label, action) => {
    const item = document.createElement('button')
    item.textContent = label
    item.onclick = action
    return item
  }
  function stopDemo() {
    clearInterval(interval)
    interval = null
    el('hear-scale').querySelector('span').textContent = 'Hear scale'
  }
  function showDegree(index) {
    degree = index
    Array.from(el('scale-notes').children).forEach((item, i) =>
      item.setAttribute('aria-pressed', String(i === index))
    )
    const notes = events[index].notes,
      scaleNotes = events.slice(0, 8).flatMap((event) => event.notes),
      lowest = Math.min(...scaleNotes.map((n) => n.midi)),
      highest = Math.max(...scaleNotes.map((n) => n.midi))
    const low = 12 * Math.floor(lowest / 12),
      high = Math.max(low + 23, 12 * Math.floor(highest / 12) + 11)
    paintPiano(el('scale-piano'), notes, { low, high })
    const fingers = ['', 'thumb', 'index', 'middle', 'ring', 'little']
    el('scale-instruction').textContent = notes
      .map(
        (note) =>
          `${note.hand === 'right' ? 'Right' : 'Left'} hand · ${note.name} · suggested finger ${note.finger} (${fingers[note.finger]})`
      )
      .join('  /  ')
  }
  function select(key, initialDegree = 0) {
    stopDemo()
    silence()
    selected = key
    scaleScore = makeScaleScore(key.id, hand)
    events = scaleScore.measures.flatMap((bar) => bar.events)
    el('mode-major').setAttribute('aria-pressed', String(key.mode === 'major'))
    el('mode-minor').setAttribute('aria-pressed', String(key.mode === 'minor'))
    el('key-options').replaceChildren(
      ...keys
        .filter((k) => k.mode === key.mode)
        .map((k) => {
          const item = button(k.tonic, () => select(k))
          item.title = k.label
          item.setAttribute('aria-label', k.label)
          item.setAttribute('aria-pressed', String(key.id === k.id))
          return item
        })
    )
    el('lesson-name').textContent = key.label
    const notation = el('scale-notation').querySelector('img')
    notation.src = new URL('./scales/' + key.id + '.svg', import.meta.url)
    notation.alt = `${key.label} ascending on treble and bass staves. ${key.signature}. ${key.scale.join(', ')}. Suggested fingerings. Right hand ${key.fingering.right.join(' ')}. Left hand ${key.fingering.left.join(' ')}.`
    el('signature-clue').textContent =
      'Look between the clef and the 4/4 on either staff. ' + recognitionClue(key)
    el('lesson-explanation').textContent = key.lesson
    el('lesson-sig').textContent = key.signature
    el('lesson-triad').textContent = key.triad.join(' · ')
    el('step-pattern').textContent = key.formula + ' · W is a whole step. H is a half step.'
    el('scale-notes').replaceChildren(
      ...events.slice(0, 8).map((event, i) => {
        const item = button('', () => {
          stopDemo()
          silence()
          showDegree(i)
          hear(event.notes)
        })
        const label = document.createElement('small'),
          pitch = document.createElement('strong')
        label.textContent = 'Deg. ' + (i + 1)
        pitch.textContent = key.scale[i]
        item.append(label, pitch)
        item.setAttribute(
          'aria-label',
          'Hear ' + event.notes.map((note) => note.name).join(' and ') + ', degree ' + (i + 1)
        )
        return item
      })
    )
    showDegree(initialDegree)
  }
  function chooseMode(mode) {
    if (mode === selected.mode) return
    select(
      keys.find((key) => key.id === selected.relativeId) || keys.find((key) => key.mode === mode)
    )
  }
  function selectFromScan(label) {
    const context = keysForScore(label)
    const strip = el('linked-keys')
    strip.hidden = !context.keys.length
    strip.replaceChildren()
    if (context.keys.length) {
      strip.append(
        context.keys.length > 1 ? 'This signature fits both keys. Explore ' : 'From your passage · '
      )
      context.keys.forEach((key) => strip.append(button(key.label, () => select(key))))
      select(context.keys[0])
    }
  }
  el('mode-major').onclick = () => chooseMode('major')
  el('mode-minor').onclick = () => chooseMode('minor')
  el('scale-hand').onchange = () => {
    hand = el('scale-hand').value
    select(selected, degree)
  }
  el('hear-scale').onclick = () => {
    if (interval !== null) {
      stopDemo()
      silence()
      return
    }
    silence()
    let i = 0
    const tick = () => {
      if (i >= events.length) {
        stopDemo()
        return
      }
      showDegree(i < 8 ? i : 14 - i)
      hear(events[i].notes)
      i++
    }
    tick()
    interval = setInterval(tick, 550)
    el('hear-scale').querySelector('span').textContent = 'Stop scale'
  }
  el('practice-scale').onclick = () => {
    stopDemo()
    silence()
    beginPractice()
  }
  // Defer initialization until the rest of the reader has its audio state.
  return {
    open() {
      if (!scaleScore) select(selected)
    },
    selectFromScan,
    score() {
      return scaleScore ?? makeScaleScore(selected.id, hand)
    },
    stop: stopDemo,
    match: keysForScore
  }
}
