/**
 * Il "clicker" dell'iPod: il tic del piezo a ogni scatto della ghiera e a ogni tasto.
 * Sintetizzato con la Web Audio API (nessun file): un impulso breve a ~2.6 kHz con un velo di rumore.
 * Il contesto audio viene "sbloccato" al primo gesto dell'utente (necessario su iOS/Safari).
 */

let ctx: AudioContext | null = null
let buffer: AudioBuffer | null = null
let enabled = true
let lastTick = 0

type AudioContextCtor = typeof AudioContext
function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { webkitAudioContext?: AudioContextCtor }
  return window.AudioContext ?? w.webkitAudioContext ?? null
}

/** Contesto audio condiviso (anche dal motore di riproduzione per l'equalizzatore). */
export function getAudioContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = getAudioContextCtor()
  if (!Ctor) return null
  try {
    ctx = new Ctor({ latencyHint: 'interactive' })
  } catch {
    return null
  }
  return ctx
}

function buildBuffer(ac: AudioContext): AudioBuffer {
  const sr = ac.sampleRate
  const length = Math.floor(sr * 0.012)
  const buf = ac.createBuffer(1, length, sr)
  const data = buf.getChannelData(0)
  let seed = 1234567
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296 - 0.5
  }
  for (let i = 0; i < length; i++) {
    const t = i / sr
    const env = Math.exp(-t * 900) // decadimento ~1 ms di costante → tic secco
    const tone = Math.sin(2 * Math.PI * 2600 * t) * 0.8 + Math.sin(2 * Math.PI * 4100 * t) * 0.35
    const click = i < 20 ? (1 - i / 20) * 0.6 : 0 // fronte iniziale (impulso)
    data[i] = (tone * env + noise() * env * 0.35 + click) * 0.9
  }
  return buf
}

/** Da chiamare dentro un gesto dell'utente (pointerdown/keydown): sblocca l'audio. */
export function unlockAudio(): void {
  const ac = getAudioContext()
  if (!ac) return
  if (ac.state === 'suspended') void ac.resume().catch(() => {})
  if (!buffer) buffer = buildBuffer(ac)
}

export function setClickerEnabled(on: boolean): void {
  enabled = on
}

/** Suona un tic. `strength` 0–1 (gli scatti rapidi sono leggermente più deboli). */
export function tick(strength = 1): void {
  if (!enabled) return
  const ac = getAudioContext()
  if (!ac) return
  if (!buffer) buffer = buildBuffer(ac)
  if (ac.state !== 'running') {
    void ac.resume().catch(() => {})
    return
  }
  const now = ac.currentTime
  if (now - lastTick < 0.004) return
  lastTick = now
  const src = ac.createBufferSource()
  src.buffer = buffer
  const gain = ac.createGain()
  gain.gain.value = 0.22 * Math.max(0.3, Math.min(1, strength))
  src.connect(gain).connect(ac.destination)
  src.start(now)
}
