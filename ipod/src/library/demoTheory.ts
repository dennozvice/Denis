/**
 * Teoria musicale minima per i brani dimostrativi: altezze, scale, accordi, progressioni,
 * arpeggi, linee di basso e melodie, tutto generato in modo riproducibile da un seme.
 * Niente DOM né Web Audio: così il modulo si prova in node e demo.ts contiene solo il "suono".
 */

export type Mode = 'major' | 'minor'

export interface Chord {
  /** Grado della scala (1–7) su cui è costruito. */
  degree: number
  /** Fondamentale (MIDI). */
  root: number
  /** Note dell'accordo (MIDI), dalla fondamentale in su. */
  notes: number[]
}

export interface Progression {
  /** Tonica (MIDI), es. 48 = Do3. */
  key: number
  mode: Mode
  /** Battiti al minuto. */
  tempo: number
  /** Un accordo per battuta (4/4), da ripetere in ciclo. */
  chords: Chord[]
}

export interface MelodyNote {
  /** Posizione in quarti dall'inizio del brano. */
  beat: number
  midi: number
  /** Durata in quarti. */
  beats: number
}

/** PRNG mulberry32: piccolo e riproducibile (stesso seme → stessa sequenza, quindi stesso brano). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Intero casuale in [min, max] (estremi inclusi). */
export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!
}

/** Frequenza (Hz) di una nota MIDI, con La4 = 69 = 440 Hz. */
export function noteToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

export const SCALES: Record<Mode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
}

/** Pentatoniche: consonanti su tutti gli accordi diatonici, perfette per una melodia "sicura". */
export const PENTATONIC: Record<Mode, readonly number[]> = {
  major: [0, 2, 4, 7, 9],
  minor: [0, 3, 5, 7, 10],
}

/** Classe di altezza 0–11 (Do = 0), anche per numeri negativi. */
export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12
}

/** True se la nota appartiene alla scala (insieme di intervalli) costruita su `key`. */
export function inScale(midi: number, key: number, intervals: readonly number[]): boolean {
  return intervals.includes(pitchClass(midi - key))
}

/** Note (MIDI) della scala a partire da `key`, su `octaves` ottave, tonica finale inclusa. */
export function scaleNotes(key: number, mode: Mode, octaves = 1): number[] {
  const out: number[] = []
  for (let o = 0; o < octaves; o++) for (const i of SCALES[mode]) out.push(key + 12 * o + i)
  out.push(key + 12 * octaves)
  return out
}

/** Triade (o quadriade con `seventh`) sul grado `degree` (1–7): terze diatoniche sovrapposte. */
export function chordOnDegree(key: number, mode: Mode, degree: number, seventh = false): Chord {
  const scale = SCALES[mode]
  const base = degree - 1
  const steps = seventh ? [0, 2, 4, 6] : [0, 2, 4]
  const notes = steps.map((s) => key + scale[(base + s) % 7]! + 12 * Math.floor((base + s) / 7))
  return { degree, root: notes[0]!, notes }
}

/** Fondamentale dell'accordo portata nell'ottava che inizia a `low` (per bassi e pedali). */
export function bassRoot(chord: Chord, low: number): number {
  return low + pitchClass(chord.root - low)
}

/** Progressioni collaudate (gradi): girano bene in ciclo, senza sorprese. */
const PROGRESSIONS: Record<Mode, readonly (readonly number[])[]> = {
  major: [
    [1, 5, 6, 4],
    [1, 6, 4, 5],
    [6, 4, 1, 5],
    [1, 4, 6, 5],
    [2, 5, 1, 6],
    [1, 3, 6, 4],
  ],
  minor: [
    [1, 6, 3, 7],
    [1, 7, 6, 7],
    [1, 4, 6, 5],
    [6, 7, 1, 1],
    [1, 3, 7, 6],
    [1, 6, 7, 5],
  ],
}

export interface ProgressionOptions {
  tempoMin?: number
  tempoMax?: number
  /** 4 battute (un giro) o 8 (due giri, il secondo con chiusura diversa). */
  bars?: 4 | 8
  /** Probabilità di scegliere il modo minore (0 = mai, 1 = sempre). */
  minorBias?: number
  /** Quadriadi invece di triadi (più "jazz"). */
  seventh?: boolean
}

export function generateProgression(seed: number, opts: ProgressionOptions = {}): Progression {
  const rng = mulberry32(seed)
  const mode: Mode = rng() < (opts.minorBias ?? 0.5) ? 'minor' : 'major'
  // Do3–La3: fondamentali in zona calda ma leggibile, le voci sopra restano in medio registro
  const key = randInt(rng, 48, 57)
  const tempo = randInt(rng, opts.tempoMin ?? 70, opts.tempoMax ?? 120)
  const first = pick(rng, PROGRESSIONS[mode])
  let degrees = [...first]
  if ((opts.bars ?? 4) === 8) {
    // Secondo giro: stesso inizio ma chiusura diversa (dominante o tonica), così si sente una frase
    const second = [...first]
    second[second.length - 1] = mode === 'major' || rng() < 0.5 ? 5 : 1
    degrees = rng() < 0.6 ? [...first, ...second] : [...first, ...pick(rng, PROGRESSIONS[mode])]
  }
  const chords = degrees.map((d) => chordOnDegree(key, mode, d, opts.seventh ?? false))
  return { key, mode, tempo, chords }
}

export type ArpPattern = 'up' | 'down' | 'updown' | 'pingpong'
export const ARP_PATTERNS: readonly ArpPattern[] = ['up', 'down', 'updown', 'pingpong']

/** Note dell'arpeggio sull'accordo esteso a `octaves` ottave, per `steps` posizioni (es. 16 sedicesimi). */
export function arpeggioNotes(chord: Chord, octaves: number, steps: number, pattern: ArpPattern): number[] {
  const pool: number[] = []
  for (let o = 0; o < octaves; o++) for (const n of chord.notes) pool.push(n + 12 * o)
  pool.push(chord.root + 12 * octaves)
  let seq: number[]
  switch (pattern) {
    case 'up':
      seq = pool
      break
    case 'down':
      seq = [...pool].reverse()
      break
    case 'updown':
      seq = [...pool, ...pool.slice(1, -1).reverse()]
      break
    case 'pingpong':
      // Fondamentale alternata alle altre note: effetto "pedale"
      seq = []
      for (let i = 1; i < pool.length; i++) seq.push(pool[0]!, pool[i]!)
      break
  }
  const out: number[] = []
  for (let i = 0; i < steps; i++) out.push(seq[i % seq.length]!)
  return out
}

/** Linea di basso su otto ottavi: fondamentale, quinta e ottava con qualche pausa (`null`). */
export function bassPattern(chord: Chord, rng: () => number, low: number): (number | null)[] {
  const root = bassRoot(chord, low)
  // La quinta dell'accordo (diminuita sul VII, così resta consonante), non quella giusta "a prescindere"
  const fifth = root + (chord.notes[2]! - chord.root)
  const octave = root + 12
  const shapes: (number | null)[][] = [
    [root, null, root, null, fifth, null, root, null],
    [root, root, null, root, null, fifth, root, null],
    [root, null, null, root, null, null, fifth, octave],
    [root, null, root, fifth, root, null, octave, fifth],
    [root, null, octave, null, root, null, fifth, null],
  ]
  return pick(rng, shapes)
}

export interface MelodyOptions {
  /** Probabilità (0–1) che una posizione di ottavo suoni; sui tempi forti è più alta. */
  density: number
  /** Estremi (MIDI) entro cui resta la melodia. */
  low: number
  high: number
  bars: number
}

/**
 * Melodia pentatonica sopra gli accordi, a ottavi con pause: passi piccoli nella scala e,
 * sui tempi forti, preferenza per una nota dell'accordo vicina. Le note non si sovrappongono.
 */
export function generateMelody(rng: () => number, prog: Progression, opts: MelodyOptions): MelodyNote[] {
  const pent = PENTATONIC[prog.mode]
  const pool: number[] = []
  for (let m = opts.low; m <= opts.high; m++) if (inScale(m, prog.key, pent)) pool.push(m)
  if (pool.length === 0) return []
  let idx = Math.floor(pool.length / 2)
  const out: MelodyNote[] = []
  for (let bar = 0; bar < opts.bars; bar++) {
    const chord = prog.chords[bar % prog.chords.length]!
    const chordPcs = chord.notes.map(pitchClass)
    let step = 0
    while (step < 8) {
      const strong = step % 4 === 0
      const prob = strong ? Math.min(1, opts.density + 0.35) : opts.density
      if (rng() >= prob) {
        step++
        continue
      }
      if (strong && rng() < 0.75) {
        // Verso la nota dell'accordo più vicina in una direzione casuale (al massimo 4 gradini)
        const dir = rng() < 0.5 ? -1 : 1
        for (let k = 1; k <= 4; k++) {
          const cand = idx + dir * k
          if (cand < 0 || cand >= pool.length) break
          if (chordPcs.includes(pitchClass(pool[cand]!))) {
            idx = cand
            break
          }
        }
      } else {
        idx = Math.max(0, Math.min(pool.length - 1, idx + randInt(rng, -2, 2)))
      }
      // Durate in ottavi: di norma uno, a volte un quarto, verso fine battuta una nota lunga
      let len = 1
      if (step % 2 === 0 && rng() < 0.35) len = 2
      if (step >= 6 && rng() < 0.5) len = 8 - step
      out.push({ beat: bar * 4 + step / 2, midi: pool[idx]!, beats: len / 2 })
      step += len
    }
  }
  return out
}
