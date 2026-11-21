const FRAME_SIZE = 16384
const FIRST_KEY = 21
const KEY_COUNT = 88
const OCTAVE_ONSET_WINDOW = 195
const OCTAVE_EVIDENCE_WINDOW = 205
const OCTAVE_RELEASE_FRAMES = 4
const sorted = (notes) => [...new Set(notes)].sort((a, b) => a - b)

function spectrum(size) {
  const real = new Float32Array(size)
  const imaginary = new Float32Array(size)
  const window = new Float32Array(size)
  const order = new Uint16Array(size)
  const cos = new Float32Array(size / 2)
  const sin = new Float32Array(size / 2)
  for (let index = 0; index < size; index++) {
    order[index] = (order[index >> 1] >> 1) | (((index & 1) * size) / 2)
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / size)
  }
  for (let index = 0; index < size / 2; index++) {
    const angle = (-2 * Math.PI * index) / size
    cos[index] = Math.cos(angle)
    sin[index] = Math.sin(angle)
  }
  return (samples, power) => {
    const offset = samples.length - size
    for (let index = 0; index < size; index++) {
      real[order[index]] = samples[offset + index] * window[index]
      imaginary[index] = 0
    }
    for (let span = 2; span <= size; span *= 2) {
      const half = span / 2
      const stride = size / span
      for (let base = 0; base < size; base += span) {
        for (let index = 0; index < half; index++) {
          const left = base + index
          const right = left + half
          const phase = index * stride
          const re = real[right] * cos[phase] - imaginary[right] * sin[phase]
          const im = real[right] * sin[phase] + imaginary[right] * cos[phase]
          real[right] = real[left] - re
          imaginary[right] = imaginary[left] - im
          real[left] += re
          imaginary[left] += im
        }
      }
    }
    for (let index = 0; index < power.length; index++) {
      power[index] = real[index] ** 2 + imaginary[index] ** 2
    }
  }
}

function peaksIn(power, sampleRate, size, minimumLevel = 0.00032, startFrequency = 22) {
  const peaks = []
  const binHz = sampleRate / size
  const minimumPower = ((size * minimumLevel) / 4) ** 2
  for (let bin = Math.ceil(startFrequency / binHz); bin < power.length - 1; bin++) {
    const center = power[bin]
    if (center <= power[bin + 1] || center <= power[bin - 1] || center <= minimumPower) continue
    const left = Math.log(power[bin - 1] + 1e-18)
    const right = Math.log(power[bin + 1] + 1e-18)
    const middle = Math.log(center)
    const offset = (0.5 * (left - right)) / (left - 2 * middle + right)
    const frequency = (bin + offset) * binHz
    const level = (4 * Math.exp(0.5 * (middle - 0.25 * (left - right) * offset))) / size
    peaks.push({ frequency, level })
  }
  return peaks
}

function harmonicAt(peak, lower) {
  const ratio = peak.frequency / lower.frequency
  const partial = Math.round(ratio)
  if (partial < 2 || partial > 18 || Math.abs(ratio - partial) > Math.max(0.037 * partial, 0.06)) {
    return 0
  }
  return partial
}

function partialLevel(peaks, frequency, multiple = 1, harmonicTolerance = 0.024) {
  const target = frequency * multiple
  const tolerance = Math.max(4.5, target * (multiple > 1 ? harmonicTolerance : 0.011))
  let level = 0
  for (const peak of peaks) {
    if (Math.abs(peak.frequency - target) <= tolerance) level = Math.max(level, peak.level)
  }
  return level
}

function hasSeparateUpperPartials(peaks, bass, octave) {
  let supported = 0
  for (let partial = 4; partial <= 6; partial++) {
    const even = partialLevel(peaks, octave.frequency, partial)
    const odd = Math.sqrt(
      partialLevel(peaks, bass.frequency, partial * 2 - 1) *
        partialLevel(peaks, bass.frequency, partial * 2 + 1)
    )
    if (even > Math.max(0.0008, octave.level * 0.055, odd * 1.6)) supported++
  }
  return supported >= 2
}

function upperBandConfirmsOctave(peaks, octave, quiet) {
  // A clean seventh upper partial can preserve corroborated onset evidence
  // through brief uncertainty. The neighboring odd bass partials set its
  // local reference, with a floor to avoid treating noise as corroboration.
  const floor = Math.max(quiet * 0.3, octave.level * 0.004)
  const upper = partialLevel(peaks, octave.frequency, 7, 0.028)
  const left = partialLevel(peaks, octave.frequency / 2, 13, 0.028)
  const right = partialLevel(peaks, octave.frequency / 2, 15, 0.028)
  const neighbors = (Math.max(floor, left) + Math.max(floor, right)) / 2
  return upper > 1.65 * neighbors
}

function isolatedPartial(peaks, target) {
  const width = Math.max(4, target * 0.0045)
  let wanted = 0
  let neighbor = 0
  for (const peak of peaks) {
    const distance = Math.abs(peak.frequency - target)
    if (distance <= width) wanted = Math.max(wanted, peak.level)
    else if (distance <= 38) neighbor = Math.max(neighbor, peak.level)
  }
  return wanted > neighbor * 1.15
}

function isWeakSkirt(peaks, peak, pitch) {
  const midi = Math.round(pitch)
  if (Math.abs(pitch - midi) < 0.22) return false
  const strongerNeighbor = peaks.some(
    (other) =>
      other.level > peak.level * 3.5 &&
      Math.abs(Math.round(12 * Math.log2(other.frequency / 440) + 69) - midi) === 1
  )
  return strongerNeighbor && partialLevel(peaks, peak.frequency, 2, 0.009) < peak.level * 0.32
}

function corroboratesBass(peaks, base, minimum) {
  return peaks.some(
    (peak) =>
      peak.level > minimum &&
      Math.abs(peak.frequency / 3 - base) < base * 0.024 &&
      partialLevel(peaks, peak.frequency / 3, 7, 0.009) > minimum
  )
}

function hann(length) {
  return Float32Array.from(
    { length },
    (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / length)
  )
}

function bandLevel(samples, offset, window, frequency, sampleRate) {
  if (frequency >= sampleRate / 2) return 0
  const angle = (2 * Math.PI * frequency) / sampleRate
  const sine = Math.sin(angle)
  const cosine = Math.cos(angle)
  let re = 0
  let im = 0
  let sin = 0
  let cos = 1
  for (let i = 0; i < window.length; i++) {
    const value = samples[offset + i] * window[i]
    re += value * cos
    im += value * sin
    const nextCos = cos * cosine - sin * sine
    sin = sin * cosine + cos * sine
    cos = nextCos
  }
  return Math.hypot(re, im) / window.length
}

function median(values) {
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length / 2)]
}

function corroborateMotion(samples, rate, window, bass, octave, slices, maxEven) {
  // The upper note's fourth partial is shared with the bass's eighth.
  // Compare it with the adjacent odd bass partials to discount changes in
  // overall volume. Ignore ratios dominated by the noise floor.
  const contrast = slices.map(({ offset }) => {
    const upper = bandLevel(samples, offset, window, octave * 4, rate)
    const bassBackground =
      (bandLevel(samples, offset, window, bass * 7, rate) +
        bandLevel(samples, offset, window, bass * 9, rate)) /
      2
    return upper / Math.max(bassBackground, maxEven * 0.035, 0.00006)
  })
  const minimum = Math.min(...contrast)
  const maximum = Math.max(...contrast)
  if (maximum < 0.16) return false
  if (maximum < 1.15 && (maximum - minimum < 0.085 || maximum <= minimum * 1.16)) return false
  if (median(contrast) >= 1) return true

  // A weak third bass partial can make the fourth look independent even
  // on a single string. In that case ask for energy at the upper fundamental.
  const weakThird = median(slices.map(({ base, odd }) => odd / base)) < 0.24
  const strongFourth = median(slices.map(({ even, odd }) => even / Math.max(odd, 0.00006))) > 1.45
  if (!weakThird || !strongFourth) return true
  return (
    median(
      slices.map(({ offset, base }) => bandLevel(samples, offset, window, octave, rate) / base)
    ) >= 1.48
  )
}

function independentlyMoves(samples, rate, bass, octave, weakBass) {
  const length = Math.round(rate * Math.min(0.085, Math.max(0.03, 4 / bass)))
  const window = hann(length)
  const slices = Array.from({ length: 8 }, (_, index) => {
    const offset = Math.round(((samples.length - length) * index) / 7)
    return {
      offset,
      base: bandLevel(samples, offset, window, bass, rate),
      odd: bandLevel(samples, offset, window, bass * 3, rate),
      even: bandLevel(samples, offset, window, octave * 2, rate)
    }
  })
  const maxBase = Math.max(...slices.map((slice) => slice.base))
  const maxEven = Math.max(...slices.map((slice) => slice.even))
  const audible = slices.filter(({ base, even }) => base > maxBase * 0.2 && even > maxEven * 0.2)
  if (audible.length < 3) return false

  // The upper note and the second bass partial share a frequency. Its own second
  // partial is the fourth bass partial, which can grow independently of the
  // unshared bass fundamental. A loud overtone alone provides no such evidence.
  const balance = audible.map(({ base, odd, even }) => even / Math.hypot(base, odd))
  const supportRatio = weakBass ? 0.84 : 0.55
  const supported = audible.filter(({ odd, even }) => even > odd * supportRatio).length
  const earlySupport = audible
    .slice(0, Math.ceil(audible.length / 2))
    .some(({ odd, even }) => even > odd * supportRatio)
  const smallestBalance = Math.min(...balance)
  const evenLevels = audible.map(({ even }) => even)
  const separateRise = audible.some(
    (later, index) =>
      later.even > later.odd * (weakBass ? 0.94 : 0.48) &&
      audible
        .slice(0, index)
        .some(
          (earlier) =>
            later.even > earlier.even * 1.9 &&
            later.base < earlier.base * 0.91 &&
            later.odd < earlier.odd * 1.15
        )
  )
  const movesSeparately =
    separateRise ||
    (supported >= 3 &&
      earlySupport &&
      smallestBalance > 0.145 &&
      Math.max(...balance) > smallestBalance * 1.4 &&
      Math.max(...evenLevels) > Math.min(...evenLevels) * 1.18)
  return movesSeparately && corroborateMotion(samples, rate, window, bass, octave, audible, maxEven)
}

function freshUpperAttack(samples, sampleRate, frequency) {
  const length = Math.min(Math.floor(samples.length / 5), Math.round(sampleRate * 0.027))
  const window = hann(length)
  const levels = (index) => {
    const offset = samples.length - index * length
    return [1, 2].map((partial) =>
      bandLevel(samples, offset, window, frequency * partial, sampleRate)
    )
  }
  const earlier = levels(5)
  const recent = levels(2)
  return (
    recent[0] > Math.max(earlier[0] * 1.35, earlier[0] + 0.0005) &&
    recent[1] > Math.max(earlier[1] * 1.45, earlier[1] + 0.00025)
  )
}

function sampleCurvatureChange(samples, index) {
  return Math.abs(
    samples[index] - 3 * samples[index - 1] + 3 * samples[index - 2] - samples[index - 3]
  )
}

function sampleDiscontinuity(samples, sampleRate, minimumJump, quietFloor) {
  // A dropped or zeroed audio block can join two unrelated waveform phases.
  // Ignore windows with an isolated broadband edge before inferring harmonics.
  const priorStart = Math.round(sampleRate * 0.028)
  const priorEnd = Math.round(sampleRate * 0.012)
  const frameStart = samples.length - FRAME_SIZE
  let abruptOnset = false
  for (let index = frameStart + 36; index < samples.length - 32; index++) {
    const jump = sampleCurvatureChange(samples, index)
    if (jump < minimumJump) continue
    let nearby = 0
    for (let distance = 8; distance <= 32; distance++) {
      nearby = Math.max(
        nearby,
        sampleCurvatureChange(samples, index - distance),
        sampleCurvatureChange(samples, index + distance)
      )
    }
    if (jump <= nearby * 12) continue

    // A strike can begin abruptly after silence. Require audible signal
    // before the edge, including across a missing block of about 10 ms.
    const start = Math.max(frameStart, index - priorStart)
    const end = index - priorEnd
    let energy = 0
    for (let earlier = start; earlier < end; earlier++) energy += samples[earlier] ** 2
    if (start < end && energy > quietFloor ** 2 * (end - start)) return 'interior'
    abruptOnset = true
  }
  return abruptOnset ? 'onset' : null
}

function createPitchAnalysis(sampleRate) {
  const longSpectrum = spectrum(FRAME_SIZE)
  const shortSize = FRAME_SIZE / 2
  const shortSpectrum = spectrum(shortSize)
  const lowPower = new Float32Array(
    Math.min(FRAME_SIZE / 2, Math.ceil((4000 * FRAME_SIZE) / sampleRate))
  )
  const highPower = new Float32Array(
    Math.min(shortSize / 2, Math.ceil((7100 * shortSize) / sampleRate))
  )
  const crossHz = 215
  const silent = { notes: [], uncertainOctaves: new Set() }
  const quietFrame = { ...silent, released: true }
  const interruptedFrame = { ...silent, interrupted: true }
  return (samples, quiet = 0.00025, releaseOnly = false) => {
    if (samples.length < FRAME_SIZE) return silent
    const energySize = FRAME_SIZE / 2
    const tail = samples.length - energySize
    let energy = 0
    for (let index = tail; index < samples.length; index++) energy += samples[index] ** 2
    const rms = Math.sqrt(energy / energySize)
    const quietFloor = Math.max(0.0008, quiet * 2.2)
    if (rms < quietFloor) return quietFrame
    if (releaseOnly) return silent
    const edge = sampleDiscontinuity(
      samples, sampleRate, Math.max(0.004, quiet * 24, rms * 0.1), quietFloor
    )
    if (edge === 'interior') return interruptedFrame

    longSpectrum(samples, lowPower)
    shortSpectrum(samples, highPower)
    const longPeaks = peaksIn(lowPower, sampleRate, FRAME_SIZE)
    const shortPeaks = peaksIn(highPower, sampleRate, shortSize)
    const peaks = [
      ...longPeaks.filter((peak) => peak.frequency < crossHz),
      ...shortPeaks.filter((peak) => peak.frequency >= crossHz)
    ]
    const largest = Math.max(0, ...peaks.map((peak) => peak.level))
    const strongest = peaks
      .map((peak) => peak.level)
      .sort((a, b) => b - a)
      .slice(0, 10)
    const tonalEnergy = strongest.reduce((total, level) => total + level ** 2, 0)
    if (tonalEnergy < rms ** 2 * 0.52) return silent

    const floor = Math.max(0.00075, quiet * 0.9, largest * 0.14)
    const families = []
    const notes = []
    const uncertainOctaves = new Set()
    let witnessPeaks
    for (const peak of peaks) {
      if (peak.level < floor * 0.22) continue
      const pitch = 12 * Math.log2(peak.frequency / 440) + 69
      const midi = Math.round(pitch)
      if (midi < FIRST_KEY || midi >= FIRST_KEY + KEY_COUNT || Math.abs(midi - pitch) > 0.36)
        continue
      // A weak off-center peak beside a strong pitch needs its own overtone.
      if (isWeakSkirt(peaks, peak, pitch)) continue
      // Weak fundamentals need an odd harmonic near and far from the base.
      // An upper octave supplies neither of these two frequencies.
      const corroboratedBass =
        peak.frequency < crossHz &&
        peak.level < largest * 0.28 &&
        (corroboratesBass(longPeaks, peak.frequency, floor * 0.48) ||
          corroboratesBass(shortPeaks, peak.frequency, floor * 0.48))
      const weakBass = corroboratedBass && peak.level < floor
      if (peak.level < floor * 0.65 && !weakBass) continue
      // Very low notes need an upper partial to distinguish a nearby key
      // from a transient that shifts the peak within the long FFT window.
      if (peak.frequency < 165) {
        const second = partialLevel(longPeaks, peak.frequency, 2)
        const third = partialLevel(longPeaks, peak.frequency, 3)
        if (Math.max(second, third) < peak.level * 0.07) continue
      }

      // A piano partial can be stronger than its note's fundamental. At an
      // overlapping pitch, look for the upper note's own partial structure.
      const overlaps = families
        .map((lower) => [lower, harmonicAt(peak, lower)])
        .filter(([, harmonic]) => harmonic > 0)
      let octaveOf
      let weakOctaveBass = false
      if (overlaps.length) {
        const second = partialLevel(peaks, peak.frequency, 2)
        const third = partialLevel(peaks, peak.frequency, 3)
        const explained = overlaps.some(([lower, harmonic]) => {
          const baseline =
            peak.frequency < crossHz
              ? lower.level
              : Math.max(lower.level, partialLevel(shortPeaks, lower.frequency))
          if (harmonic === 2) {
            const secondFrequency = peak.frequency * 2
            const temporalPeaks = secondFrequency < 1760 ? longPeaks : shortPeaks
            // Only the lower register uses the longer envelope check. In higher
            // registers keep the stricter spectral gate and still check attacks.
            const independent =
              lower.frequency >= 250
                ? second >= Math.max(peak.level * 0.48, baseline * 0.3) &&
                  peak.level >= baseline * 0.68
                : second >= Math.max(peak.level * 0.18, baseline * 0.11) &&
                  peak.level >= baseline * 0.26 &&
                  ((!lower.corroboratedBass && hasSeparateUpperPartials(shortPeaks, lower, peak)) ||
                    (isolatedPartial(temporalPeaks, secondFrequency) &&
                      independentlyMoves(
                        samples,
                        sampleRate,
                        lower.frequency,
                        peak.frequency,
                        lower.corroboratedBass
                      )))
            if (independent) {
              octaveOf = lower.midi
              weakOctaveBass = lower.corroboratedBass
            } else if (peak.level >= floor) uncertainOctaves.add(midi)
            return !independent
          }
          if (harmonic >= 5) {
            return (
              peak.level < baseline * 0.65 ||
              second < peak.level * 0.35 ||
              third < peak.level * 0.22
            )
          }
          const multiple = harmonic === 3 ? 0.77 : 0.53
          const anchor = lower.corroboratedBass ? Math.max(baseline, largest * 0.94) : baseline
          return (
            peak.level < anchor * multiple ||
            (second < peak.level * 0.32 && third < peak.level * 0.22)
          )
        })
        if (explained) continue
      }
      families.push({ ...peak, midi, corroboratedBass })
      if (peak.level >= floor || weakBass) {
        const separateAttack =
          octaveOf !== undefined && freshUpperAttack(samples, sampleRate, peak.frequency)
        let octaveCorroborated = false
        if (octaveOf !== undefined) {
          // Only the corroboration path uses the lower calibrated threshold.
          // These peaks cannot create pitches or trigger attacks themselves.
          witnessPeaks ??= peaksIn(lowPower, sampleRate, FRAME_SIZE, quiet * 0.3, 340)
          octaveCorroborated = upperBandConfirmsOctave(witnessPeaks, peak, quiet)
          // A clipped attack can hide the weak bass fundamental. Corroborate
          // its apparent upper octave before treating that partial as a key.
          if (edge === 'onset' && weakOctaveBass && !octaveCorroborated) {
            uncertainOctaves.add(midi)
            continue
          }
        }
        notes.push({ ...peak, midi, octaveOf, separateAttack, octaveCorroborated })
      }
    }
    return { notes, uncertainOctaves }
  }
}

export function createPitchDetector(sampleRate) {
  const analyze = createPitchAnalysis(sampleRate)
  return (samples, quiet) => analyze(samples, quiet).notes
}

export function createNoteTracker() {
  const keys = new Map()
  return (notes, now, uncertainOctaves) => {
    const candidates = new Map(notes.map((note) => [note.midi, note]))
    const attacks = []
    let changed = false
    for (const [midi, { level, octaveOf, separateAttack, octaveCorroborated }] of candidates) {
      let key = keys.get(midi)
      if (!key) {
        key = {
          frames: 0,
          missed: 0,
          down: false,
          valley: Infinity,
          peak: level,
          lastAttack: -Infinity
        }
        keys.set(midi, key)
      }
      key.frames++
      key.missed = 0
      if (key.down && octaveOf !== undefined) key.octave = true
      key.peak = Math.max(key.peak, level)
      if (level < key.peak * 0.64) key.valley = Math.min(key.valley, level)
      const bass = keys.get(octaveOf)
      // A newly prominent harmonic during a held bass note is not a fresh key
      // attack unless the upper partials have recently grown in their own right.
      const allowedOnset =
        !bass?.down || now - bass.lastAttack <= OCTAVE_ONSET_WINDOW || separateAttack
      let confirmed = key.frames >= 3 && allowedOnset
      if (!key.down && octaveOf !== undefined) {
        const evidence = key.octaveEvidence
        if (evidence?.bass === octaveOf && now - evidence.started <= OCTAVE_EVIDENCE_WINDOW) {
          evidence.hits++
          evidence.corroborated ||= octaveCorroborated
        } else {
          key.octaveEvidence = allowedOnset
            ? { bass: octaveOf, started: now, hits: 1, corroborated: octaveCorroborated }
            : undefined
        }
        // Require three confirmed observations even when interference briefly
        // obscures the octave. An uncertain frame only keeps the window open.
        confirmed ||= key.octaveEvidence?.hits >= 3 && key.octaveEvidence.corroborated
      } else if (!key.down) {
        key.octaveEvidence = undefined
      }
      if (
        (!key.down && confirmed) ||
        (key.down &&
          now - key.lastAttack >= 200 &&
          level >= key.valley * 2 &&
          level - key.valley > 0.002)
      ) {
        key.down = true
        key.octave = octaveOf !== undefined
        key.valley = Infinity
        key.peak = level
        key.lastAttack = now
        attacks.push(midi)
        changed = true
      }
    }
    for (const [midi, key] of keys) {
      if (candidates.has(midi)) continue
      if (
        !key.down &&
        key.octaveEvidence &&
        now - key.octaveEvidence.started <= OCTAVE_EVIDENCE_WINDOW &&
        uncertainOctaves?.has(midi)
      ) {
        key.frames = 0
        continue
      }
      key.missed++
      key.frames = 0
      // Confirmation can dip briefly as sustained octave partials mix. Only
      // hold the previous recognition while that band is still audible.
      const releaseFrames = key.octave && uncertainOctaves?.has(midi) ? OCTAVE_RELEASE_FRAMES : 2
      if (!key.down || key.missed >= releaseFrames) {
        changed ||= key.down
        keys.delete(midi)
      }
    }
    if (changed) {
      return {
        active: sorted([...keys].filter(([, key]) => key.down).map(([midi]) => midi)),
        attacks: sorted(attacks)
      }
    }
    return null
  }
}

export function createMicrophoneTracker(sampleRate) {
  // Give 44.1 kHz microphones the same attack history and frequency bins as
  // 48 kHz inputs. Only upsample here, so high frequencies cannot alias back.
  const analysisRate = Math.max(48000, sampleRate)
  const analyze = createPitchAnalysis(analysisRate)
  const normalized = sampleRate < analysisRate ? new Float32Array(FRAME_SIZE) : null
  const stride = sampleRate / analysisRate
  let update = createNoteTracker()
  let waitingForRelease = false
  return (samples, now, quiet) => {
    if (normalized && samples.length >= FRAME_SIZE) {
      const start = samples.length - 1 - (FRAME_SIZE - 1) * stride
      for (let i = 0; i < FRAME_SIZE - 1; i++) {
        const position = start + i * stride
        const before = Math.floor(position)
        const difference = samples[before + 1] - samples[before]
        normalized[i] = samples[before] + (position - before) * difference
      }
      normalized[FRAME_SIZE - 1] = samples[samples.length - 1]
      samples = normalized
    }
    const { notes, uncertainOctaves, interrupted, released } = analyze(samples, quiet, waitingForRelease)
    if (waitingForRelease) {
      if (released) waitingForRelease = false
      return null
    }
    if (interrupted) {
      // Lost sound can hide a wrong note. Its surviving decay cannot count
      // as a fresh strike, even after the damaged audio leaves the window.
      waitingForRelease = true
      update = createNoteTracker()
      return { active: [], attacks: [], interrupted: true }
    }
    return update(notes, now, uncertainOctaves)
  }
}

export function createMicrophoneFrameReader(analyser, sampleRate, onFrame, onGap) {
  // Keep one extra window so a late UI callback can still read the original
  // audio samples for each observation. The audio clock determines their spacing.
  analyser.fftSize = 2 * FRAME_SIZE
  const history = new Float32Array(analyser.fftSize)
  const hop = Math.round(sampleRate * 0.033)
  let nextEnd
  return (readClock) => {
    const audioTime = readClock()
    const end = Math.round(audioTime * sampleRate)
    if (nextEnd !== undefined && end < nextEnd) return
    analyser.getFloatTimeDomainData(history)
    // A render quantum can finish during the copy. The next poll still has
    // the overlapping history, so use a snapshot with an unambiguous timestamp.
    if (audioTime !== readClock()) return
    if (nextEnd === undefined) nextEnd = end
    if (end - nextEnd > history.length - FRAME_SIZE) {
      onGap()
      nextEnd = end
    }
    while (nextEnd <= end) {
      const stop = history.length - (end - nextEnd)
      onFrame(history.subarray(stop - FRAME_SIZE, stop), nextEnd * 1000 / sampleRate)
      nextEnd += hop
    }
  }
}

export function createPianoInput({ onNotes, onStatus, onEnded, beforeAudioFrame }) {
  let session = null

  function stop() {
    if (!session) return
    const current = session
    session = null
    for (const cleanup of current.cleanup) cleanup()
  }

  function end(current, reason) {
    if (session !== current) return
    stop()
    onStatus(reason)
    onEnded(reason)
  }

  function listen(current, target, type, listener) {
    target.addEventListener(type, listener)
    current.cleanup.push(() => target.removeEventListener(type, listener))
  }

  async function startMic(current) {
    const Audio = window.AudioContext || window.webkitAudioContext
    if (!navigator.mediaDevices?.getUserMedia || !Audio) {
      throw new Error('This browser does not offer microphone input.')
    }
    const context = new Audio()
    current.cleanup.push(() => {
      if (context.state !== 'closed') void context.close().catch(() => {})
    })
    // Resume during the tap so browsers that require a user gesture can start audio.
    const resume = context.resume().then(
      () => true,
      () => false
    )
    onStatus('Allow microphone access to listen for your piano.')
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false
      }
    })
    const release = () => stream.getTracks().forEach((track) => track.stop())
    if (session !== current) {
      release()
      return false
    }
    current.cleanup.push(release)
    for (const track of stream.getAudioTracks()) {
      listen(current, track, 'ended', () =>
        end(current, 'The microphone disconnected. Start listening again.')
      )
    }
    if (!(await resume)) throw new Error('The microphone audio could not start. Tap to try again.')
    if (session !== current) return false
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    source.connect(analyser)
    current.cleanup.push(() => source.disconnect())

    let trackNotes = createMicrophoneTracker(context.sampleRate)
    const calibration = []
    let quiet = 0.00025
    let calibrated = false
    let ready
    const calibrationComplete = new Promise((resolve) => {
      ready = resolve
    })
    current.cleanup.push(() => ready(false))
    const deadline = setTimeout(() => {
      end(current, 'The microphone did not start receiving audio. Tap to try again.')
    }, 2400)
    current.cleanup.push(() => clearTimeout(deadline))
    onStatus('Stay quiet for a moment while the microphone checks the room.')
    function observeFrame(samples, time) {
      if (!calibrated) {
        const end = samples.length
        let squares = 0
        for (let i = end - 1024; i < end; i++) squares += samples[i] ** 2
        calibration.push(Math.sqrt(squares / 1024))
        if (calibration.length >= 11) {
          quiet = Math.max(quiet, calibration.sort((a, b) => a - b)[3])
          calibrated = true
          clearTimeout(deadline)
          onStatus('Microphone listening. Play on your piano.')
          ready(true)
        }
        return
      }
      const snapshot = trackNotes(samples, time, quiet)
      if (snapshot?.interrupted) {
        onNotes(snapshot, time)
        onStatus('Audio cut out. Release the keys and play the note or chord again.')
        return
      }
      beforeAudioFrame?.(time)
      if (snapshot) onNotes(snapshot, time)
    }
    function discardStaleNotes() {
      calibration.length = 0
      trackNotes = createMicrophoneTracker(context.sampleRate)
      if (calibrated) onNotes({ active: [], attacks: [] })
    }
    const readFrames = createMicrophoneFrameReader(
      analyser, context.sampleRate, observeFrame, discardStaleNotes
    )
    const readAudioTime = () => context.currentTime
    const timer = setInterval(() => {
      if (context.state === 'running') readFrames(readAudioTime)
    }, 20)
    current.cleanup.push(() => clearInterval(timer))
    listen(current, context, 'statechange', () => {
      if (context.state === 'interrupted' || context.state === 'closed') {
        end(current, 'The microphone was interrupted. Start listening again.')
      }
    })
    return await calibrationComplete
  }

  async function startMidi(current) {
    if (!navigator.requestMIDIAccess) throw new Error('This browser does not offer Web MIDI input.')
    onStatus('Allow MIDI access to connect your keyboard.')
    const access = await navigator.requestMIDIAccess({ sysex: false })
    if (session !== current) return false
    const inputs = new Map()
    const publish = (attacks) => {
      const notes = []
      for (const keys of inputs.values()) notes.push(...keys.values())
      onNotes({ active: sorted(notes), attacks })
    }
    function message(keys, { data }) {
      if (session !== current || data.length < 3) return
      const [status, key, value] = data
      const channel = status & 15
      const command = status & 0xf0
      if (command === 0xb0 && (key === 120 || key === 123)) {
        for (const id of keys.keys()) {
          if (id >> 7 === channel) keys.delete(id)
        }
        publish([])
      }
      const id = channel * 128 + key
      if (command === 0x90 && value > 0) {
        keys.set(id, key)
        publish([key])
      } else if (command === 0x80 || command === 0x90) {
        if (keys.delete(id)) publish([])
      }
    }
    function refresh() {
      let released = false
      for (const [port, keys] of inputs) {
        if (port.state === 'connected') continue
        port.onmidimessage = null
        inputs.delete(port)
        released ||= keys.size > 0
      }
      for (const port of access.inputs.values()) {
        if (port.state !== 'connected' || inputs.has(port)) continue
        const keys = new Map()
        inputs.set(port, keys)
        port.onmidimessage = (event) => message(keys, event)
      }
      if (released) publish([])
      if (!inputs.size) end(current, 'No MIDI keyboard is connected. Connect one and try again.')
    }
    current.cleanup.push(() => {
      for (const port of inputs.keys()) {
        port.onmidimessage = null
        void port.close?.().catch(() => {})
      }
      inputs.clear()
    })
    listen(current, access, 'statechange', refresh)
    refresh()
    if (session !== current) return false
    onStatus('MIDI keyboard ready. Play on your keyboard.')
    return true
  }

  async function start(source) {
    stop()
    const current = { cleanup: [] }
    session = current
    if (source !== 'midi' && source !== 'mic') {
      end(current, 'Choose a microphone or MIDI keyboard.')
      return false
    }
    if (window.isSecureContext === false) {
      end(current, 'Listening requires HTTPS or localhost.')
      return false
    }
    if (document.hidden) {
      end(current, 'Open the reader to start listening.')
      return false
    }
    const leave = () => end(current, 'Listening paused. Start again when ready.')
    listen(current, window, 'pagehide', leave)
    listen(current, window, 'hashchange', leave)
    listen(current, document, 'visibilitychange', () => {
      if (document.hidden) leave()
    })
    try {
      return source === 'midi' ? await startMidi(current) : await startMic(current)
    } catch (error) {
      const denied = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(
        error.name
      )
      const device = source === 'midi' ? 'MIDI' : 'microphone'
      const reason = denied
        ? `Allow ${device} access in your browser settings to listen.`
        : error.name === 'NotFoundError'
          ? 'No microphone was found.'
          : error.name === 'NotReadableError'
            ? 'The microphone is busy or unavailable.'
            : error.message || `The ${device} could not start.`
      end(current, reason)
      return false
    }
  }

  return { start, stop }
}
