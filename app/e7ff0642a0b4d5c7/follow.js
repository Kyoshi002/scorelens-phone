import { createPianoInput } from './listen.js'
import { buildPlayback } from './practice.js'

const LOOKAHEAD = 6
const CONFIRMATION_MS = 105
const EPSILON = 1e-8
const WHITE_KEYS = new Set([0, 2, 4, 5, 7, 9, 11])
const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const pitchName = (midi) => PITCH_NAMES[midi % 12] + (Math.floor(midi / 12) - 1)

export function buildFollowChart(score, hand = 'both') {
  // Start at the bar line so a leading rest or MusicXML forward keeps its time.
  const playable = buildPlayback(score, 0, -1)
  const tones = playable.tones
    .filter(
      (note) =>
        Number.isInteger(note.midi) &&
        note.midi >= 0 &&
        note.midi <= 127 &&
        (hand === 'both' || note.hand === hand)
    )
    .sort((first, second) => first.time - second.time || first.midi - second.midi)
  const steps = []
  let sounding = []
  let index = 0
  let start = 0
  const measures = (score?.measures ?? []).map((measure, i) => {
    const entry = { start, number: measure.number ?? i + 1 }
    start += Number.isFinite(measure.duration) ? Math.max(0, measure.duration) : 0
    return entry
  })
  for (let i = 0; i < tones.length; ) {
    const time = tones[i].time
    while (index + 1 < measures.length && measures[index + 1].start <= time + EPSILON) index += 1
    sounding = sounding.filter((note) => note.time + note.duration > time + EPSILON)
    const notes = []
    while (i < tones.length && Math.abs(tones[i].time - time) < EPSILON) notes.push(tones[i++])
    const expected = new Set(notes.map((note) => note.midi))
    const allowedHeld = new Set(
      sounding.map((note) => note.midi).filter((midi) => !expected.has(midi))
    )
    steps.push({ time, notes, expected, allowedHeld, measure: measures[index]?.number })
    sounding.push(...notes)
  }
  return { steps, tones, measures, duration: playable.duration }
}

export function judgeFollowInput(step, last, packet) {
  const active = new Set(packet.active)
  const attacks = new Set(packet.attacks)
  const carried = new Set(
    [...last.carried].filter((midi) => active.has(midi) && !attacks.has(midi))
  )
  const wrong = [...attacks].filter((midi) => !step.expected.has(midi))
  const extra = [...active].filter((midi) => !step.expected.has(midi) && !carried.has(midi))
  const fresh = new Set()
  if (!wrong.length && !extra.length) {
    for (const midi of step.expected) {
      if (active.has(midi) && (attacks.has(midi) || last.fresh.has(midi))) fresh.add(midi)
    }
  }
  return {
    fresh,
    carried,
    wrong,
    extra,
    complete: !wrong.length && !extra.length && fresh.size === step.expected.size
  }
}

export function createFollowConfirmation(advance) {
  let pending = null
  let dueInAudio = null
  function cancel() {
    clearTimeout(pending)
    pending = null
    dueInAudio = null
  }
  function observe(match, audioTime) {
    if (!match) cancel()
    else if (audioTime !== undefined) dueInAudio ??= audioTime + CONFIRMATION_MS
    else if (pending === null) {
      pending = setTimeout(() => {
        pending = null
        advance()
      }, CONFIRMATION_MS)
    }
  }
  function beforeAudioFrame(time) {
    // The previous state lasted until this frame. Delayed UI callbacks cannot
    // turn a short-lived octave harmonic into a completed microphone step.
    if (dueInAudio !== null && time >= dueInAudio) {
      dueInAudio = null
      advance()
    }
  }
  return { observe, beforeAudioFrame, cancel }
}

function keyGeometry(tones, step, narrow) {
  const first = step?.time ?? 0
  const lanes = tones.filter(
    (note) => note.time < first + LOOKAHEAD && note.time + note.duration > first + EPSILON
  )
  const pitches = lanes.map((note) => note.midi)
  const required = step ? [...step.expected, ...step.allowedHeld] : []
  const width = narrow ? 27 : 39
  const center = required.length ? (Math.min(...required) + Math.max(...required)) / 2 : 60
  const candidates = pitches.length ? pitches : [48, 72]
  const useful = candidates.filter((midi) => Math.abs(midi - center) <= width / 2)
  const visible = [...required, ...useful]
  const floor = visible.length ? Math.min(...visible) : center
  const ceiling = visible.length ? Math.max(...visible) : center
  let low = Math.max(0, Math.floor(Math.min(floor - 1, (floor + ceiling - 19) / 2)))
  let high = Math.min(127, Math.ceil(Math.max(ceiling + 1, (floor + ceiling + 19) / 2)))
  while (low > 0 && !WHITE_KEYS.has(low % 12)) low -= 1
  while (high < 127 && !WHITE_KEYS.has(high % 12)) high += 1
  const whites = Array.from({ length: high - low + 1 }, (_, i) => i + low).filter((midi) =>
    WHITE_KEYS.has(midi % 12)
  ).length
  let whiteIndex = 0
  const keys = new Map()
  for (let midi = low; midi <= high; midi += 1) {
    const white = WHITE_KEYS.has(midi % 12)
    const size = white ? 1 : 0.6
    const center = white ? whiteIndex++ + 0.5 : whiteIndex
    keys.set(midi, { left: (100 * center) / whites, width: (100 * size) / whites, white })
  }
  return keys
}

function node(tag, className, content = '') {
  const element = document.createElement(tag)
  element.className = className
  element.textContent = content
  return element
}

function describeNotes(notes, includeFinger) {
  return notes
    .map((note) => {
      const hand = note.hand === 'left' || note.hand === 'right' ? note.hand + ' ' : ''
      const origin =
        note.fingeringSource === 'suggested' || note.fingeringSource === 'printed'
          ? ' (' + note.fingeringSource + ')'
          : ''
      const finger = includeFinger && note.finger ? hand + 'finger ' + note.finger + origin : ''
      return (note.name || pitchName(note.midi)) + (finger ? ' · ' + finger : '')
    })
    .join('  /  ')
}

export function initFollow(container) {
  container.innerHTML = `
    <div class="follow-controls">
      <label>Input<select class="follow-source"><option value="mic">Microphone</option><option value="midi">MIDI keyboard</option></select></label>
      <label>Hands<select class="follow-hands"><option value="both">Both hands</option><option value="right">Right hand</option><option value="left">Left hand</option></select></label>
      <div class="follow-buttons"><button class="follow-start" type="button">Start</button><button class="follow-reset" type="button">Reset</button></div>
    </div>
    <div class="follow-stage">
      <div class="follow-stage-top">
        <div class="follow-legend"><span class="follow-r">Right hand</span><span class="follow-l">Left hand</span></div>
        <span class="follow-progress"></span>
      </div>
      <div class="follow-roll" aria-hidden="true"><div class="follow-lanes"></div><div class="follow-cursor"></div></div>
      <div class="follow-keyboard" aria-hidden="true"></div>
    </div>
    <div class="follow-readout">
      <div><span class="follow-label">Play now</span><strong class="follow-now">—</strong></div>
      <div><span class="follow-label">Up next</span><strong class="follow-next">—</strong></div>
    </div>
    <p class="follow-fingers">Fingers are numbered from thumb (1) to little finger (5) on each hand.</p>
    <p class="follow-status" role="status" aria-live="polite"></p>
  `
  const find = (name) => container.querySelector('.follow-' + name)
  const source = find('source')
  const hands = find('hands')
  const start = find('start')
  const reset = find('reset')
  const stage = find('stage')
  const roll = find('roll')
  const keyboard = find('keyboard')
  const lanes = find('lanes')
  const progress = find('progress')
  const now = find('now')
  const next = find('next')
  const status = find('status')
  const passageHands = new Map()
  let score = null
  let passageId = null
  let chart = buildFollowChart(null)
  let index = 0
  let mode = 'stopped'
  let sequence = 0
  let gate = { fresh: new Set(), carried: new Set() }
  let active = new Set()
  let mistakes = new Set()
  let keyNodes = new Map()
  let narrow = false
  let animation = null
  const confirmation = createFollowConfirmation(advance)

  if (!navigator.mediaDevices?.getUserMedia && navigator.requestMIDIAccess) source.value = 'midi'

  function report(message, isError = false) {
    if (status.textContent !== message) status.textContent = message
    status.classList.toggle('follow-error', isError)
  }

  function clearInput(activeAtPreviousStep = []) {
    confirmation.cancel()
    const current = chart.steps[index]
    gate = {
      fresh: new Set(),
      carried: new Set(activeAtPreviousStep.filter((midi) => current?.allowedHeld.has(midi)))
    }
    active = new Set(activeAtPreviousStep)
    mistakes = new Set()
  }

  function highlightKeys() {
    const current = chart.steps[index]
    for (const [midi, key] of keyNodes) {
      const expectedHand = current?.notes.find((note) => note.midi === midi)?.hand
      key.classList.toggle('follow-expected', Boolean(current?.expected.has(midi)))
      key.classList.toggle('follow-expected-left', expectedHand === 'left')
      key.classList.toggle('follow-pressed', active.has(midi))
      key.classList.toggle('follow-wrong', mistakes.has(midi))
    }
  }

  function render(previousTime = null) {
    const step = chart.steps[index]
    const future = chart.steps[index + 1]
    const done = chart.steps.length > 0 && !step
    const time = step?.time ?? (done ? chart.duration : 0)
    const total = chart.steps.length
    progress.textContent = step
      ? 'Measure ' + step.measure + ' · ' + (index + 1) + ' of ' + total
      : done
        ? total + ' of ' + total + ' complete'
        : 'No notes loaded'
    now.textContent = step ? describeNotes(step.notes, true) : done ? 'Complete' : '—'
    next.textContent = future ? describeNotes(future.notes, false) : '—'
    start.disabled = !step
    reset.disabled = !total

    const geometry = keyGeometry(chart.tones, step, narrow)
    const keys = document.createDocumentFragment()
    const notes = document.createDocumentFragment()
    keyNodes = new Map()
    for (const [midi, key] of geometry) {
      if (key.white) {
        const divider = node('span', 'follow-lane')
        divider.style.left = key.left - key.width / 2 + '%'
        notes.append(divider)
      }
      const el = node(
        'span',
        'follow-key ' + (key.white ? 'follow-white' : 'follow-black'),
        midi % 12 === 0 ? pitchName(midi) : ''
      )
      el.style.left = key.left + '%'
      el.style.width = key.width + '%'
      keyNodes.set(midi, el)
      keys.append(el)
    }
    for (let beat = Math.floor(time); beat < time + LOOKAHEAD; beat += 1) {
      if (beat <= time + EPSILON) continue
      const line = node('span', 'follow-beat')
      line.style.bottom = ((beat - time) / LOOKAHEAD) * 100 + '%'
      notes.append(line)
    }
    for (const measure of chart.measures) {
      if (measure.start <= time + EPSILON || measure.start >= time + LOOKAHEAD) continue
      const marker = node('span', 'follow-measure-mark', String(measure.number))
      marker.style.bottom = ((measure.start - time) / LOOKAHEAD) * 100 + '%'
      notes.append(marker)
    }
    for (const note of chart.tones) {
      if (note.time >= time + LOOKAHEAD) break
      const end = note.time + note.duration
      const key = geometry.get(note.midi)
      if (!key || end <= time + EPSILON) continue
      const bar = node(
        'span',
        'follow-note follow-note-' + (note.hand || 'unknown'),
        note.finger || ''
      )
      bar.classList.toggle('follow-at-line', Math.abs(note.time - time) < EPSILON)
      bar.style.left = key.left + '%'
      bar.style.width = key.width * (key.white ? 0.78 : 0.86) + '%'
      bar.style.bottom = ((note.time - time) / LOOKAHEAD) * 100 + '%'
      bar.style.height = (note.duration / LOOKAHEAD) * 100 + '%'
      bar.title = describeNotes([note], true)
      notes.append(bar)
    }
    lanes.replaceChildren(notes)
    keyboard.replaceChildren(keys)
    highlightKeys()
    animation?.cancel()
    if (
      previousTime !== null &&
      !done &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      const distance = Math.min(100, ((time - previousTime) / LOOKAHEAD) * 100)
      animation = lanes.animate(
        [{ transform: 'translateY(-' + distance + '%)' }, { transform: 'translateY(0)' }],
        { duration: 210, easing: 'cubic-bezier(.18,.64,.33,1)' }
      )
    }
  }

  function showWaiting() {
    report(
      chart.steps[index]?.expected.size > 1
        ? 'Play the marked notes together.'
        : 'Play the marked note.'
    )
  }

  function advance() {
    const previousTime = chart.steps[index].time
    const previousActive = [...active]
    index += 1
    clearInput(previousActive)
    render(previousTime)
    if (chart.steps[index]) showWaiting()
    else {
      stop()
      report('Practice complete. Reset to play it again.')
    }
  }

  function onNotes(packet, audioTime) {
    const current = chart.steps[index]
    if (mode !== 'listening' || !current) return
    active = new Set(packet.active)
    gate = judgeFollowInput(current, gate, packet)
    mistakes = new Set([...gate.extra, ...gate.wrong])
    highlightKeys()
    confirmation.observe(gate.complete, audioTime)
    if (gate.complete) return
    if (gate.wrong.length) {
      report(
        'Wrong note: ' + gate.wrong.map(pitchName).join(', ') + '. Try the marked notes again.',
        true
      )
    } else if (gate.extra.length) {
      report(
        'Release ' + gate.extra.map(pitchName).join(', ') + ', then play the marked notes.',
        true
      )
    } else if (gate.fresh.size) {
      const missing = [...current.expected].filter((midi) => !gate.fresh.has(midi))
      if (
        source.value === 'mic' &&
        current.expected.size === 2 &&
        gate.fresh.has(missing[0] - 12)
      ) {
        report(
          'I hear the lower note. Bring out ' +
            pitchName(missing[0]) +
            ' and play the octave again.'
        )
      } else {
        report('Hold those notes and add ' + missing.map(pitchName).join(', ') + '.')
      }
    } else {
      showWaiting()
    }
  }

  const input = createPianoInput({
    onNotes,
    beforeAudioFrame: confirmation.beforeAudioFrame,
    onStatus(message) {
      if (mode !== 'stopped') report(message)
    },
    onEnded(reason) {
      if (mode === 'stopped') return
      stop()
      report(reason || 'Input stopped. Start it again when ready.')
    }
  })

  function stop() {
    sequence += 1
    const wasListening = mode !== 'stopped'
    mode = 'stopped'
    input.stop()
    start.textContent = 'Start'
    clearInput()
    highlightKeys()
    return wasListening
  }

  function readyMessage() {
    if (chart.steps[index]) {
      report(
        source.value === 'mic'
          ? 'Use an acoustic piano or a keyboard with speakers. Quiet surroundings help the microphone hear each note.'
          : 'Connect a MIDI keyboard, then press Start.'
      )
    } else if (chart.steps.length) {
      report('Practice complete. Reset to play it again.')
    } else {
      report(
        score
          ? 'There are no playable notes for these hands.'
          : 'Choose a scale or open a score to practice.'
      )
    }
  }

  async function toggleStart() {
    if (mode !== 'stopped') {
      stop()
      report('Paused. Press Start to continue.')
      return
    }
    if (!chart.steps[index]) return
    const request = ++sequence
    mode = 'starting'
    start.textContent = 'Cancel'
    report('Opening ' + (source.value === 'mic' ? 'the microphone' : 'the MIDI connection') + '…')
    try {
      const started = await input.start(source.value)
      if (request !== sequence) return
      if (!started) {
        stop()
        report('Input did not start. Check your connection or permissions and try again.', true)
        return
      }
      mode = 'listening'
      start.textContent = 'Pause'
      if (source.value === 'midi') showWaiting()
    } catch {
      if (request !== sequence) return
      stop()
      report('Input could not start. Check your connection or permissions and try again.', true)
    }
  }

  function load(nextScore, { passageId: nextPassageId = null, useLessonHand = false } = {}) {
    const lessonHand = nextScore?.lessonHand
    const sameMaterial = nextScore === score && nextPassageId === passageId
    if (sameMaterial && (!useLessonHand || hands.value === lessonHand)) return
    score = nextScore
    passageId = nextPassageId
    for (const option of hands.options) {
      option.disabled = Boolean(lessonHand && lessonHand !== 'both' && option.value !== lessonHand)
    }
    hands.value = lessonHand ?? passageHands.get(passageId) ?? 'both'
    rewind()
  }

  function rewind() {
    stop()
    chart = buildFollowChart(score, hands.value)
    index = 0
    clearInput()
    render()
    readyMessage()
  }

  start.addEventListener('click', toggleStart)
  reset.addEventListener('click', rewind)
  hands.addEventListener('change', () => {
    if (passageId) passageHands.set(passageId, hands.value)
    rewind()
  })
  source.addEventListener('change', () => {
    stop()
    readyMessage()
  })
  new ResizeObserver(() => {
    const nextNarrow = roll.clientWidth > 0 && roll.clientWidth < 465
    if (nextNarrow !== narrow) {
      narrow = nextNarrow
      render()
    }
  }).observe(stage)
  rewind()

  return {
    load,
    leave() {
      if (stop()) readyMessage()
    }
  }
}
