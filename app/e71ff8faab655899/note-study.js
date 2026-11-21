const LETTERS = 'CDEFGAB'
const SEMITONES = [0, 2, 4, 5, 7, 9, 11]
const CLEFS = {
  treble: { title: 'Treble clef', bottom: 30, reference: 2, clue: 'The clef curls around G4 on the second line.' },
  bass: { title: 'Bass clef', bottom: 18, reference: 6, clue: 'The two dots frame F3 on the fourth line.' }
}
const ACCIDENTALS = {
  none: { symbol: '', transform: 0, words: '', title: 'Natural notes' },
  sharp: { symbol: '♯', transform: 1, words: 'sharp', title: 'Sharps' },
  flat: { symbol: '♭', transform: -1, words: 'flat', title: 'Flats' },
  natural: { symbol: '♮', transform: 0, words: 'natural', title: 'Natural signs' }
}
const SVG = 'http://www.w3.org/2000/svg'
const BASELINE = 112
const HALF_SPACE = 8
const COLUMNS = 9

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

function svgElement(tag, attributes) {
  const element = document.createElementNS(SVG, tag)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
  return element
}

function staffLine(x1, x2, y, width, className) {
  return svgElement('line', { x1, x2, y1: y, y2: y, stroke: 'currentColor', 'stroke-width': width, class: className })
}

function glyph(key, x, y, className) {
  // Leipzig uses 250 font units per staff space and an upward y axis.
  return svgElement('path', { d: glyphs[key], fill: 'currentColor',
    transform: `translate(${x} ${y}) scale(0.064 -0.064)`, class: className })
}

function engrave(notes, selectNote) {
  const { clef, accidental } = notes[0]
  const label = `${CLEFS[clef].title} · ${ACCIDENTALS[accidental].title} · ${notes[0].spoken} to ${notes.at(-1).spoken}`
  const labelY = notes.some((note) => note.position < -2) ? 167 : 155
  const staff = svgElement('svg', { class: 'note-study-staff', viewBox: `0 0 498 ${labelY + 10}`,
    role: 'group', 'aria-label': label, 'data-clef': clef })
  const pitchY = (position) => BASELINE - HALF_SPACE * position
  for (const position of [0, 2, 4, 6, 8]) {
    staff.append(staffLine(14, 485, pitchY(position), 1.4, 'note-study-staff-line'))
  }
  staff.append(glyph(clef, 22, pitchY(CLEFS[clef].reference), 'note-study-clef-glyph'))
  notes.forEach((note, index) => {
    const x = 80 + index * 47
    const y = pitchY(note.position)
    const control = svgElement('g', { class: 'note-study-note', role: 'button', tabindex: 0,
      'aria-label': note.spoken + ', ' + CLEFS[clef].title.toLowerCase(), 'aria-pressed': 'false',
      'data-note': note.name, 'data-midi': note.midi })
    control.append(svgElement('rect', { class: 'note-study-hit', x: x - 18, y: 3, width: 44, height: labelY + 2, rx: 3, fill: 'transparent' }))
    for (const position of ledgerLines(note.position)) {
      control.append(staffLine(x - 4, x + 30, pitchY(position), 1.7, 'note-study-ledger'))
    }
    if (accidental !== 'none') control.append(glyph(accidental, x - 18, y, 'note-study-accidental-glyph'))
    control.append(glyph('head', x, y, 'note-study-notehead'))
    const name = svgElement('text', { x: x + 10, y: labelY, 'text-anchor': 'middle',
      'font-size': 21, 'font-weight': 650, fill: 'currentColor', class: 'note-study-label' })
    name.textContent = note.name
    control.append(name)
    const activate = () => selectNote(note, control)
    control.addEventListener('click', activate)
    control.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      if (!event.repeat) activate()
    })
    staff.append(control)
  })
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
  const range = select('range', 'Range', [['staff', 'Staff notes'], ['ledger', 'Staff + ledger lines']])
  const symbols = select('symbols', 'Symbols', [['naturals', 'Naturals'], ['accidentals', 'Show accidentals']])
  const controls = element('div', { className: 'note-study-controls' })
  controls.append(range.container, symbols.container)
  const charts = element('div', { className: 'note-study-charts' })
  const piano = element('div', { className: 'note-study-piano' })
  const feedback = element('p', { className: 'note-study-feedback' })
  feedback.setAttribute('role', 'status')
  const keyboard = element('div', { className: 'keyboard note-study-keyboard' })
  keyboard.setAttribute('role', 'img')
  piano.append(feedback, keyboard)
  root.replaceChildren(controls, charts, piano)

  let selected = noteAt('treble', 0)
  let active

  function choose(note, control, sound = true) {
    active?.setAttribute('aria-pressed', 'false')
    control.setAttribute('aria-pressed', 'true')
    active = control
    selected = note
    let detail = note.name + ' · ' + CLEFS[note.clef].title
    const step = SEMITONES.indexOf(note.midi % 12)
    if (step >= 0 && ACCIDENTALS[note.accidental].transform) {
      detail += ' · Same key as ' + LETTERS[step] + (Math.floor(note.midi / 12) - 1)
    }
    feedback.textContent = detail
    drawKeyboard(keyboard, note)
    if (sound) hear?.([note])
  }

  function render() {
    const extended = range.field.value === 'ledger'
    const accidentals = symbols.field.value === 'accidentals' ? Object.keys(ACCIDENTALS) : ['none']
    const first = extended ? -4 : 0
    const last = extended ? 12 : 8
    if (selected.position < first || selected.position > last || !accidentals.includes(selected.accidental)) {
      selected = noteAt(selected.clef, Math.max(first, Math.min(last, selected.position)))
    }
    charts.replaceChildren(...Object.entries(CLEFS).map(([clef, info]) => {
      const chart = element('section', { className: 'note-study-chart' })
      chart.dataset.clef = clef
      chart.append(element('h2', { text: info.title }), element('p', { className: 'note-study-clue', text: info.clue }))
      for (const accidental of accidentals) {
        if (accidental !== 'none') chart.append(element('h3', { text: ACCIDENTALS[accidental].title }))
        for (let start = first; start <= last; start += COLUMNS) {
          const row = element('div', { className: 'note-study-row note-study-notation' })
          row.dataset.accidental = accidental
          const notes = Array.from({ length: Math.min(last - start + 1, COLUMNS) },
            (_, index) => noteAt(clef, start + index, accidental))
          row.append(engrave(notes, choose))
          chart.append(row)
        }
      }
      return chart
    }))
    const control = charts.querySelector(`[data-clef="${selected.clef}"] [data-note="${selected.name}"]`)
    choose(selected, control, false)
  }

  range.field.onchange = render
  symbols.field.onchange = render
  render()
}

// Leipzig SMuFL outlines, SIL Open Font License 1.1.
// https://book.verovio.org/advanced-topics/smufl.html
const glyphs = {
  treble: 'M441 -245c-23 -4 -48 -6 -76 -6c-59 0 -102 7 -130 20c-88 42 -150 93 -187 154c-26 44 -43 103 -48 176c0 6 -1 13 -1 19c0 54 15 111 45 170c29 57 65 106 110 148s96 85 153 127c-3 16 -8 46 -13 92c-4 43 -5 73 -5 89c0 117 16 172 69 257c34 54 64 82 89 82 c21 0 43 -30 69 -92s39 -115 41 -159v-15c0 -109 -21 -162 -67 -241c-13 -20 -63 -90 -98 -118c-13 -9 -25 -19 -37 -29l31 -181c8 1 18 2 28 2c58 0 102 -12 133 -35c59 -43 92 -104 98 -184c1 -7 1 -15 1 -22c0 -123 -87 -209 -181 -248c8 -57 17 -110 25 -162 c5 -31 6 -58 6 -80c0 -30 -5 -53 -14 -70c-35 -64 -88 -99 -158 -103c-5 0 -11 -1 -16 -1c-37 0 -72 10 -108 27c-50 24 -77 59 -80 105v11c0 29 7 55 20 76c18 28 45 42 79 44h6c49 0 93 -42 97 -87v-9c0 -51 -34 -86 -105 -106c17 -24 51 -36 102 -36c62 0 116 43 140 85 c9 16 13 41 13 74c0 20 -1 42 -5 67c-8 53 -18 106 -26 159zM461 939c-95 0 -135 -175 -135 -286c0 -24 2 -48 5 -71c50 39 92 82 127 128c40 53 60 100 60 140v8c-4 53 -22 81 -55 81h-2zM406 119l54 -326c73 25 110 78 110 161c0 7 0 15 -1 23c-7 95 -57 142 -151 142h-12 zM382 117c-72 -2 -128 -47 -128 -120v-7c2 -46 43 -99 75 -115c-3 -2 -7 -5 -10 -10c-70 33 -116 88 -123 172v11c0 68 44 126 88 159c23 17 49 29 78 36l-29 170c-21 -13 -52 -37 -92 -73c-50 -44 -86 -84 -109 -119c-45 -69 -67 -130 -67 -182v-13c5 -68 35 -127 93 -176 s125 -73 203 -73c25 0 50 3 75 9c-19 111 -36 221 -54 331z',
  bass: 'M582 -120c0 32 26 58 58 58s58 -26 58 -58s-26 -58 -58 -58s-58 26 -58 58zM582 120c0 32 26 58 58 58s58 -26 58 -58s-26 -58 -58 -58s-58 26 -58 58zM158 96c51 0 73 -14 88 -49l16 -39c0 -17 -2 -30 -7 -40c-3 -11 -10 -21 -19 -31c-17 -18 -49 -43 -84 -43 c-55 0 -77 13 -112 44c-24 21 -35 55 -35 100c0 46 14 81 32 112c30 52 71 79 137 93l36 6l26 2c154 0 235 -68 274 -182c11 -32 18 -68 18 -107c0 -103 -26 -182 -68 -250c-89 -145 -234 -230 -412 -288l-30 -5c-9 0 -14 3 -14 8c3 10 5 11 10 16c35 15 70 30 96 44l78 43 c96 57 162 136 197 258c9 33 17 60 22 100c3 22 5 35 6 39c-7 69 -16 115 -23 140s-4 22 -16 40c-8 12 -19 23 -31 34c-24 21 -62 44 -118 44c-48 0 -84 -8 -113 -28c-28 -19 -42 -44 -42 -73v-16c2 -5 3 -9 4 -11c24 22 52 39 84 39z',
  head: 'M198 133c102 0 207 -45 207 -133c0 -92 -118 -133 -227 -133c-101 0 -178 46 -178 133c0 88 93 133 198 133zM293 -21c0 14 -3 29 -8 44c-7 20 -18 38 -33 54c-20 21 -43 31 -68 31l-20 -2c-15 -5 -27 -14 -36 -28c-4 -9 -6 -17 -8 -24s-3 -16 -3 -27c0 -15 3 -34 9 -57 s18 -41 34 -55c15 -15 36 -23 62 -23c4 0 10 1 18 2c19 5 32 15 40 30s13 34 13 55z',
  sharp: 'M136 186v169h17v-164l44 14v-91l-44 -14v-165l44 12v-91l-44 -13v-155h-17v150l-76 -22v-155h-17v149l-43 -13v90l43 14v167l-43 -14v92l43 13v169h17v-163zM60 73v-167l76 22v168z',
  flat: 'M20 110c32 16 54 27 93 27c26 0 35 -3 54 -13c13 -7 24 -20 27 -38l4 -25c0 -28 -16 -57 -45 -89c-23 -25 -39 -44 -65 -68l-88 -79v644h20v-359zM90 106c-32 0 -48 -10 -70 -29v-194c31 31 54 59 71 84c21 32 32 59 32 84c0 9 1 16 1 20c0 14 -3 21 -11 30l-8 3z',
  natural: 'M0 -188v539h18v-191l139 22v-533h-17v186zM18 -100l122 17v176l-122 -19v-174z',
}
