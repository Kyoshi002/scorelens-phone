const charts = new WeakMap()
const tolerance = 1e-8

function quarterLength(value) {
  return Number.isFinite(value) ? Math.max(value, 0) : 0
}

function chartFor(score) {
  if (charts.has(score)) return charts.get(score)

  const measures = []
  const events = []
  const tones = []
  let offset = 0
  score.measures.forEach((measure, m) => {
    const duration = quarterLength(measure.duration)
    measures.push({ start: offset, end: offset + duration })
    measure.events.forEach((event, index) => {
      const time = offset + quarterLength(event.start)
      events.push({ m, index, time })
      for (const note of event.notes) {
        const length = quarterLength(note.playDuration ?? note.duration ?? event.duration)
        if (note.attack === false || length <= 0 || !Number.isFinite(note.midi)) continue
        tones.push({ note, start: time, end: time + length })
      }
    })
    offset += duration
  })
  const chart = { measures, events, tones, duration: offset }
  charts.set(score, chart)
  return chart
}

function selectedTime(score, chart, m, e) {
  const start = chart.measures[m]?.start ?? 0
  return start + quarterLength(score.measures[m]?.events[e]?.start)
}

export function soundingAt(score, m = 0, e = 0) {
  if (!score?.measures?.[m]) return []
  const chart = chartFor(score)
  const when = selectedTime(score, chart, m, e)
  const selected = score.measures[m].events[e]?.notes || []
  return chart.tones
    .filter((tone) => tone.start <= when + tolerance && tone.end > when + tolerance)
    .map((tone) => {
      const held = tone.start < when - tolerance
      const replacement =
        held &&
        selected.find(
          (note) =>
            note.attack === false && note.midi === tone.note.midi && note.hand === tone.note.hand
        )
      return { ...(replacement || tone.note), held }
    })
}

export function keyboardRange(score, m = 0) {
  const chart = score?.measures?.length ? chartFor(score) : null
  const bar = chart?.measures[m]
  if (!bar) return { low: 48, high: 71 }
  const pitches = chart.tones
    .filter((tone) => tone.start < bar.end - tolerance && tone.end > bar.start + tolerance)
    .map((tone) => tone.note.midi)
  for (const event of score.measures[m].events) {
    for (const note of event.notes) {
      if (Number.isFinite(note.midi)) pitches.push(note.midi)
    }
  }
  if (!pitches.length) return { low: 48, high: 71 }
  const minimum = Math.min(...pitches)
  const maximum = Math.max(...pitches)
  const low = Math.min(108, Math.max(0, Math.floor(minimum / 12) * 12))
  const high = Math.min(127, Math.max(low + 23, Math.floor(maximum / 12) * 12 + 11))
  return { low, high }
}

function latestAt(list, elapsed) {
  let low = 0
  let high = list.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (list[mid].time <= elapsed + tolerance) low = mid + 1
    else high = mid
  }
  return list[low - 1]
}

function activity(tones, timeline) {
  const boundaries = []
  for (const tone of tones) {
    boundaries.push(
      { time: tone.time, tone, opening: true },
      { time: tone.time + tone.duration, tone, opening: false }
    )
  }
  boundaries.sort((a, b) => a.time - b.time)
  const changes = []
  const live = new Set()
  for (let first = 0; first < boundaries.length; ) {
    const time = boundaries[first].time
    let next = first
    while (next < boundaries.length && boundaries[next].time <= time + tolerance) {
      const { tone, opening } = boundaries[next++]
      if (opening) live.add(tone)
      else live.delete(tone)
    }
    changes.push({ time, tones: [...live] })
    first = next
  }
  return (elapsed) => {
    const change = latestAt(changes, elapsed)
    if (!change) return []
    const event = latestAt(timeline, elapsed)
    return change.tones.map((tone) => ({
      ...tone.note,
      held: tone.preexisting || tone.time < (event?.time ?? 0) - tolerance
    }))
  }
}

export function buildPlayback(score, m = 0, e = 0) {
  if (!score?.measures?.length) return { duration: 0, timeline: [], tones: [], activeAt: () => [] }
  const chart = chartFor(score)
  const start = selectedTime(score, chart, m, e)
  const timeline = chart.events
    .filter((event) => event.m > m || (event.m === m && event.index >= e))
    .map((event) => ({ ...event, time: Math.max(0, event.time - start) }))
  const playable = chart.tones
    .filter((tone) => tone.end > start + tolerance)
    .map((tone) => ({
      time: Math.max(0, tone.start - start),
      midi: tone.note.midi,
      duration: tone.end - Math.max(tone.start, start),
      note: tone.note,
      preexisting: tone.start < start - tolerance
    }))
  const tones = playable.map(({ note, time, duration }) => ({ ...note, time, duration }))
  const duration = playable.reduce(
    (end, tone) => Math.max(end, tone.time + tone.duration),
    Math.max(0, chart.duration - start)
  )
  return { duration, timeline, tones, activeAt: activity(playable, timeline) }
}
