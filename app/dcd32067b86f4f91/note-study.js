const LETTERS = 'CDEFGAB'
const SEMITONES = [0, 2, 4, 5, 7, 9, 11]
const CLEFS = {
  treble: { title: 'Treble clef', bottom: 30, reference: 2, clue: 'The treble clef curls around G4, the second line from the bottom.' },
  bass: { title: 'Bass clef', bottom: 18, reference: 6, clue: 'The bass clef dots surround F3, the fourth line from the bottom.' }
}
const ACCIDENTALS = {
  none: { symbol: '', transform: 0, words: '' },
  sharp: { symbol: '♯', transform: 1, words: 'sharp' },
  flat: { symbol: '♭', transform: -1, words: 'flat' },
  natural: { symbol: '♮', transform: 0, words: 'natural' }
}
const SVG = 'http://www.w3.org/2000/svg'
const BASELINE = 112
const HALF_SPACE = 8
const ROUND_LENGTH = 10

export function noteAt(clef, position, accidental = 'none') {
  const index = CLEFS[clef].bottom + position
  const octave = Math.floor(index / 7)
  const step = index % 7
  const letter = LETTERS[step]
  const { symbol, transform, words } = ACCIDENTALS[accidental]
  return {
    clef, position, accidental,
    name: letter + symbol + octave,
    spoken: [letter, words, octave].filter(Boolean).join(' '),
    midi: (octave + 1) * 12 + SEMITONES[step] + transform
  }
}

export function ledgerLines(position) {
  const lines = []
  for (let line = -2; line >= position; line -= 2) lines.push(line)
  for (let line = 10; line <= position; line += 2) lines.push(line)
  return lines
}

function description(position) {
  if (position < -1 || position > 9) {
    const above = position > 9
    const distance = above ? position - 8 : -position
    const direction = above ? 'above' : 'below'
    const line = distance < 4 ? 'first' : 'second'
    return distance % 2 ? `In the space beyond the ${line} ledger line ${direction} the staff.`
      : `On the ${line} ledger line ${direction} the staff.`
  }
  if (position === -1 || position === 9) return `In the space just ${position === 9 ? 'above' : 'below'} the staff.`
  const ordinal = ['first', 'second', 'third', 'fourth', 'fifth'][Math.floor(position / 2)]
  return position % 2 ? `In the ${ordinal} space from the bottom.`
    : `On the ${ordinal} line from the bottom.`
}

function svgElement(tag, attributes) {
  const element = document.createElementNS(SVG, tag)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
  return element
}

function engrave(note) {
  const accidental = ACCIDENTALS[note.accidental].words
  const label = [CLEFS[note.clef].title, description(note.position),
    accidental ? 'Written with a ' + accidental + ' sign.' : ''].filter(Boolean).join(' ')
  const staff = svgElement('svg', { class: 'note-study-staff', viewBox: '0 0 320 157',
    role: 'img', 'aria-label': label, 'data-clef': note.clef })
  const pitchY = (position) => BASELINE - HALF_SPACE * position
  function line(x1, y1, x2, y2, width, className) {
    staff.append(svgElement('line', { x1, x2, y1, y2, stroke: 'currentColor',
      'stroke-width': width, class: className }))
  }
  function glyph(key, x, y, className) {
    // The outlines are 250 font units per staff space and use an upward y axis.
    staff.append(svgElement('path', { d: glyphs[key], fill: 'currentColor',
      transform: `translate(${x} ${y}) scale(0.064 -0.064)`, class: className }))
  }
  for (const position of [0, 2, 4, 6, 8]) line(20, pitchY(position), 302, pitchY(position), 1.25, 'note-study-staff-line')
  glyph(note.clef, 31, pitchY(CLEFS[note.clef].reference), 'note-study-clef-glyph')
  const y = pitchY(note.position)
  for (const position of ledgerLines(note.position)) line(182, pitchY(position), 220, pitchY(position), 1.7, 'note-study-ledger')
  if (accidental) glyph(note.accidental, 160, y, 'note-study-accidental-glyph')
  const stemUp = note.position < 4
  const stemX = stemUp ? 210 : 191
  line(stemX, y + (stemUp ? -3 : 3), stemX, y + (stemUp ? -56 : 56), 1.85, 'note-study-stem')
  glyph('head', 190, y, 'note-study-notehead')
  return staff
}

function element(tag, { text, className, id } = {}) {
  const node = document.createElement(tag)
  if (text) node.textContent = text
  if (className) node.className = className
  if (id) node.id = id
  return node
}

function select(id, label, choices) {
  const container = element('label', { text: label })
  const field = element('select', { id: 'note-study-' + id })
  for (const [value, name] of choices) field.append(new Option(name, value))
  container.append(field)
  return { container, field }
}

function button(id, text, action, className = 'secondary') {
  const node = element('button', { id, text, className })
  node.type = 'button'
  node.onclick = action
  return node
}

function shuffle(items) {
  const result = items.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const selected = result[j]
    result[j] = result[i]
    result[i] = selected
  }
  return result
}

function makePool(clefs, hasLedger, hasAccidentals) {
  const notes = []
  const signs = hasAccidentals ? ['sharp', 'flat', 'natural'] : ['none']
  for (const clef of clefs) {
    for (let i = hasLedger ? -4 : 0; i <= (hasLedger ? 12 : 8); i++) {
      for (const sign of signs) notes.push(noteAt(clef, i, sign))
    }
  }
  return notes
}

function buildRound(pool, clefs) {
  if (clefs.length === 1) return shuffle(pool).slice(0, ROUND_LENGTH)
  const decks = clefs.map((clef) => shuffle(pool.filter((note) => note.clef === clef)))
  return Array.from({ length: ROUND_LENGTH }, (_, index) => decks[index % 2][Math.floor(index / 2)])
}

function answerChoices(note, pool) {
  // Include the other written spellings at the same position when studying
  // accidentals, and nearby staff positions when studying natural notes.
  const priorities = {
    samePosition: shuffle(pool.filter((option) => option.clef === note.clef &&
      option.position === note.position && option.name !== note.name)),
    nearby: shuffle(pool.filter((option) => option.clef === note.clef && option.accidental === note.accidental &&
      option.position !== note.position && Math.abs(option.position - note.position) <= 3))
  }
  const alternatives = [...priorities.samePosition, ...priorities.nearby]
  return shuffle([note, ...alternatives.slice(0, 3)])
}

function drawKeyboard(keyboard, note) {
  const low = Math.floor(note.midi / 12) * 12
  const keys = []
  let whites = 0
  for (let midi = low; midi <= low + 12; midi++) {
    const step = SEMITONES.indexOf(midi % 12)
    const key = element('span', { className: step === -1 ? 'black-key' : 'white-key' })
    key.dataset.midi = midi
    if (step < 0) {
      key.style.left = (100 * whites) / 8 + '%'
      key.style.width = 61 / 8 + '%'
    } else {
      whites += 1
      const label = step === 0 ? 'C' + (Math.floor(midi / 12) - 1) : LETTERS[step]
      key.append(element('span', { className: 'key-label', text: label }))
    }
    if (midi === note.midi) {
      key.classList.add('pressed')
      const label = key.firstChild ?? key.appendChild(element('span', { className: 'key-label' }))
      label.textContent = step < 0 ? note.name : LETTERS[step] + (Math.floor(midi / 12) - 1)
    }
    keys.push(key)
  }
  keyboard.replaceChildren(...keys)
  keyboard.setAttribute('aria-label', 'Piano keyboard with ' + note.spoken + ' highlighted')
}

export function initNoteStudy(root, { hear } = {}) {
  const mode = select('mode', 'Mode', [['study', 'Study'], ['quiz', 'Quiz']])
  const clef = select('clef', 'Clef', [['treble', 'Treble'], ['bass', 'Bass'], ['both', 'Both']])
  const range = select('range', 'Range', [['staff', 'Staff notes'], ['ledger', 'Staff + ledger lines']])
  const symbols = select('symbols', 'Symbols', [['naturals', 'Naturals'], ['accidentals', 'Accidentals']])
  const jump = select('jump', 'Choose note', [])
  const controls = element('div', { className: 'note-study-controls' })
  controls.append(...[mode, clef, range, symbols, jump].map((control) => control.container))

  const card = element('div', { className: 'note-study-card' })
  const progress = element('p', { className: 'note-study-progress' })
  const notation = element('div', { className: 'note-study-notation' })
  const prompt = element('h2', { className: 'note-study-prompt' })
  const choices = element('div', { className: 'note-study-choices' })
  choices.setAttribute('role', 'group')
  choices.setAttribute('aria-label', 'Written note choices')
  const feedback = element('p', { className: 'note-study-feedback' })
  feedback.setAttribute('role', 'status')
  const keyboard = element('div', { className: 'keyboard note-study-keyboard' })
  keyboard.setAttribute('role', 'img')
  const clue = element('p', { className: 'note-study-clue' })
  const actions = element('div', { className: 'note-study-actions' })
  const reveal = button('note-study-reveal', 'Show answer', () => showAnswer())
  const listen = button('note-study-hear', 'Hear note', () => hear?.([notes[index]]))
  const previous = button('note-study-previous', 'Previous', () => goTo(index - 1))
  const next = button('note-study-next', 'Next note', advance, 'play')
  actions.append(previous, reveal, listen, next)
  card.append(progress, notation, prompt, choices, feedback, keyboard, clue, actions)
  root.replaceChildren(controls, card)

  let pool, notes, order = [], index, right, errors, answered, finished, quiz

  function goTo(position) {
    index = position
    const note = notes[index]
    if (!quiz) jump.field.value = String(index)
    answered = false
    errors = 0
    order = []
    progress.textContent = (quiz ? 'Question ' : 'Note ') + (index + 1) + ' of ' + notes.length
    notation.hidden = false
    notation.replaceChildren(engrave(note))
    prompt.textContent = quiz ? 'Which note is written?' : 'Read this note'
    clue.textContent = CLEFS[note.clef].clue
    clue.hidden = quiz
    feedback.textContent = ''
    keyboard.hidden = true
    keyboard.replaceChildren()
    choices.hidden = !quiz
    if (quiz) choices.replaceChildren(...answerChoices(note, pool).map((choice) => {
      const action = button(null, choice.name, () => choose(choice, action), 'secondary note-study-choice')
      action.setAttribute('aria-label', choice.spoken)
      order.push([choice, action])
      return action
    }))
    else choices.replaceChildren()
    reveal.hidden = false
    listen.hidden = true
    previous.hidden = quiz
    previous.disabled = index === 0
    next.disabled = quiz || index === notes.length - 1
    next.textContent = quiz && index === notes.length - 1 ? 'See results' : 'Next note'
  }

  function showAnswer(correct = false) {
    if (answered) return
    const note = notes[index]
    answered = true
    if (correct && !errors) right += 1
    prompt.textContent = note.name
    const adjective = ACCIDENTALS[note.accidental].words
    let explanation = adjective === 'sharp' || adjective === 'flat'
      ? ' Move one piano key ' + (adjective === 'sharp' ? 'higher' : 'lower') + ', including black keys.'
      : adjective === 'natural' ? ' The natural sign gives the letter its unaltered pitch.' : ''
    const white = SEMITONES.indexOf(note.midi % 12)
    if (white >= 0 && ACCIDENTALS[note.accidental].transform) {
      const soundingName = LETTERS[white] + (Math.floor(note.midi / 12) - 1)
      explanation += ' It uses the same key as ' + soundingName + '.'
    }
    feedback.textContent = (correct ? 'Correct. ' : 'Answer ' + note.spoken + '. ') +
      description(note.position) + explanation
    for (const [choice, control] of order) {
      control.setAttribute('aria-disabled', 'true')
      if (choice.name === note.name) control.dataset.result = 'correct'
    }
    drawKeyboard(keyboard, note)
    keyboard.hidden = false
    listen.hidden = !hear
    reveal.hidden = true
    if (quiz) next.disabled = false
  }

  function choose(choice, control) {
    if (answered || control.dataset.result === 'incorrect') return
    if (choice.name === notes[index].name) showAnswer(true)
    else {
      errors += 1
      control.dataset.result = 'incorrect'
      control.setAttribute('aria-disabled', 'true')
      feedback.textContent = 'Try again. ' + CLEFS[notes[index].clef].clue
    }
  }

  function advance() {
    if (finished) start()
    else if (index < notes.length - 1) goTo(index + 1)
    else if (quiz) {
      finished = true
      progress.textContent = 'Quiz complete'
      prompt.textContent = `${right} of ${notes.length} correct on the first try`
      notation.hidden = choices.hidden = keyboard.hidden = clue.hidden = reveal.hidden = listen.hidden = true
      feedback.textContent = right === notes.length ? 'You read every note on the first try.' : 'Start another round to keep practicing.'
      next.textContent = 'Try another quiz'
    }
  }

  function start() {
    quiz = mode.field.value === 'quiz'
    const clefs = clef.field.value === 'both' ? Object.keys(CLEFS) : [clef.field.value]
    pool = makePool(clefs, range.field.value === 'ledger', symbols.field.value === 'accidentals')
    notes = quiz ? buildRound(pool, clefs) : pool
    jump.container.hidden = quiz
    jump.field.replaceChildren(...(quiz ? [] : notes.map((note, position) => {
      const name = clefs.length === 1 ? note.name : `${note.name} · ${CLEFS[note.clef].title}`
      return new Option(name, position)
    })))
    finished = false
    right = 0
    goTo(0)
  }
  for (const control of [mode, clef, range, symbols]) control.field.onchange = start
  jump.field.onchange = () => goTo(Number(jump.field.value))
  start()
}

// Leipzig SMuFL outlines, SIL Open Font License 1.1.
// https://book.verovio.org/advanced-topics/smufl.html
const glyphs = {
  treble: 'M441 -245c-23 -4 -48 -6 -76 -6c-59 0 -102 7 -130 20c-88 42 -150 93 -187 154c-26 44 -43 103 -48 176c0 6 -1 13 -1 19c0 54 15 111 45 170c29 57 65 106 110 148s96 85 153 127c-3 16 -8 46 -13 92c-4 43 -5 73 -5 89c0 117 16 172 69 257c34 54 64 82 89 82 c21 0 43 -30 69 -92s39 -115 41 -159v-15c0 -109 -21 -162 -67 -241c-13 -20 -63 -90 -98 -118c-13 -9 -25 -19 -37 -29l31 -181c8 1 18 2 28 2c58 0 102 -12 133 -35c59 -43 92 -104 98 -184c1 -7 1 -15 1 -22c0 -123 -87 -209 -181 -248c8 -57 17 -110 25 -162 c5 -31 6 -58 6 -80c0 -30 -5 -53 -14 -70c-35 -64 -88 -99 -158 -103c-5 0 -11 -1 -16 -1c-37 0 -72 10 -108 27c-50 24 -77 59 -80 105v11c0 29 7 55 20 76c18 28 45 42 79 44h6c49 0 93 -42 97 -87v-9c0 -51 -34 -86 -105 -106c17 -24 51 -36 102 -36c62 0 116 43 140 85 c9 16 13 41 13 74c0 20 -1 42 -5 67c-8 53 -18 106 -26 159zM461 939c-95 0 -135 -175 -135 -286c0 -24 2 -48 5 -71c50 39 92 82 127 128c40 53 60 100 60 140v8c-4 53 -22 81 -55 81h-2zM406 119l54 -326c73 25 110 78 110 161c0 7 0 15 -1 23c-7 95 -57 142 -151 142h-12 zM382 117c-72 -2 -128 -47 -128 -120v-7c2 -46 43 -99 75 -115c-3 -2 -7 -5 -10 -10c-70 33 -116 88 -123 172v11c0 68 44 126 88 159c23 17 49 29 78 36l-29 170c-21 -13 -52 -37 -92 -73c-50 -44 -86 -84 -109 -119c-45 -69 -67 -130 -67 -182v-13c5 -68 35 -127 93 -176 s125 -73 203 -73c25 0 50 3 75 9c-19 111 -36 221 -54 331z',
  bass: 'M582 -120c0 32 26 58 58 58s58 -26 58 -58s-26 -58 -58 -58s-58 26 -58 58zM582 120c0 32 26 58 58 58s58 -26 58 -58s-26 -58 -58 -58s-58 26 -58 58zM158 96c51 0 73 -14 88 -49l16 -39c0 -17 -2 -30 -7 -40c-3 -11 -10 -21 -19 -31c-17 -18 -49 -43 -84 -43 c-55 0 -77 13 -112 44c-24 21 -35 55 -35 100c0 46 14 81 32 112c30 52 71 79 137 93l36 6l26 2c154 0 235 -68 274 -182c11 -32 18 -68 18 -107c0 -103 -26 -182 -68 -250c-89 -145 -234 -230 -412 -288l-30 -5c-9 0 -14 3 -14 8c3 10 5 11 10 16c35 15 70 30 96 44l78 43 c96 57 162 136 197 258c9 33 17 60 22 100c3 22 5 35 6 39c-7 69 -16 115 -23 140s-4 22 -16 40c-8 12 -19 23 -31 34c-24 21 -62 44 -118 44c-48 0 -84 -8 -113 -28c-28 -19 -42 -44 -42 -73v-16c2 -5 3 -9 4 -11c24 22 52 39 84 39z',
  head: 'M0 -39c0 68 73 172 200 172c66 0 114 -37 114 -95c0 -84 -106 -171 -218 -171c-64 0 -96 30 -96 94z',
  sharp: 'M136 186v169h17v-164l44 14v-91l-44 -14v-165l44 12v-91l-44 -13v-155h-17v150l-76 -22v-155h-17v149l-43 -13v90l43 14v167l-43 -14v92l43 13v169h17v-163zM60 73v-167l76 22v168z',
  flat: 'M20 110c32 16 54 27 93 27c26 0 35 -3 54 -13c13 -7 24 -20 27 -38l4 -25c0 -28 -16 -57 -45 -89c-23 -25 -39 -44 -65 -68l-88 -79v644h20v-359zM90 106c-32 0 -48 -10 -70 -29v-194c31 31 54 59 71 84c21 32 32 59 32 84c0 9 1 16 1 20c0 14 -3 21 -11 30l-8 3z',
  natural: 'M0 -188v539h18v-191l139 22v-533h-17v186zM18 -100l122 17v176l-122 -19v-174z',
}
