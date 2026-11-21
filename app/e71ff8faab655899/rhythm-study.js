const QUARTER = 12
const note = (pitch, ticks, marks = {}) => ({ pitch, ticks, ...marks })
const rest = (ticks) => ({ ticks })
const quarters = (...pitches) => pitches.map((pitch) => note(pitch, QUARTER))
const eighths = (...pitches) => pitches.map((pitch) => note(pitch, QUARTER / 2))
const triplet = (...pitches) =>
  pitches.map((pitch, index) =>
    note(pitch, QUARTER / 3, { triplet: ['start', 'middle', 'stop'][index] })
  )

export const rhythmLessons = [
  {
    id: 'four-four',
    title: 'Four beats · 4/4',
    label: '4/4 · Four beats',
    clue: 'The top 4 gives four beats per bar. The bottom 4 gives each quarter note one beat. At the vertical barline, start counting from 1 again. The higher click marks that first beat.',
    meter: [4, 4],
    pulse: 12,
    bars: [quarters('C4', 'D4', 'E4', 'G4'), quarters('E4', 'D4', 'C4', 'C4')]
  },
  {
    id: 'three-four',
    title: 'Three beats · 3/4',
    label: '3/4 · Three beats',
    clue: 'The top 3 gives three beats per bar. The bottom 4 means quarter-note beats. Count 1, 2, 3, with the first beat stronger, as in a waltz.',
    meter: [3, 4],
    pulse: 12,
    bars: [quarters('C4', 'E4', 'G4'), quarters('D4', 'F4', 'E4')]
  },
  {
    id: 'six-eight',
    title: 'Two groups of three · 6/8',
    label: '6/8 · Two beats',
    clue: 'The top 6 counts six units per bar, and the bottom 8 makes each unit an eighth note. Feel two larger beats and count “1 la li, 2 la li.” A dot beside the notehead adds half its length, so a dotted quarter lasts three eighths.',
    meter: [6, 8],
    pulse: 18,
    subdivision: ['la', 'li'],
    bars: [eighths('C4', 'D4', 'E4', 'G4', 'F4', 'E4'), [note('D4', 18), ...eighths('G4', 'E4', 'C4')]]
  },
  {
    id: 'rests',
    title: 'Rests',
    clue: 'A quarter note or rest lasts one beat, an eighth lasts half a beat, and a half note lasts two. Keep counting through the rests. In the first bar, play on 1, leave 2 empty, and return on 3.',
    meter: [4, 4],
    pulse: 12,
    subdivision: ['&'],
    bars: [
      [note('E4', 12), rest(12), note('E4', 6), note('G4', 6), note('E4', 12)],
      [note('D4', 12), rest(6), note('D4', 6), note('C4', 24)]
    ]
  },
  {
    id: 'ties',
    title: 'Ties across the bar',
    label: 'Ties',
    clue: 'A tie joins two notes of the same pitch. Play G on beat 4, hold it through the next beat 1, then play E on beat 2.',
    meter: [4, 4],
    pulse: 12,
    bars: [
      [note('E4', 12), note('F4', 12), note('E4', 12), note('G4', 12, { tie: 'start' })],
      [note('G4', 12, { tie: 'stop' }), note('E4', 12), note('C4', 24)]
    ]
  },
  {
    id: 'accidentals',
    title: 'Sharps and naturals',
    label: 'Accidentals',
    clue: 'The sharp raises F by a semitone and also applies to the next F on the same staff line in that bar. A natural cancels the sharp. At a new bar, the key signature applies again.',
    meter: [4, 4],
    pulse: 12,
    bars: [
      [note('F4', 12), note('F#4', 12, { accidental: 'sharp' }), note('F#4', 12), note('F4', 12, { accidental: 'natural' })],
      [note('F#4', 12, { accidental: 'sharp' }), note('F#4', 12), note('G4', 24)],
      [note('F4', 24), note('E4', 24)]
    ]
  },
  {
    id: 'expression',
    title: 'Dynamics and articulation',
    label: 'Expression',
    clue: 'Play softly at p and louder at f. A staccato dot above or below a note makes it short. Give the accented note a stronger attack. Keep the beat steady.',
    meter: [4, 4],
    pulse: 12,
    bars: [
      [note('E4', 12, { dynamic: 'p', articulation: 'staccato' }), note('E4', 12, { articulation: 'staccato' }), note('G4', 12), note('E4', 12)],
      [note('E4', 12, { dynamic: 'f', articulation: 'accent' }), note('E4', 12, { articulation: 'staccato' }), note('G4', 12), note('E4', 12)]
    ]
  },
  {
    id: 'swing',
    title: 'Straight and swung eighths',
    label: 'Swing',
    clue: 'Straight eighths split the beat 1:1. This swing exercise uses a 2:1 long-short split, so the second eighth starts about two-thirds through the beat. Real swing ratios vary.',
    meter: [4, 4],
    pulse: 12,
    subdivision: ['&'],
    swing: true,
    bars: [eighths('C4', 'D4', 'E4', 'F4', 'G4', 'F4', 'E4', 'D4')]
  },
  {
    id: 'triplets',
    title: 'Eighth-note triplets',
    label: 'Triplets',
    clue: 'The bracketed 3 fits three equal notes into one quarter-note beat. Say “1 trip let” and tap all three evenly spaced notes.',
    meter: [4, 4],
    pulse: 12,
    subdivision: ['trip', 'let'],
    bars: [[...triplet('C4', 'D4', 'E4'), ...triplet('D4', 'E4', 'F4'), ...triplet('E4', 'F4', 'G4'), ...triplet('E4', 'D4', 'C4')]]
  }
]

function midiFor(pitch) {
  const [, step, accidental, octave] = /^([A-G])([#b]?)(\d)$/.exec(pitch)
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step]
  return (Number(octave) + 1) * 12 + semitone + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0)
}

export function rhythmTimeline(lesson, swing = lesson.swing) {
  const [beats, unit] = lesson.meter
  const barTicks = beats * (QUARTER * 4 / unit)
  const notes = []
  const counts = []
  let position = 0
  let level = 0.1
  const feelTime = (ticks) => swing && ticks % QUARTER === 6 ? ticks + 2 : ticks
  for (const bar of lesson.bars) {
    const barStart = position
    const subdivision = lesson.subdivision ?? []
    const step = lesson.pulse / (subdivision.length + 1)
    for (let offset = 0; offset < barTicks; offset += step) {
      const index = Math.round(offset / step)
      const part = index % (subdivision.length + 1)
      counts.push({
        tick: feelTime(barStart + offset),
        label: part ? subdivision[part - 1] : String(1 + Math.floor(offset / lesson.pulse)),
        pulse: part === 0,
        first: offset === 0
      })
    }
    for (const event of bar) {
      const start = feelTime(position)
      position += event.ticks
      if (!event.pitch) continue
      if (event.dynamic) level = event.dynamic === 'p' ? 0.055 : 0.145
      const length = feelTime(position) - start
      if (event.tie === 'stop') {
        notes.at(-1).length += length
        continue
      }
      notes.push({
        start,
        length: event.articulation === 'staccato' ? length * 0.46 : length,
        midi: midiFor(event.pitch),
        level: event.articulation === 'accent' ? level * 1.35 : level
      })
    }
  }
  return { notes, counts, length: position, barTicks }
}

export function gradeRhythmTap(targets, hits, time, tolerance) {
  let closest = -1
  let distance = tolerance
  for (let index = 0; index < targets.length; index++) {
    const delta = Math.abs(targets[index] - time)
    if (!hits.has(index) && delta <= distance) {
      closest = index
      distance = delta
    }
  }
  return closest < 0 ? null : { index: closest, offset: time - targets[closest] }
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function button(className, text) {
  const node = element('button', className, text)
  node.type = 'button'
  return node
}

export function initRhythmStudy(root) {
  const study = element('section', 'rhythm-study')
  const heading = element('header', 'rhythm-heading')
  const title = element('h1', '', 'Learn rhythm')
  const introduction = element('p', '', 'Read the music, hear the example, then tap when each note begins.')
  heading.append(title, introduction)
  const controls = element('div', 'rhythm-controls')
  const topicLabel = element('label', '', 'Lesson')
  const topic = element('select')
  for (const lesson of rhythmLessons) {
    const option = element('option', '', lesson.label ?? lesson.title)
    option.value = lesson.id
    topic.append(option)
  }
  topicLabel.append(topic)
  const tempoLabel = element('label')
  const tempoUnit = element('span')
  const tempo = element('select')
  for (const bpm of [54, 72, 90, 108]) {
    const option = element('option', '', bpm + ' BPM')
    option.value = String(bpm)
    tempo.append(option)
  }
  tempo.value = '72'
  tempoLabel.append(tempoUnit, tempo)
  const feelLabel = element('label', '', 'Eighth-note feel')
  const feel = element('select')
  for (const [value, label] of [['swing', 'Swung'], ['straight', 'Straight']]) {
    const option = element('option', '', label)
    option.value = value
    feel.append(option)
  }
  feelLabel.append(feel)
  controls.append(topicLabel, tempoLabel, feelLabel)
  const clue = element('p', 'rhythm-clue')
  const notation = element('div', 'rhythm-notation')
  const image = element('img')
  notation.append(image)
  const counts = element('div', 'rhythm-counts')
  counts.setAttribute('aria-hidden', 'true')
  const actions = element('div', 'rhythm-actions')
  const listen = button('rhythm-listen', 'Hear example')
  const practice = button('rhythm-practice', 'Start tapping')
  const tap = button('rhythm-tap', 'Tap')
  actions.append(listen, practice, tap)
  const feedback = element('p', 'rhythm-feedback')
  feedback.setAttribute('aria-live', 'polite')
  const phase = element('p', 'rhythm-phase')
  phase.setAttribute('aria-hidden', 'true')
  study.append(heading, controls, clue, notation, counts, actions, phase, feedback)
  root.replaceChildren(study)
  let audio
  let session
  let lesson
  let timeline
  let highlighted = null

  function stop() {
    const previous = session
    session = null
    if (previous) {
      cancelAnimationFrame(previous.frame)
      for (const oscillator of previous.sounds) {
        try { oscillator.stop() } catch {}
      }
    }
    highlighted?.classList.remove('rhythm-current')
    highlighted = null
    listen.textContent = 'Hear example'
    practice.textContent = 'Start tapping'
    tap.disabled = true
    tap.hidden = true
    phase.textContent = ''
  }

  function render() {
    stop()
    lesson = rhythmLessons.find(({ id }) => id === topic.value)
    const swing = lesson.swing && feel.value === 'swing'
    timeline = rhythmTimeline(lesson, swing)
    clue.textContent = lesson.clue
    image.src = new URL('./rhythm-notation/' + lesson.id + '.svg', import.meta.url)
    image.alt = lesson.title + '. ' + lesson.clue
    feelLabel.hidden = !lesson.swing
    const unit = lesson.pulse === 18 ? 'dotted quarter' : 'quarter note'
    tempoUnit.textContent = 'Tempo · ' + unit
    const bars = []
    for (const count of timeline.counts) {
      if (count.first) bars.push(element('div', 'rhythm-count-bar'))
      const marker = element('span', count.pulse ? 'rhythm-pulse' : 'rhythm-subdivision', count.label)
      if (count.first) marker.classList.add('rhythm-downbeat')
      bars.at(-1).append(marker)
    }
    counts.replaceChildren(...bars)
    feedback.textContent = 'Tap note starts. Keep counting during rests and ties.'
  }

  function scheduleTone(current, when, length, frequency, loudness, kind) {
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.type = kind
    oscillator.frequency.value = frequency
    const end = when + Math.max(0.026, length)
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(loudness, when + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    oscillator.connect(gain).connect(audio.destination)
    current.sounds.add(oscillator)
    oscillator.onended = () => {
      current.sounds.delete(oscillator)
      oscillator.disconnect()
      gain.disconnect()
    }
    oscillator.start(when)
    oscillator.stop(end + 0.01)
  }

  function audioTime() {
    const timestamp = audio.getOutputTimestamp?.()
    if (timestamp?.performanceTime > 0) {
      const elapsed = (performance.now() - timestamp.performanceTime) / 1000
      return Math.min(audio.currentTime, timestamp.contextTime + elapsed)
    }
    return audio.currentTime
  }

  function finish(current) {
    const moveFocus = document.activeElement === tap
    if (current.mode === 'tap') {
      const found = current.hits.size
      const missed = current.targets.length - found
      const outcome = [found + ' of ' + current.targets.length + ' note starts matched.']
      if (missed) outcome.push(missed + ' missed.')
      if (current.extra) outcome.push(current.extra + ' extra.')
      const offsets = [...current.hits.values()]
      if (offsets.length) {
        const average = offsets.reduce((sum, value) => sum + value, 0) / offsets.length
        if (Math.abs(average) >= 0.03) {
          outcome.push('Matched taps averaged ' + Math.round(Math.abs(average) * 1000) + ' ms ' + (average < 0 ? 'early.' : 'late.'))
        }
      }
      feedback.textContent = outcome.join(' ')
    } else {
      feedback.textContent = 'Try tapping the same rhythm.'
    }
    stop()
    if (moveFocus) practice.focus({ preventScroll: true })
  }

  async function play(mode) {
    if (session?.mode === mode) {
      stop()
      feedback.textContent = 'Stopped.'
      return
    }
    stop()
    const current = { mode, sounds: new Set(), hits: new Map(), extra: 0 }
    session = current
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)()
      if (audio.state !== 'running') await audio.resume()
      if (session !== current) return
      const beatSeconds = 60 / Number(tempo.value)
      const tickSeconds = beatSeconds / lesson.pulse
      const begin = audio.currentTime + 0.08
      const countIn = mode === 'tap' ? timeline.barTicks : 0
      current.start = begin + countIn * tickSeconds
      current.tolerance = Math.min(0.115, beatSeconds * 0.16)
      current.targets = timeline.notes.map(({ start }) => start * tickSeconds)
      const markers = [...counts.querySelectorAll('span')]
      const click = (when, downbeat, volume) =>
        scheduleTone(current, when, 0.045, downbeat ? 980 : 660, volume, 'sine')
      for (let tick = 0; tick < countIn; tick += lesson.pulse) {
        click(begin + tick * tickSeconds, tick === 0, 0.15)
      }
      for (const count of timeline.counts) {
        if (count.pulse) click(current.start + count.tick * tickSeconds, count.first, mode === 'tap' ? 0.12 : 0.04)
      }
      if (mode === 'hear') {
        for (const tone of timeline.notes) {
          scheduleTone(current, current.start + tone.start * tickSeconds, tone.length * tickSeconds,
            440 * 2 ** ((tone.midi - 69) / 12), tone.level, 'triangle')
        }
        listen.textContent = 'Stop example'
        feedback.textContent = 'Listen to the notes against the click.'
      } else {
        practice.textContent = 'Stop tapping'
        feedback.textContent = 'Wait for the count-in, then tap the note starts.'
        tap.hidden = false
        tap.disabled = false
        if (tap.getBoundingClientRect().bottom > window.innerHeight - 70) {
          tap.scrollIntoView({ block: 'center' })
        }
        tap.focus({ preventScroll: true })
      }
      let marker = -1
      function tick() {
        if (session !== current) return
        const position = (audioTime() - current.start) / tickSeconds
        if (position >= timeline.length + 0.25) {
          finish(current)
          return
        }
        if (position < 0) {
          const count = Math.max(1, 1 + Math.floor((position + countIn) / lesson.pulse))
          phase.textContent = 'Count-in · ' + count
        } else {
          while (timeline.counts[marker + 1]?.tick <= position) marker++
          if (markers[marker] && markers[marker] !== highlighted) {
            highlighted?.classList.remove('rhythm-current')
            highlighted = markers[marker]
            highlighted.classList.add('rhythm-current')
          }
          if (phase.textContent.startsWith('Count-in')) phase.textContent = ''
        }
        current.frame = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      if (session !== current) return
      stop()
      feedback.textContent = 'Sound could not start in this browser. Tap Hear example to try again.'
    }
  }

  function recordTap() {
    const current = session
    if (current?.mode !== 'tap' || current.start == null) return
    const elapsed = audioTime() - current.start
    if (elapsed < -current.tolerance) return
    const result = gradeRhythmTap(current.targets, current.hits, elapsed, current.tolerance)
    if (!result) {
      current.extra++
      phase.textContent = 'Extra tap'
      return
    }
    current.hits.set(result.index, result.offset)
    phase.textContent = result.offset < -0.045 ? 'Early' : result.offset > 0.045 ? 'Late' : 'On the beat'
  }

  topic.addEventListener('change', () => render())
  tempo.addEventListener('change', () => render())
  feel.addEventListener('change', () => render())
  listen.addEventListener('click', () => play('hear'))
  practice.addEventListener('click', () => play('tap'))
  tap.addEventListener('pointerdown', (event) => {
    if (event.isPrimary && event.button === 0) recordTap()
  })
  tap.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    if (!event.repeat) recordTap()
  })
  tap.addEventListener('click', (event) => {
    if (!event.detail) recordTap()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop()
  })
  window.addEventListener('pagehide', stop)
  render()
  return { open: render, stop }
}
