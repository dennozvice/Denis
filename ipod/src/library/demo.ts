/**
 * Brani dimostrativi generati nel browser: dieci pezzi brevi sintetizzati con la Web Audio API
 * (OfflineAudioContext) a partire da un seme fisso, codificati in WAV con tag ID3 e copertina
 * disegnata su canvas. Così la libreria si prova senza alcun file audio nel repository, e i File
 * prodotti passano dalla normale importazione. Tutto è deterministico: stesso seme → stessa musica
 * (il motore Web Audio può differire di ±1 LSB tra una resa e l'altra, inudibile), e nome +
 * dimensione + lastModified fissi fanno sì che una reimportazione non crei doppioni.
 */
import {
  ARP_PATTERNS,
  arpeggioNotes,
  bassPattern,
  bassRoot,
  generateMelody,
  generateProgression,
  inScale,
  mulberry32,
  noteToFreq,
  PENTATONIC,
  pick,
  pitchClass,
  type Chord,
  type MelodyNote,
  type Progression,
  type ProgressionOptions,
} from './demoTheory'
import { encodeWav, type Id3Tags } from './wav'

export type DemoStyle = 'pad' | 'arp' | 'piano' | 'beat' | 'ambient' | 'bass'

export interface DemoTrackSpec {
  title: string
  artist: string
  album: string
  year: number
  trackNo: number
  trackOf: number
  genre: string
  composer: string
  seconds: number
  seed: number
  style: DemoStyle
}

export interface Picture {
  mime: string
  data: Uint8Array
}

interface DemoAlbum {
  artist: string
  album: string
  year: number
  genre: string
  composer: string
}

/** Tre album di tre artisti inventati: nessun riferimento a persone o brani reali. */
const ALBUMS: readonly DemoAlbum[] = [
  { artist: 'Lume', album: 'Notte a Trieste', year: 2021, genre: 'Elettronica', composer: 'Elena Vidali' },
  { artist: 'I Calanchi', album: 'Argilla', year: 2019, genre: 'Ambient', composer: 'Pietro Sabbia' },
  { artist: 'Marea Elettrica', album: 'Faro', year: 2024, genre: 'Pop', composer: 'Marta Ferrante' },
]

function track(
  albumIndex: number,
  trackNo: number,
  trackOf: number,
  title: string,
  seconds: number,
  seed: number,
  style: DemoStyle,
  genre?: string,
): DemoTrackSpec {
  const a = ALBUMS[albumIndex]!
  return {
    title,
    artist: a.artist,
    album: a.album,
    year: a.year,
    trackNo,
    trackOf,
    genre: genre ?? a.genre,
    composer: a.composer,
    seconds,
    seed,
    style,
  }
}

export const DEMO_TRACKS: DemoTrackSpec[] = [
  track(0, 1, 4, 'Bora', 34, 1101, 'pad'),
  track(0, 2, 4, 'Molo Audace', 36, 1102, 'arp'),
  track(0, 3, 4, 'Luci sul golfo', 40, 1103, 'beat'),
  track(0, 4, 4, 'Ultimo tram', 30, 1104, 'bass'),
  track(1, 1, 3, 'Creta', 45, 2201, 'ambient'),
  track(1, 2, 3, 'Pioggia lenta', 38, 2202, 'piano'),
  track(1, 3, 3, 'Sentiero', 32, 2203, 'pad'),
  track(2, 1, 3, 'Faro', 36, 3301, 'arp'),
  track(2, 2, 3, 'Scirocco', 42, 3302, 'beat'),
  track(2, 3, 3, 'Notturno', 28, 3303, 'piano', 'Jazz'),
]

/** Carattere armonico di ogni stile: tempo, lunghezza del giro, inclinazione al minore, quadriadi. */
const STYLE_PROGRESSION: Record<DemoStyle, ProgressionOptions> = {
  pad: { tempoMin: 70, tempoMax: 88, bars: 4, minorBias: 0.6 },
  arp: { tempoMin: 96, tempoMax: 120, bars: 8, minorBias: 0.5 },
  piano: { tempoMin: 72, tempoMax: 96, bars: 8, minorBias: 0.5, seventh: true },
  beat: { tempoMin: 96, tempoMax: 118, bars: 8, minorBias: 0.5 },
  ambient: { tempoMin: 70, tempoMax: 78, bars: 4, minorBias: 0.6 },
  bass: { tempoMin: 84, tempoMax: 104, bars: 8, minorBias: 0.6 },
}

/** Progressione (tonalità, tempo, accordi) di un brano: utile per mostrarla o per i controlli. */
export function progressionFor(spec: DemoTrackSpec): Progression {
  return generateProgression(spec.seed, STYLE_PROGRESSION[spec.style])
}

const SAMPLE_RATE = 22050
/** Dissolvenze ai bordi, in secondi. */
const FADE_SECONDS = 1
/** Picco finale: sotto 0,8 con margine, così nessun lettore satura. */
const PEAK_TARGET = 0.72
/** Volume medio (RMS) a cui pareggiare i brani, così passando dall'uno all'altro non si salta. */
const RMS_TARGET = 0.17

// ---------------------------------------------------------------------------------------------
// Generazione della libreria
// ---------------------------------------------------------------------------------------------

export async function generateDemoLibrary(onProgress?: (done: number, total: number) => void): Promise<File[]> {
  const Offline = offlineContextCtor()
  if (!Offline) {
    throw new Error('Questo browser non supporta la generazione audio (OfflineAudioContext non disponibile).')
  }
  const total = DEMO_TRACKS.length
  const covers = new Map<number, Picture>()
  const files: File[] = []
  onProgress?.(0, total)
  for (let i = 0; i < total; i++) {
    const spec = DEMO_TRACKS[i]!
    const albumIndex = albumIndexOf(spec)
    let picture = covers.get(albumIndex)
    if (!picture) {
      picture = await makeCoverArt(albumIndex, spec.album, spec.artist)
      covers.set(albumIndex, picture)
    }
    const rendered = await renderTrack(Offline, spec)
    const channels = master(rendered)
    const bytes = encodeWav(channels, rendered.sampleRate, tagsFor(spec, picture))
    files.push(new File([toArrayBuffer(bytes)], fileNameFor(spec), { type: 'audio/wav', lastModified: lastModifiedFor(spec) }))
    onProgress?.(i + 1, total)
    await nextMacrotask()
  }
  return files
}

function albumIndexOf(spec: DemoTrackSpec): number {
  const i = ALBUMS.findIndex((a) => a.artist === spec.artist && a.album === spec.album)
  return i < 0 ? 0 : i
}

function fileNameFor(spec: DemoTrackSpec): string {
  return `${String(spec.trackNo).padStart(2, '0')} ${spec.title}.wav`
}

/** Data fissa per brano (mezzogiorno UTC del 1º gennaio dell'anno + minuti = numero traccia). */
function lastModifiedFor(spec: DemoTrackSpec): number {
  return Date.UTC(spec.year, 0, 1, 12, 0, 0) + spec.trackNo * 60_000
}

function tagsFor(spec: DemoTrackSpec, picture: Picture): Id3Tags {
  return {
    title: spec.title,
    artist: spec.artist,
    album: spec.album,
    albumArtist: spec.artist,
    year: spec.year,
    trackNo: spec.trackNo,
    trackOf: spec.trackOf,
    genre: spec.genre,
    composer: spec.composer,
    picture,
  }
}

/** Lascia respirare l'interfaccia tra un brano e l'altro (macrotask, non microtask). */
function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** `File` vuole un ArrayBuffer "vero": riusa quello dei byte se lo coprono per intero, altrimenti copia. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const { buffer } = bytes
  if (buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === buffer.byteLength) return buffer
  return bytes.slice().buffer
}

type OfflineCtor = typeof OfflineAudioContext

function offlineContextCtor(): OfflineCtor | null {
  if (typeof OfflineAudioContext !== 'undefined') return OfflineAudioContext
  const g = globalThis as { webkitOfflineAudioContext?: OfflineCtor }
  return g.webkitOfflineAudioContext ?? null
}

function createOffline(Offline: OfflineCtor, seconds: number): OfflineAudioContext {
  // Qualche WebKit vecchio rifiuta 22050 Hz offline: ripiego a 44100 (file più grande, stessa musica)
  for (const sr of [SAMPLE_RATE, 44100]) {
    try {
      return new Offline(2, Math.round(sr * seconds), sr)
    } catch {
      // prova la frequenza successiva
    }
  }
  throw new Error('Impossibile creare il contesto audio per generare i brani dimostrativi.')
}

// ---------------------------------------------------------------------------------------------
// Resa di un brano
// ---------------------------------------------------------------------------------------------

interface Song {
  ctx: OfflineAudioContext
  rng: () => number
  prog: Progression
  /** Secondi per quarto. */
  spb: number
  /** Ultimo istante utile per far partire una nota (lascia la coda alla dissolvenza). */
  end: number
  /** Ingresso della catena master. */
  bus: GainNode
  noise: AudioBuffer
  waves: { bright: PeriodicWave; mellow: PeriodicWave }
}

async function renderTrack(Offline: OfflineCtor, spec: DemoTrackSpec): Promise<AudioBuffer> {
  const ctx = createOffline(Offline, spec.seconds)
  const prog = progressionFor(spec)
  const rng = mulberry32(spec.seed ^ 0x5bd1e995)
  const bus = ctx.createGain()
  const song: Song = {
    ctx,
    rng,
    prog,
    spb: 60 / prog.tempo,
    end: spec.seconds - 0.6,
    bus,
    noise: makeNoise(ctx, rng),
    waves: pianoWaves(ctx),
  }
  // Catena master: bus → compressore (tiene a bada i picchi) → gain → uscita
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.knee.value = 12
  comp.ratio.value = 4
  comp.attack.value = 0.01
  comp.release.value = 0.25
  const out = ctx.createGain()
  out.gain.value = 0.7
  bus.connect(comp)
  comp.connect(out)
  out.connect(ctx.destination)
  ARRANGERS[spec.style](song)
  return ctx.startRendering()
}

/** Pareggia il volume (RMS) senza superare il picco voluto e applica le dissolvenze (coseno rialzato) ai bordi. */
function master(buffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = []
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c))
  let peak = 0
  let sumSq = 0
  for (const d of channels) {
    for (let i = 0; i < d.length; i++) {
      peak = Math.max(peak, Math.abs(d[i]!))
      sumSq += d[i]! * d[i]!
    }
  }
  const rms = Math.sqrt(sumSq / Math.max(1, buffer.length * channels.length))
  const scale = peak > 0 && rms > 0 ? Math.min(PEAK_TARGET / peak, RMS_TARGET / rms) : 1
  const fade = Math.min(Math.floor(buffer.sampleRate * FADE_SECONDS), Math.floor(buffer.length / 2))
  for (const d of channels) {
    for (let i = 0; i < d.length; i++) {
      let g = scale
      if (i < fade) g *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade)
      const fromEnd = d.length - 1 - i
      if (fromEnd < fade) g *= 0.5 - 0.5 * Math.cos((Math.PI * fromEnd) / fade)
      d[i] = d[i]! * g
    }
  }
  return channels
}

function makeNoise(ctx: OfflineAudioContext, rng: () => number): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = rng() * 2 - 1
  return buf
}

/** Due timbri additivi (parziali sinusoidali): uno brillante per l'attacco, uno morbido per il corpo. */
function pianoWaves(ctx: OfflineAudioContext): Song['waves'] {
  const wave = (amps: number[]) => {
    const real = new Float32Array(amps.length + 1)
    const imag = new Float32Array(amps.length + 1)
    amps.forEach((a, i) => {
      imag[i + 1] = a
    })
    return ctx.createPeriodicWave(real, imag)
  }
  return { bright: wave([1, 0.55, 0.35, 0.22, 0.14, 0.09, 0.05, 0.03]), mellow: wave([1, 0.25]) }
}

// ---------------------------------------------------------------------------------------------
// Inviluppi e nodi di base
// ---------------------------------------------------------------------------------------------

/** Inviluppo "pizzicato": salita quasi istantanea e decadimento esponenziale; ritorna quando fermare la sorgente. */
function pluckEnv(g: AudioParam, t0: number, peak: number, decay: number): number {
  g.setValueAtTime(0, t0)
  g.linearRampToValueAtTime(peak, t0 + 0.004)
  g.setTargetAtTime(0, t0 + 0.004, decay / 5)
  return t0 + 0.004 + decay * 1.2
}

/** Inviluppo con tenuta: attacco lineare, tenuta fino a t0 + hold, rilascio esponenziale. */
function holdEnv(g: AudioParam, t0: number, peak: number, attack: number, hold: number, release: number): number {
  g.setValueAtTime(0, t0)
  g.linearRampToValueAtTime(peak, t0 + attack)
  const tRel = t0 + Math.max(attack, hold)
  g.setValueAtTime(peak, tRel)
  g.setTargetAtTime(0, tRel, release / 5)
  return tRel + release * 1.2
}

interface Voice {
  osc: OscillatorNode
  gain: GainNode
}

/** Timbro: forma d'onda di base o onda periodica (additiva). `PeriodicWave` è un'interfaccia vuota nel DOM, da qui l'involucro. */
type Timbre = OscillatorType | { wave: PeriodicWave }

/** Oscillatore con il proprio gain (a zero) già collegato a `dest`. */
function tone(song: Song, dest: AudioNode, timbre: Timbre, freq: number, detune = 0): Voice {
  const osc = song.ctx.createOscillator()
  if (typeof timbre === 'string') osc.type = timbre
  else osc.setPeriodicWave(timbre.wave)
  osc.frequency.value = freq
  osc.detune.value = detune
  const gain = song.ctx.createGain()
  gain.gain.value = 0
  osc.connect(gain)
  gain.connect(dest)
  return { osc, gain }
}

function panner(song: Song, dest: AudioNode, pan: number): StereoPannerNode {
  const p = song.ctx.createStereoPanner()
  p.pan.value = pan
  p.connect(dest)
  return p
}

/** Passa-basso del pad con un LFO lentissimo sul taglio: il suono "respira". */
function padFilter(song: Song, dest: AudioNode, cutoff: number, depth: number, rate: number): BiquadFilterNode {
  const f = song.ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = cutoff
  f.Q.value = 0.8
  const lfo = song.ctx.createOscillator()
  lfo.frequency.value = rate
  const lg = song.ctx.createGain()
  lg.gain.value = depth
  lfo.connect(lg)
  lg.connect(f.frequency)
  lfo.start(0)
  f.connect(dest)
  return f
}

/** Eco ping-pong: ripetizioni che rimbalzano tra i canali, filtrate in alto come su nastro. */
function pingPongDelay(song: Song, dest: AudioNode, time: number, feedback: number, wet: number): GainNode {
  const input = song.ctx.createGain()
  input.connect(dest)
  const left = song.ctx.createDelay(2)
  left.delayTime.value = time
  const right = song.ctx.createDelay(2)
  right.delayTime.value = time
  const fb = song.ctx.createGain()
  fb.gain.value = feedback
  const lp = song.ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2200
  const wetGain = song.ctx.createGain()
  wetGain.gain.value = wet
  wetGain.connect(dest)
  input.connect(left)
  left.connect(panner(song, wetGain, -0.6))
  left.connect(right)
  right.connect(panner(song, wetGain, 0.6))
  right.connect(lp)
  lp.connect(fb)
  fb.connect(left)
  return input
}

/** Riverbero a convoluzione con risposta all'impulso generata (rumore scuro che si spegne). */
function reverb(song: Song, dest: AudioNode, seconds: number, wet: number): GainNode {
  const input = song.ctx.createGain()
  input.connect(dest)
  const conv = song.ctx.createConvolver()
  conv.buffer = impulseResponse(song, seconds)
  const wetGain = song.ctx.createGain()
  wetGain.gain.value = wet
  input.connect(conv)
  conv.connect(wetGain)
  wetGain.connect(dest)
  return input
}

function impulseResponse(song: Song, seconds: number): AudioBuffer {
  const sr = song.ctx.sampleRate
  const n = Math.floor(sr * seconds)
  const buf = song.ctx.createBuffer(2, n, sr)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    let y = 0
    for (let i = 0; i < n; i++) {
      // Rumore filtrato (meno sibilante) con decadimento esponenziale: una coda morbida
      y += 0.25 * (song.rng() * 2 - 1 - y)
      d[i] = y * Math.exp((-4 * i) / n)
    }
  }
  return buf
}

/** Saturazione morbida (tanh): scalda il sub senza farlo gracchiare. */
function softClip(song: Song, dest: AudioNode, drive: number): WaveShaperNode {
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive)
  }
  const ws = song.ctx.createWaveShaper()
  ws.curve = curve
  ws.oversample = '2x'
  ws.connect(dest)
  return ws
}

// ---------------------------------------------------------------------------------------------
// Strumenti
// ---------------------------------------------------------------------------------------------

interface PadOptions {
  amp: number
  attack: number
  release: number
  /** Triangolo (morbido) invece di dente di sega (pieno). */
  soft: boolean
}

/** Accordo di pad: fondamentale un'ottava sotto + accordo, due oscillatori scordati per nota, uno per lato. */
function padChord(song: Song, dest: AudioNode, chord: Chord, t0: number, dur: number, o: PadOptions): void {
  const notes = [chord.root - 12, ...chord.notes]
  const sides: readonly (readonly [number, number])[] = [
    [-6, -0.45],
    [6, 0.45],
  ]
  for (const n of notes) {
    const f = noteToFreq(n)
    for (const [detune, pan] of sides) {
      const v = tone(song, panner(song, dest, pan), o.soft ? 'triangle' : 'sawtooth', f, detune)
      const stop = holdEnv(v.gain.gain, t0, o.amp, o.attack, dur, o.release)
      v.osc.start(t0)
      v.osc.stop(stop)
    }
  }
}

/** Nota di basso: seno + un filo di triangolo (armonici per gli altoparlanti piccoli). */
function subNote(song: Song, dest: AudioNode, midi: number, t0: number, dur: number, amp: number, attack = 0.012): void {
  const f = noteToFreq(midi)
  const a = tone(song, dest, 'sine', f)
  const b = tone(song, dest, 'triangle', f)
  const stop = holdEnv(a.gain.gain, t0, amp, attack, dur, 0.1)
  holdEnv(b.gain.gain, t0, amp * 0.25, attack, dur, 0.1)
  a.osc.start(t0)
  a.osc.stop(stop)
  b.osc.start(t0)
  b.osc.stop(stop)
}

/** Pizzicato: oscillatore in un passa-basso che si chiude (attacco brillante, coda dolce). */
function pluckNote(song: Song, dest: AudioNode, midi: number, t0: number, amp: number, decay: number, type: OscillatorType = 'triangle'): void {
  const f = noteToFreq(midi)
  const lp = song.ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 1
  lp.frequency.setValueAtTime(Math.min(8000, f * 6), t0)
  lp.frequency.setTargetAtTime(Math.min(8000, f * 1.5), t0, decay / 4)
  lp.connect(dest)
  const v = tone(song, lp, type, f)
  const stop = pluckEnv(v.gain.gain, t0, amp, decay)
  v.osc.start(t0)
  v.osc.stop(stop)
}

/** Voce solista morbida: triangolo + seno all'ottava sotto, vibrato leggero, passa-basso. */
function leadNote(song: Song, dest: AudioNode, midi: number, t0: number, dur: number, amp: number): void {
  const f = noteToFreq(midi)
  const lp = song.ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1800
  lp.Q.value = 0.7
  lp.connect(dest)
  const a = tone(song, lp, 'triangle', f)
  const b = tone(song, lp, 'sine', f / 2)
  const lfo = song.ctx.createOscillator()
  lfo.frequency.value = 5.5
  const lg = song.ctx.createGain()
  lg.gain.value = 5
  lfo.connect(lg)
  lg.connect(a.osc.detune)
  const stop = holdEnv(a.gain.gain, t0, amp, 0.03, dur, 0.25)
  holdEnv(b.gain.gain, t0, amp * 0.5, 0.03, dur, 0.25)
  for (const o of [a.osc, b.osc, lfo]) {
    o.start(t0)
    o.stop(stop)
  }
}

/** Inviluppo da pianoforte: attacco istantaneo, decadimento esponenziale, "pedale su" a t0 + hold. */
function pianoEnv(g: AudioParam, t0: number, peak: number, decay: number, hold: number): number {
  g.setValueAtTime(0, t0)
  g.linearRampToValueAtTime(peak, t0 + 0.005)
  g.setTargetAtTime(0, t0 + 0.005, decay / 3)
  const tRel = t0 + Math.max(0.03, hold)
  g.setTargetAtTime(0, tRel, 0.06)
  return tRel + 0.4
}

/** Nota di pianoforte additivo: parziali brillanti che muoiono in fretta sopra un corpo che dura. */
function pianoNote(song: Song, dest: AudioNode, midi: number, t0: number, dur: number, vel: number): void {
  const f = noteToFreq(midi)
  // Le note gravi risuonano più a lungo, come su uno strumento vero
  const body = 1.6 + Math.max(0, 72 - midi) / 24
  const a = tone(song, dest, { wave: song.waves.bright }, f)
  const b = tone(song, dest, { wave: song.waves.mellow }, f, 1.5)
  const stopA = pianoEnv(a.gain.gain, t0, vel * 0.5, 0.45, dur)
  const stopB = pianoEnv(b.gain.gain, t0, vel * 0.6, body, dur)
  a.osc.start(t0)
  a.osc.stop(stopA)
  b.osc.start(t0)
  b.osc.stop(stopB)
}

/** Campana: parziali inarmonici (come una campana tubolare) con decadimenti diversi. */
function bellNote(song: Song, dest: AudioNode, midi: number, t0: number, amp: number): void {
  const f = noteToFreq(midi)
  const partials: readonly (readonly [number, number, number])[] = [
    [1, 1, 3],
    [2, 0.35, 2.2],
    [2.76, 0.2, 1.6],
    [5.4, 0.08, 0.9],
  ]
  for (const [ratio, a, decay] of partials) {
    const v = tone(song, dest, 'sine', f * ratio)
    const stop = pluckEnv(v.gain.gain, t0, amp * a, decay)
    v.osc.start(t0)
    v.osc.stop(stop)
  }
}

/** Cassa: seno che scende in fretta di altezza (il classico "thump"). */
function kick(song: Song, dest: AudioNode, t0: number, vel: number): void {
  const v = tone(song, dest, 'sine', 150)
  v.osc.frequency.setValueAtTime(150, t0)
  v.osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.09)
  v.gain.gain.setValueAtTime(vel, t0)
  v.gain.gain.setTargetAtTime(0, t0 + 0.02, 0.09)
  v.osc.start(t0)
  v.osc.stop(t0 + 0.6)
}

/** Colpo di rumore filtrato (charleston, rullante): parte da un punto casuale del buffer per non ripetersi uguale. */
function noiseHit(song: Song, dest: AudioNode, t0: number, amp: number, decay: number, type: BiquadFilterType, freq: number, q: number): void {
  const src = song.ctx.createBufferSource()
  src.buffer = song.noise
  src.loop = true
  const f = song.ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = song.ctx.createGain()
  g.gain.value = 0
  src.connect(f)
  f.connect(g)
  g.connect(dest)
  const stop = pluckEnv(g.gain, t0, amp, decay)
  src.start(t0, song.rng() * 0.5)
  src.stop(stop)
}

function hat(song: Song, dest: AudioNode, t0: number, vel: number, open: boolean): void {
  noiseHit(song, dest, t0, vel * 0.2, open ? 0.25 : 0.05, 'highpass', 7000, 0.8)
}

function snare(song: Song, dest: AudioNode, t0: number, vel: number): void {
  noiseHit(song, dest, t0, vel * 0.25, 0.14, 'bandpass', 1800, 0.7)
  const v = tone(song, dest, 'sine', 185)
  const stop = pluckEnv(v.gain.gain, t0, vel * 0.3, 0.08)
  v.osc.start(t0)
  v.osc.stop(stop)
}

// ---------------------------------------------------------------------------------------------
// Arrangiamenti
// ---------------------------------------------------------------------------------------------

function chordAt(song: Song, bar: number): Chord {
  return song.prog.chords[bar % song.prog.chords.length]!
}

function barCount(song: Song): number {
  return Math.ceil(song.end / (song.spb * 4))
}

function forEachBar(song: Song, fn: (bar: number, chord: Chord, t0: number, barLen: number) => void): void {
  const barLen = song.spb * 4
  const n = barCount(song)
  for (let bar = 0; bar < n; bar++) fn(bar, chordAt(song, bar), bar * barLen, barLen)
}

/** Suona una melodia (in quarti) con lo strumento dato, saltando ciò che cade oltre la fine utile. */
function playMelody(song: Song, notes: MelodyNote[], fromBar: number, play: (midi: number, t0: number, dur: number) => void): void {
  for (const n of notes) {
    if (n.beat < fromBar * 4) continue
    const t0 = n.beat * song.spb
    if (t0 > song.end) break
    play(n.midi, t0, n.beats * song.spb * 0.95)
  }
}

/** Tappeto di accordi che respira, pedale di basso e una voce rada con eco. */
function arrangePad(song: Song): void {
  const filter = padFilter(song, song.bus, 900, 450, 0.07)
  const echo = pingPongDelay(song, song.bus, song.spb * 0.75, 0.3, 0.3)
  forEachBar(song, (_bar, chord, t0, barLen) => {
    padChord(song, filter, chord, t0, barLen + 0.3, { amp: 0.07, attack: Math.min(1.4, barLen * 0.4), release: 1.2, soft: false })
    subNote(song, song.bus, bassRoot(chord, 36), t0, barLen - 0.05, 0.16, 0.3)
  })
  const melody = generateMelody(song.rng, song.prog, { density: 0.3, low: 72, high: 86, bars: barCount(song) })
  playMelody(song, melody, 1, (midi, t0, dur) => leadNote(song, echo, midi, t0, dur, 0.16))
}

/** Arpeggio di sedicesimi con eco, sopra un pad morbido e il basso. */
function arrangeArp(song: Song): void {
  const pattern = pick(song.rng, ARP_PATTERNS)
  const echo = pingPongDelay(song, song.bus, song.spb * 0.75, 0.38, 0.4)
  const filter = padFilter(song, song.bus, 700, 250, 0.05)
  const step = song.spb / 4
  forEachBar(song, (_bar, chord, t0, barLen) => {
    padChord(song, filter, chord, t0, barLen + 0.2, { amp: 0.045, attack: 0.8, release: 0.8, soft: true })
    subNote(song, song.bus, bassRoot(chord, 36), t0, barLen - 0.05, 0.18)
    arpeggioNotes(chord, 2, 16, pattern).forEach((midi, i) => {
      const t = t0 + i * step
      if (t > song.end) return
      // Accento sul battere e un filo di variazione per non suonare "da macchina"
      const accent = (i % 4 === 0 ? 1 : 0.7) * (0.9 + song.rng() * 0.1)
      pluckNote(song, echo, midi + 12, t, 0.1 * accent, 0.22, 'sawtooth')
    })
  })
  const melody = generateMelody(song.rng, song.prog, { density: 0.2, low: 79, high: 91, bars: barCount(song) })
  playMelody(song, melody, 4, (midi, t0, dur) => leadNote(song, echo, midi, t0, dur, 0.12))
}

/** Pianoforte: mano sinistra su fondamentale e quinta, accordi sgranati e melodia, con riverbero. */
function arrangePiano(song: Song): void {
  const room = reverb(song, song.bus, 1.8, 0.22)
  const beat = song.spb
  forEachBar(song, (_bar, chord, t0, barLen) => {
    const root = bassRoot(chord, 40)
    pianoNote(song, room, root, t0, beat * 2, 0.5)
    pianoNote(song, room, root + (chord.notes[2]! - chord.root), t0 + beat * 2, beat * 2, 0.4)
    const hits = song.rng() < 0.5 ? [0, 2] : [0, 1.5, 2, 3.5]
    for (const b of hits) {
      const hold = b === 2 || b === 0 ? beat * 1.5 : beat * 0.5
      // Accordo leggermente "sgranato": le note partono a pochi millisecondi di distanza
      chord.notes.forEach((n, i) => pianoNote(song, room, n, t0 + b * beat + i * 0.012, Math.min(hold, barLen - b * beat), 0.3))
    }
  })
  const melody = generateMelody(song.rng, song.prog, { density: 0.45, low: 72, high: 88, bars: barCount(song) })
  playMelody(song, melody, 0, (midi, t0, dur) => pianoNote(song, room, midi, t0, dur, 0.55))
}

/** Batteria sintetica, basso pizzicato, pad e voce: la prima battuta è un'introduzione senza batteria. */
function arrangeBeat(song: Song): void {
  const drums = song.ctx.createGain()
  drums.connect(song.bus)
  const filter = padFilter(song, song.bus, 1000, 300, 0.06)
  const echo = pingPongDelay(song, song.bus, song.spb * 0.75, 0.3, 0.3)
  const beat = song.spb
  forEachBar(song, (bar, chord, t0, barLen) => {
    padChord(song, filter, chord, t0, barLen + 0.1, { amp: 0.05, attack: 0.4, release: 0.6, soft: true })
    bassPattern(chord, song.rng, 36).forEach((midi, i) => {
      if (midi !== null) pluckNote(song, song.bus, midi, t0 + (i * beat) / 2, 0.3, 0.35, 'sawtooth')
    })
    if (bar === 0) return
    kick(song, drums, t0, 0.8)
    kick(song, drums, t0 + beat * 2, 0.75)
    if (song.rng() < 0.35) kick(song, drums, t0 + beat * 3.5, 0.5)
    snare(song, drums, t0 + beat, 0.6)
    snare(song, drums, t0 + beat * 3, 0.6)
    for (let i = 0; i < 8; i++) {
      const open = i % 2 === 1 && song.rng() < 0.2
      hat(song, drums, t0 + (i * beat) / 2, i % 2 === 0 ? 0.6 : 0.4, open)
    }
  })
  const melody = generateMelody(song.rng, song.prog, { density: 0.4, low: 72, high: 86, bars: barCount(song) })
  playMelody(song, melody, 2, (midi, t0, dur) => leadNote(song, echo, midi, t0, dur, 0.15))
}

/** Tappeto lentissimo nel riverbero, con campane rade sulla pentatonica. */
function arrangeAmbient(song: Song): void {
  const hall = reverb(song, song.bus, 3.5, 0.55)
  const filter = padFilter(song, hall, 600, 300, 0.04)
  const barLen = song.spb * 4
  // Accordi di due battute che si sovrappongono: un tappeto che cambia lentamente
  const n = Math.ceil(song.end / (2 * barLen))
  for (let i = 0; i < n; i++) {
    const chord = chordAt(song, i)
    const t0 = i * 2 * barLen
    padChord(song, filter, chord, t0, 2 * barLen + 1.5, { amp: 0.06, attack: 3, release: 3, soft: i % 2 === 1 })
    subNote(song, song.bus, bassRoot(chord, 36), t0, 2 * barLen + 1, 0.12, 2)
  }
  const pool: number[] = []
  for (let m = 79; m <= 93; m++) if (inScale(m, song.prog.key, PENTATONIC[song.prog.mode])) pool.push(m)
  let t = 2
  while (t < song.end) {
    const chord = chordAt(song, Math.floor(t / (2 * barLen)))
    const chordTones = pool.filter((m) => chord.notes.some((c) => pitchClass(c) === pitchClass(m)))
    // Quasi sempre una nota dell'accordo, ogni tanto un'altra della pentatonica
    const midi = pick(song.rng, song.rng() < 0.8 && chordTones.length > 0 ? chordTones : pool)
    bellNote(song, hall, midi, t, 0.12)
    t += song.spb * (1.5 + song.rng() * 3)
  }
}

/** Sub saturato in primo piano, pizzicati in levare con eco, cassa e charleston leggeri. */
function arrangeBass(song: Song): void {
  const warm = softClip(song, song.bus, 2.5)
  const echo = pingPongDelay(song, song.bus, song.spb * 0.75, 0.35, 0.35)
  const filter = padFilter(song, song.bus, 800, 200, 0.05)
  const beat = song.spb
  forEachBar(song, (_bar, chord, t0, barLen) => {
    padChord(song, filter, chord, t0, barLen + 0.2, { amp: 0.035, attack: 1, release: 1, soft: true })
    bassPattern(chord, song.rng, 33).forEach((midi, i) => {
      if (midi !== null) subNote(song, warm, midi, t0 + (i * beat) / 2, beat * 0.45, 0.45)
    })
    for (let i = 1; i < 8; i += 2) {
      if (song.rng() < 0.7) pluckNote(song, echo, pick(song.rng, chord.notes) + 12, t0 + (i * beat) / 2, 0.12, 0.3)
    }
    kick(song, song.bus, t0, 0.35)
    kick(song, song.bus, t0 + beat * 2, 0.3)
    for (let i = 0; i < 4; i++) hat(song, song.bus, t0 + (i + 0.5) * beat, 0.25, false)
  })
  const melody = generateMelody(song.rng, song.prog, { density: 0.3, low: 67, high: 81, bars: barCount(song) })
  playMelody(song, melody, 2, (midi, t0) => pluckNote(song, echo, midi, t0, 0.16, 0.5))
}

const ARRANGERS: Record<DemoStyle, (song: Song) => void> = {
  pad: arrangePad,
  arp: arrangeArp,
  piano: arrangePiano,
  beat: arrangeBeat,
  ambient: arrangeAmbient,
  bass: arrangeBass,
}

// ---------------------------------------------------------------------------------------------
// Copertine
// ---------------------------------------------------------------------------------------------

/** Quanto serve del contesto 2D: così vanno bene sia OffscreenCanvas sia <canvas>. */
interface Cover2d {
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  globalAlpha: number
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  shadowColor: string
  shadowBlur: number
  shadowOffsetY: number
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient
  fillRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void
  fill(): void
  stroke(): void
  fillText(text: string, x: number, y: number, maxWidth?: number): void
}

interface Palette {
  stops: readonly [string, string, string]
  accent: string
  ink: string
  motif: 'circles' | 'stripes' | 'beams'
}

/** Una tavolozza per album: notte sul mare, terra e sabbia, acqua e tramonto. */
const PALETTES: readonly Palette[] = [
  { stops: ['#0b1030', '#1f2a6b', '#6a3d9a'], accent: '#f6d08a', ink: '#ffffff', motif: 'circles' },
  { stops: ['#7d3418', '#c9733f', '#edc9a0'], accent: '#3d1c0e', ink: '#fff6ea', motif: 'stripes' },
  { stops: ['#0c4f5c', '#1b9aa0', '#f3a53f'], accent: '#fff4dc', ink: '#ffffff', motif: 'beams' },
]

/** PNG 1×1 valido: usato quando non c'è alcun canvas (es. in node), così la funzione non fallisce mai. */
const FALLBACK_PNG = [
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73,
  68, 65, 84, 120, 218, 99, 100, 248, 207, 80, 15, 0, 3, 134, 1, 128, 90, 52, 125, 107, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]

interface CoverCanvas {
  ctx: Cover2d
  toBlob(type: string, quality: number): Promise<Blob | null>
}

function createCanvas(size: number): CoverCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(size, size)
    const ctx = c.getContext('2d')
    if (ctx) return { ctx, toBlob: (type, quality) => c.convertToBlob({ type, quality }) }
  }
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')
    if (ctx) return { ctx, toBlob: (type, quality) => new Promise((resolve) => c.toBlob(resolve, type, quality)) }
  }
  return null
}

/**
 * Copertina astratta dell'album: sfumatura in una tavolozza propria, un motivo geometrico, grana
 * leggera e titolo/artista in un sans-serif pulito. JPEG 600×600 (qualità 0,9); senza canvas
 * restituisce un PNG 1×1 valido.
 */
export async function makeCoverArt(albumIndex: number, title: string, artist: string, size = 600): Promise<Picture> {
  const canvas = createCanvas(size)
  if (!canvas) return { mime: 'image/png', data: new Uint8Array(FALLBACK_PNG) }
  drawCover(canvas.ctx, albumIndex, title, artist, size)
  const blob = await canvas.toBlob('image/jpeg', 0.9)
  if (!blob) return { mime: 'image/png', data: new Uint8Array(FALLBACK_PNG) }
  return { mime: 'image/jpeg', data: new Uint8Array(await blob.arrayBuffer()) }
}

function drawCover(c: Cover2d, albumIndex: number, title: string, artist: string, size: number): void {
  const p = PALETTES[((albumIndex % PALETTES.length) + PALETTES.length) % PALETTES.length]!
  const rng = mulberry32(albumIndex * 7919 + 17)
  const s = size / 600
  const bg = c.createLinearGradient(0, 0, size * 0.6, size)
  bg.addColorStop(0, p.stops[0])
  bg.addColorStop(0.55, p.stops[1])
  bg.addColorStop(1, p.stops[2])
  c.fillStyle = bg
  c.fillRect(0, 0, size, size)

  if (p.motif === 'circles') {
    // Cerchi concentrici (onde) attorno a una "luna" in alto a destra, e luci sparse sul mare
    const cx = size * 0.68
    const cy = size * 0.34
    c.strokeStyle = p.ink
    c.lineWidth = 1.5 * s
    for (let r = size * 0.1; r < size * 0.75; r += size * 0.065) {
      c.globalAlpha = 0.16 - (r / size) * 0.12
      c.beginPath()
      c.arc(cx, cy, r, 0, Math.PI * 2)
      c.stroke()
    }
    c.globalAlpha = 0.92
    const moon = c.createRadialGradient(cx - 8 * s, cy - 8 * s, 4 * s, cx, cy, size * 0.075)
    moon.addColorStop(0, '#fff7df')
    moon.addColorStop(1, p.accent)
    c.fillStyle = moon
    c.beginPath()
    c.arc(cx, cy, size * 0.075, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = p.accent
    for (let i = 0; i < 26; i++) {
      c.globalAlpha = 0.25 + rng() * 0.5
      const x = rng() * size
      const y = size * (0.55 + rng() * 0.2)
      c.fillRect(x, y, (1 + rng() * 2) * s, (1 + rng() * 2) * s)
    }
  } else if (p.motif === 'stripes') {
    // Strati ondulati come sedimenti d'argilla
    const bands = 11
    for (let i = 0; i < bands; i++) {
      const y0 = size * (0.08 + (i / bands) * 0.9)
      const h = size * 0.035 + rng() * size * 0.03
      const amp = size * (0.01 + rng() * 0.02)
      const phase = rng() * Math.PI * 2
      c.globalAlpha = i % 2 === 0 ? 0.14 : 0.07
      c.fillStyle = i % 3 === 0 ? p.accent : p.ink
      c.beginPath()
      c.moveTo(0, y0)
      for (let x = 0; x <= size; x += 8 * s) c.lineTo(x, y0 + Math.sin(phase + (x / size) * Math.PI * 2.5) * amp)
      for (let x = size; x >= 0; x -= 8 * s) c.lineTo(x, y0 + h + Math.sin(phase + 1.3 + (x / size) * Math.PI * 2.5) * amp)
      c.closePath()
      c.fill()
    }
  } else {
    // Fasci di luce da un punto a sinistra, come un faro al tramonto
    const ox = size * 0.26
    const oy = size * 0.3
    c.fillStyle = p.accent
    for (let i = 0; i < 9; i++) {
      const a = -0.55 + i * 0.16 + rng() * 0.04
      const w = 0.035 + rng() * 0.03
      c.globalAlpha = 0.05 + rng() * 0.09
      c.beginPath()
      c.moveTo(ox, oy)
      c.lineTo(ox + Math.cos(a - w) * size * 1.4, oy + Math.sin(a - w) * size * 1.4)
      c.lineTo(ox + Math.cos(a + w) * size * 1.4, oy + Math.sin(a + w) * size * 1.4)
      c.closePath()
      c.fill()
    }
    c.globalAlpha = 0.95
    c.beginPath()
    c.arc(ox, oy, size * 0.028, 0, Math.PI * 2)
    c.fill()
  }

  // Grana sottile: toglie l'effetto "plastica" delle sfumature
  const dots = Math.floor(size * size * 0.015)
  for (let i = 0; i < dots; i++) {
    c.globalAlpha = 0.03 + rng() * 0.06
    c.fillStyle = rng() < 0.5 ? '#000000' : '#ffffff'
    c.fillRect(rng() * size, rng() * size, s, s)
  }

  // Velo scuro in basso per far leggere il testo su qualunque sfondo
  c.globalAlpha = 1
  const veil = c.createLinearGradient(0, size * 0.6, 0, size)
  veil.addColorStop(0, 'rgba(0,0,0,0)')
  veil.addColorStop(1, 'rgba(0,0,0,0.45)')
  c.fillStyle = veil
  c.fillRect(0, size * 0.6, size, size * 0.4)

  const family = '-apple-system, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif'
  c.textAlign = 'left'
  c.textBaseline = 'alphabetic'
  c.shadowColor = 'rgba(0,0,0,0.35)'
  c.shadowBlur = 8 * s
  c.shadowOffsetY = 2 * s
  c.fillStyle = p.ink
  c.globalAlpha = 0.85
  c.font = `500 ${Math.round(26 * s)}px ${family}`
  c.fillText(artist.toUpperCase(), size * 0.08, size * 0.8, size * 0.84)
  c.globalAlpha = 1
  c.font = `700 ${Math.round(52 * s)}px ${family}`
  c.fillText(title, size * 0.08, size * 0.895, size * 0.84)
  c.shadowBlur = 0
  c.shadowOffsetY = 0
}
