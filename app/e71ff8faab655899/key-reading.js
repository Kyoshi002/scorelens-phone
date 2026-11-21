/** Explain how to recognize the lesson's written key signature. */
export function recognitionClue(key) {
  if (!key) return ''

  const [major, minor] =
    key.mode === 'major' ? [key.label, key.relativeLabel] : [key.relativeLabel, key.label]
  const tonic = major.split(' ')[0]
  let rule

  if (key.fifths > 0) {
    const lastSharp = key.accidentals.at(-1)
    rule = `Go up a half step from the last sharp, ${lastSharp}, to ${tonic}, the major tonic.`
  } else if (key.fifths < -1) {
    const nextToLastFlat = key.accidentals.at(-2)
    rule = `The next-to-last flat is ${nextToLastFlat}, the major tonic.`
  } else if (key.fifths === -1) {
    rule = 'With just one flat (B♭), the major tonic is F.'
  } else {
    rule = 'A key signature with no sharps or flats has C as its major tonic.'
  }

  return `${rule} ${major} and ${minor} share this signature. Listen at a phrase ending (a cadence) for which tonic chord feels like home.`
}
