const letters = 'CDEFGAB'
const naturalPitch = [0, 2, 4, 5, 7, 9, 11]
const sharps = 'FCGDAEB'
const flats = 'BEADGCF'
const tonicPairs = [
  ['C♭', 'A♭'],
  ['G♭', 'E♭'],
  ['D♭', 'B♭'],
  ['A♭', 'F'],
  ['E♭', 'C'],
  ['B♭', 'G'],
  ['F', 'D'],
  ['C', 'A'],
  ['G', 'E'],
  ['D', 'B'],
  ['A', 'F♯'],
  ['E', 'C♯'],
  ['B', 'G♯'],
  ['F♯', 'D♯'],
  ['C♯', 'A♯']
]
const majorSteps = [2, 2, 1, 2, 2, 2, 1]
const minorSteps = [2, 1, 2, 2, 1, 2, 2]
const usualRight = '12312345'
const usualLeft = '54321321'
const flatMajorLeft = '32143213'

// Suggested one-octave fingerings. Enharmonic keys share a physical keyboard pattern.
// The piano charts from SUNY Potsdam's Keyboard Skills I and Hoffman Academy's
// Natural Minor Scale Fingering Guide give these finger groups.
const majorFingers = {
  1: ['23123412', flatMajorLeft],
  3: ['31234123', flatMajorLeft],
  5: ['12341234', usualLeft],
  6: ['23412312', '43213214'],
  8: ['34123123', flatMajorLeft],
  10: ['41231234', flatMajorLeft],
  11: [usualRight, '43214321']
}
const minorFingers = {
  1: ['34123123', '32143213'],
  3: ['31234123', '21432132'],
  5: ['12341234', usualLeft],
  6: ['34123123', '43213214'],
  8: ['34123123', '32132143'],
  10: ['41231234', '21321432'],
  11: [usualRight, '43214321']
}

function pitchClass(name) {
  const pitch = naturalPitch[letters.indexOf(name[0])] + alteration(name)
  return (pitch + 12) % 12
}

function alteration(name) {
  if (name.endsWith('♯')) return 1
  if (name.endsWith('♭')) return -1
  return 0
}

function keyId(tonic, mode) {
  return tonic.toLowerCase().replace('♯', '-sharp').replace('♭', '-flat') + '-' + mode
}

function describeKey(tonic, relativeTonic, mode, fifths) {
  const accidental = fifths >= 0 ? '♯' : '♭'
  const accidentalCount = Math.abs(fifths)
  const accidentalName = fifths > 0 ? 'sharp' : 'flat'
  const accidentals = Array.from(
    (fifths >= 0 ? sharps : flats).slice(0, accidentalCount),
    (letter) => letter + accidental
  )
  const signature =
    fifths === 0
      ? 'No sharps or flats'
      : `${accidentalCount} ${accidentalName}${accidentalCount === 1 ? '' : 's'} (${accidentals.join(', ')})`
  const degrees = Array.from(
    { length: 8 },
    (_, index) => letters[(letters.indexOf(tonic[0]) + index) % 7]
  )
  const scale = degrees.map(
    (letter) => accidentals.find((spelling) => spelling[0] === letter) || letter
  )
  const triad = [scale[0], scale[2], scale[4]]
  const steps = mode === 'major' ? majorSteps : minorSteps
  const halfSteps = steps.flatMap((step, index) =>
    step === 1 ? [`${index + 1}–${index + 2}`] : []
  )
  const formula = steps.map((step) => (step === 2 ? 'W' : 'H')).join('–')
  const relativeMode = mode === 'major' ? 'minor' : 'major'
  const label = `${tonic} ${mode}`
  const relativeLabel = `${relativeTonic} ${relativeMode}`
  const patterns = mode === 'major' ? majorFingers : minorFingers
  const [right, left] = patterns[pitchClass(tonic)] || [usualRight, usualLeft]
  const third = mode === 'major' ? 'major third' : 'minor third'
  return {
    id: keyId(tonic, mode),
    label,
    tonic,
    mode,
    fifths,
    signature,
    accidentals,
    scale,
    triad,
    formula,
    steps: [...steps],
    halfSteps,
    relativeId: keyId(relativeTonic, relativeMode),
    relativeLabel,
    fingering: { right: Array.from(right, Number), left: Array.from(left, Number) },
    lesson:
      `Start on ${tonic}, the tonic. The half steps fall between scale degrees ${halfSteps[0]} and ${halfSteps[1]}. ` +
      `Play ${triad.join('–')} together to hear the ${third} above the tonic. ` +
      `${relativeLabel} shares the key signature and has a different tonic.`
  }
}

export const keys = tonicPairs.flatMap(([major, minor], index) => [
  describeKey(major, minor, 'major', index - 7),
  describeKey(minor, major, 'minor', index - 7)
])

const byId = new Map(keys.map((key) => [key.id, key]))

function normalizeLabel(label) {
  return label
    .toLowerCase()
    .replaceAll('#', '♯')
    .replace(/([a-g])\s*b(?=\s)/g, '$1♭')
    .replace(/\s*[- ]\s*sharp\b/g, '♯')
    .replace(/\s*[- ]\s*flat\b/g, '♭')
    .replace(/\bnatural\s+minor\b/g, 'minor')
    .replace(/\s+/g, ' ')
    .trim()
}

const byLabel = new Map(keys.map((key) => [normalizeLabel(key.label), key]))

export function keysForScore(keyLabel) {
  if (typeof keyLabel !== 'string') return { confidence: 'unknown', keys: [] }
  const normalized = normalizeLabel(keyLabel)
  const likely = normalized.startsWith('likely ')
  const labels = normalized.replace(/^likely /, '').split(/\s+or\s+/)
  const choices = labels.map((label) => byLabel.get(label))
  if (choices.some((key) => !key)) return { confidence: 'unknown', keys: [] }
  const unique = [...new Set(choices)]
  return { confidence: unique.length > 1 ? 'ambiguous' : likely ? 'likely' : 'exact', keys: unique }
}

function scaleNotes(key, hand) {
  const rootOctave = hand === 'left' ? 3 : 4
  const rootLetter = letters.indexOf(key.tonic[0])
  return key.scale.map((spelling, index) => {
    const writtenLetter = rootLetter + index
    const octave = rootOctave + Math.floor(writtenLetter / 7)
    const midi = (octave + 1) * 12 + naturalPitch[writtenLetter % 7] + alteration(spelling)
    return {
      name: spelling + octave,
      midi,
      hand,
      finger: key.fingering[hand][index],
      fingeringSource: 'suggested',
      attack: true
    }
  })
}

function scaleTechnique(index, notes, previous) {
  if (index === 0) return 'Place the starting fingers and say the tonic name before you play.'
  if (index === 7) return 'Turn at the higher tonic while keeping the same pulse.'
  if (index === 14) return 'Hold the last tonic for two counts and listen for the feeling of home.'
  const crossings = notes.flatMap((note, handIndex) => {
    const prior = previous[handIndex]
    const goesRight = note.midi > prior.midi
    const fingerIncreases = note.finger > prior.finger
    const naturalDirection =
      note.hand === 'right' ? goesRight === fingerIncreases : goesRight !== fingerIncreases
    if (naturalDirection) return []
    const hand = note.hand === 'right' ? 'Right hand' : 'Left hand'
    if (note.finger === 1) return [`${hand}, let the thumb pass under as your forearm shifts.`]
    if (prior.finger === 1)
      return [`${hand}, let finger ${note.finger} pass over the thumb with a small forearm shift.`]
    return []
  })
  return crossings.join(' ') || 'Move to the next key and keep the two notes evenly spaced.'
}

export function makeScaleScore(id, hand = 'right') {
  const key = byId.get(id)
  if (!key) return null
  const hands = hand === 'both' ? ['left', 'right'] : [hand === 'left' ? 'left' : 'right']
  const byHand = hands.map((side) => scaleNotes(key, side))
  const degrees = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0]
  const title = key.mode === 'minor' ? `${key.tonic} natural minor scale` : `${key.label} scale`
  const keyDetail = `${key.signature}. ${key.lesson}`
  let previous = []
  const events = degrees.map((degree, index) => {
    const duration = index === degrees.length - 1 ? 2 : 1
    const rhythm = duration === 2 ? 'half note' : 'quarter note'
    const notes = byHand.map((scale) => ({
      ...scale[degree],
      duration,
      playDuration: duration,
      rhythm
    }))
    const technique = scaleTechnique(index, notes, previous)
    previous = notes
    return {
      start: index % 4,
      duration,
      count: String((index % 4) + 1),
      notes,
      rests: [],
      rhythm,
      technique
    }
  })
  const measures = Array.from({ length: 4 }, (_, index) => ({
    number: String(index + 1),
    duration: 4,
    timeSignature: '4/4',
    key: key.label,
    keyDetail,
    countPattern: '1 · 2 · 3 · 4',
    pickup: false,
    events: events.slice(index * 4, index * 4 + 4)
  }))
  return {
    title,
    timeSignature: '4/4',
    key: key.label,
    keyDetail,
    measures,
    lessonId: key.id,
    lessonHand: hands.length === 2 ? 'both' : hands[0],
    tips: [
      'Say each note as you play. Keep the pulse slow and steady through the finger crossings.',
      'Play one hand at a time, then use both hands an octave apart.',
      'W means a whole step, or two piano key steps. H means a half step, or the next piano key.'
    ]
  }
}
