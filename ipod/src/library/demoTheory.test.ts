import { describe, expect, it } from 'vitest'
import {
  ARP_PATTERNS,
  PENTATONIC,
  SCALES,
  arpeggioNotes,
  bassPattern,
  bassRoot,
  chordOnDegree,
  generateMelody,
  generateProgression,
  inScale,
  mulberry32,
  noteToFreq,
  pitchClass,
  scaleNotes,
  type Mode,
} from './demoTheory'

const MODES: Mode[] = ['major', 'minor']

describe('mulberry32', () => {
  it('è deterministico per seme e produce valori in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 20 }, () => a())
    const seqB = Array.from({ length: 20 }, () => b())
    expect(seqA).toEqual(seqB)
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(new Set(seqA).size).toBeGreaterThan(15)
  })
  it('semi diversi danno sequenze diverse', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(Array.from({ length: 5 }, () => b()))
  })
})

describe('noteToFreq', () => {
  it('rispetta il La4 = 440 Hz e le ottave', () => {
    expect(noteToFreq(69)).toBe(440)
    expect(noteToFreq(57)).toBeCloseTo(220, 6)
    expect(noteToFreq(81)).toBeCloseTo(880, 6)
    expect(noteToFreq(60)).toBeCloseTo(261.63, 2)
    expect(noteToFreq(36)).toBeCloseTo(65.41, 2)
  })
})

describe('scale e accordi', () => {
  it('pitchClass gestisce anche i negativi', () => {
    expect(pitchClass(60)).toBe(0)
    expect(pitchClass(61)).toBe(1)
    expect(pitchClass(-1)).toBe(11)
  })
  it('scaleNotes copre le ottave richieste e finisce sulla tonica', () => {
    const notes = scaleNotes(60, 'major', 2)
    expect(notes).toHaveLength(15)
    expect(notes[0]).toBe(60)
    expect(notes.at(-1)).toBe(84)
    expect(scaleNotes(57, 'minor')).toEqual([57, 59, 60, 62, 64, 65, 67, 69])
  })
  it('ogni accordo diatonico contiene solo note della scala, con la fondamentale sul grado giusto', () => {
    for (const mode of MODES) {
      for (let degree = 1; degree <= 7; degree++) {
        const key = 48 + degree
        const triad = chordOnDegree(key, mode, degree)
        expect(triad.notes).toHaveLength(3)
        expect(triad.root).toBe(key + SCALES[mode][degree - 1]!)
        for (const n of triad.notes) expect(inScale(n, key, SCALES[mode])).toBe(true)
        const tetrad = chordOnDegree(key, mode, degree, true)
        expect(tetrad.notes).toHaveLength(4)
        for (const n of tetrad.notes) expect(inScale(n, key, SCALES[mode])).toBe(true)
        // Le note salgono (terze sovrapposte)
        for (let i = 1; i < tetrad.notes.length; i++) expect(tetrad.notes[i]!).toBeGreaterThan(tetrad.notes[i - 1]!)
      }
    }
  })
  it('costruisce le triadi classiche di Do maggiore', () => {
    expect(chordOnDegree(60, 'major', 1).notes).toEqual([60, 64, 67])
    expect(chordOnDegree(60, 'major', 5).notes).toEqual([67, 71, 74])
    expect(chordOnDegree(60, 'major', 6).notes).toEqual([69, 72, 76])
    expect(chordOnDegree(60, 'minor', 1, true).notes).toEqual([60, 63, 67, 70])
  })
  it('bassRoot porta la fondamentale nell’ottava richiesta', () => {
    const chord = chordOnDegree(57, 'major', 6) // Fa# minore, fondamentale 66
    expect(bassRoot(chord, 36)).toBe(42)
    expect(pitchClass(bassRoot(chord, 36))).toBe(pitchClass(chord.root))
    expect(bassRoot(chordOnDegree(48, 'major', 1), 36)).toBe(36)
  })
})

describe('generateProgression', () => {
  it('è deterministica per seme e cambia con il seme', () => {
    expect(generateProgression(7)).toEqual(generateProgression(7))
    const distinct = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(generateProgression(i + 1))))
    expect(distinct.size).toBeGreaterThan(10)
  })
  it('rispetta tempo, numero di battute e scala', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const bars = seed % 2 === 0 ? 8 : 4
      const p = generateProgression(seed, { tempoMin: 80, tempoMax: 90, bars })
      expect(p.tempo).toBeGreaterThanOrEqual(80)
      expect(p.tempo).toBeLessThanOrEqual(90)
      expect(p.chords).toHaveLength(bars)
      expect(p.key).toBeGreaterThanOrEqual(48)
      expect(p.key).toBeLessThanOrEqual(57)
      for (const c of p.chords) {
        expect(c.degree).toBeGreaterThanOrEqual(1)
        expect(c.degree).toBeLessThanOrEqual(7)
        for (const n of c.notes) expect(inScale(n, p.key, SCALES[p.mode])).toBe(true)
      }
    }
  })
  it('minorBias forza il modo', () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(generateProgression(seed, { minorBias: 0 }).mode).toBe('major')
      expect(generateProgression(seed, { minorBias: 1 }).mode).toBe('minor')
    }
  })
})

describe('arpeggioNotes', () => {
  it('usa solo note dell’accordo e ha la lunghezza richiesta', () => {
    const chord = chordOnDegree(50, 'minor', 1)
    const pcs = new Set(chord.notes.map(pitchClass))
    for (const pattern of ARP_PATTERNS) {
      const notes = arpeggioNotes(chord, 2, 16, pattern)
      expect(notes).toHaveLength(16)
      for (const n of notes) expect(pcs.has(pitchClass(n))).toBe(true)
    }
    expect(arpeggioNotes(chord, 1, 4, 'up')).toEqual([50, 53, 57, 62])
    expect(arpeggioNotes(chord, 1, 4, 'down')).toEqual([62, 57, 53, 50])
  })
})

describe('bassPattern', () => {
  it('suona fondamentale, quinta e ottava nell’ottava bassa, con pause', () => {
    const chord = chordOnDegree(55, 'major', 4)
    const rng = mulberry32(3)
    const line = bassPattern(chord, rng, 36)
    expect(line).toHaveLength(8)
    const allowed = new Set([pitchClass(chord.root), pitchClass(chord.notes[2]!)])
    let played = 0
    for (const n of line) {
      if (n === null) continue
      played++
      expect(n).toBeGreaterThanOrEqual(36)
      expect(n).toBeLessThanOrEqual(36 + 23)
      expect(allowed.has(pitchClass(n))).toBe(true)
    }
    expect(played).toBeGreaterThan(0)
    expect(line[0]).toBe(bassRoot(chord, 36))
  })
})

describe('generateMelody', () => {
  it('resta nella pentatonica e nell’estensione, senza sovrapposizioni, ed è deterministica', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const prog = generateProgression(seed, { bars: 8 })
      const opts = { density: 0.5, low: 72, high: 86, bars: 10 }
      const melody = generateMelody(mulberry32(seed), prog, opts)
      expect(melody).toEqual(generateMelody(mulberry32(seed), prog, opts))
      expect(melody.length).toBeGreaterThan(10)
      let lastEnd = 0
      for (const n of melody) {
        expect(inScale(n.midi, prog.key, PENTATONIC[prog.mode])).toBe(true)
        expect(n.midi).toBeGreaterThanOrEqual(72)
        expect(n.midi).toBeLessThanOrEqual(86)
        expect(n.beat).toBeGreaterThanOrEqual(lastEnd)
        expect(n.beats).toBeGreaterThan(0)
        lastEnd = n.beat + n.beats
      }
      expect(lastEnd).toBeLessThanOrEqual(40)
    }
  })
  it('restituisce una lista vuota se l’estensione non contiene note della scala', () => {
    const prog = generateProgression(1)
    expect(generateMelody(mulberry32(1), prog, { density: 1, low: 80, high: 79, bars: 2 })).toEqual([])
  })
})
