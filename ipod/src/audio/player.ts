/**
 * Motore di riproduzione: un unico <audio>, coda con casuale/ripeti, volume, equalizzatore,
 * Media Session (tasti multimediali, schermata di blocco). Lo stato è in due store:
 * - playerStore: coda, brano, stato (cambia di rado);
 * - progressStore: posizione/durata (cambia più volte al secondo, la legge solo chi la mostra).
 */
import { createStore, useStore } from '../core/store'
import type { EqPreset } from '../core/settings'
import { db } from '../library/db'
import type { Track } from '../library/types'
import { getAudioContext } from './clicker'
import { EqChain } from './eq'
import { buildOrder, nextIndex, prevIndex, volumeToGain, type QueueItem, type RepeatMode, type ShuffleMode } from './queue'

export type PlayerStatus = 'stopped' | 'loading' | 'playing' | 'paused'

export interface PlayerState {
  /** Ordine di riproduzione effettivo. */
  queue: QueueItem[]
  /** Elenco originale (per ricostruire l'ordine quando cambia "Casuale"). */
  source: QueueItem[]
  index: number
  trackId: string | null
  status: PlayerStatus
  volume: number
  shuffle: ShuffleMode
  repeat: RepeatMode
  eq: EqPreset
  /** Ultimo errore di decodifica (brano saltato). */
  error: string | null
  /** Quanto è lunga la coda e a che punto siamo: "3 di 12". */
}

export interface ProgressState {
  position: number
  duration: number
}

export const playerStore = createStore<PlayerState>({
  queue: [],
  source: [],
  index: -1,
  trackId: null,
  status: 'stopped',
  volume: 55,
  shuffle: 'off',
  repeat: 'off',
  eq: 'off',
  error: null,
})

export const progressStore = createStore<ProgressState>({ position: 0, duration: 0 })

/** Chi fornisce i metadati dei brani (la libreria) si registra qui per evitare dipendenze circolari. */
export interface TrackProvider {
  getTrack(id: string): Track | undefined
  getArtworkUrl(artworkId: string | null, size: 'thumb' | 'full'): Promise<string | null>
  onTrackPlayed?(track: Track): void
  onDurationKnown?(track: Track, duration: number): void
}

let provider: TrackProvider | null = null
export function setTrackProvider(p: TrackProvider): void {
  provider = p
}

let audio: HTMLAudioElement | null = null
let currentUrl: string | null = null
/** URL del brano precedente: si revoca solo quando il nuovo ha iniziato a suonare (Safari altrimenti non cerca più). */
let staleUrls: string[] = []
let prefetched: { id: string; url: string } | null = null
let primed = false

/** Otto campioni di silenzio WAV (8 bit, mono): servono a "sbloccare" l'elemento audio su iOS dentro un gesto dell'utente. */
const SILENT_WAV = 'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQgAAACAgICAgICAgA=='

/**
 * Da chiamare dentro un gesto dell'utente (pointerup/keydown): su iOS play() è permesso solo
 * nel gesto, e un elemento che ha già suonato una volta può poi ripartire anche dopo un await.
 */
export function primeAudio(): void {
  if (primed) return
  const el = ensureAudio()
  if (el.src && playerStore.get().trackId) {
    primed = true
    return
  }
  primed = true
  try {
    el.src = SILENT_WAV
    el.muted = true
    const p = el.play()
    if (p) {
      p.then(() => {
        // Solo se nel frattempo non è partito un brano vero.
        if (el.src.startsWith('data:')) {
          el.pause()
          el.removeAttribute('src')
        }
        el.muted = false
      }).catch(() => {
        el.muted = false
        primed = false
      })
    }
  } catch {
    el.muted = false
    primed = false
  }
}
let loadToken = 0
let errorStreak = 0
let eq: EqChain | null = null
let gainNode: GainNode | null = null
let useWebAudio = false

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio
  const el = new Audio()
  el.preload = 'auto'
  el.crossOrigin = null
  el.addEventListener('timeupdate', () => {
    progressStore.set({ position: el.currentTime, duration: Number.isFinite(el.duration) ? el.duration : 0 })
  })
  el.addEventListener('durationchange', () => {
    const d = Number.isFinite(el.duration) ? el.duration : 0
    progressStore.patch({ duration: d })
    const id = playerStore.get().trackId
    const t = id ? provider?.getTrack(id) : undefined
    if (t && d > 0 && Math.abs(t.duration - d) > 1) provider?.onDurationKnown?.(t, d)
    updatePositionState()
  })
  el.addEventListener('play', () => {
    if (el.src.startsWith('data:')) return // riproduzione del silenzio di sblocco
    playerStore.patch({ status: 'playing' })
    setPlaybackState('playing')
  })
  el.addEventListener('playing', () => {
    if (el.src.startsWith('data:')) return
    errorStreak = 0 // un brano che suona azzera la serie di errori
    for (const u of staleUrls) URL.revokeObjectURL(u)
    staleUrls = []
  })
  el.addEventListener('pause', () => {
    if (el.ended || el.src.startsWith('data:')) return
    const st = playerStore.get()
    if (st.status === 'playing') playerStore.patch({ status: 'paused' })
    setPlaybackState('paused')
  })
  el.addEventListener('ended', () => {
    void advance(false)
  })
  el.addEventListener('error', () => {
    if (el.src.startsWith('data:') || !el.src) return // clip di sblocco o elemento svuotato
    const id = playerStore.get().trackId
    playerStore.patch({ error: id ?? 'unknown' })
    // brano non decodificabile: passa al successivo (una sola volta per brano per non ciclare all'infinito)
    void advance(true)
  })
  audio = el
  return el
}

function setupGraph(el: HTMLAudioElement): void {
  if (useWebAudio || isIOS()) return
  const ac = getAudioContext()
  if (!ac) return
  try {
    const src = ac.createMediaElementSource(el)
    eq = new EqChain(ac)
    gainNode = ac.createGain()
    src.connect(eq.input)
    eq.output.connect(gainNode).connect(ac.destination)
    useWebAudio = true
    applyVolume()
    eq.apply(playerStore.get().eq, ac.currentTime)
  } catch {
    useWebAudio = false
  }
}

function applyVolume(): void {
  const v = volumeToGain(playerStore.get().volume)
  if (useWebAudio && gainNode) {
    gainNode.gain.value = v
    if (audio) audio.volume = 1
  } else if (audio) {
    audio.volume = v
  }
}

function setPlaybackState(state: MediaSessionPlaybackState): void {
  try {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state
  } catch {
    /* non supportato */
  }
}

function updatePositionState(): void {
  try {
    if (!audio || !('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0
    if (duration <= 0) return
    navigator.mediaSession.setPositionState({ duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, duration) })
  } catch {
    /* valori non validi durante il caricamento */
  }
}

let mediaSessionReady = false
function setupMediaSession(): void {
  if (mediaSessionReady || !('mediaSession' in navigator)) return
  mediaSessionReady = true
  const ms = navigator.mediaSession
  const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
    ['play', () => void player.play()],
    ['pause', () => player.pause()],
    ['previoustrack', () => void player.previous()],
    ['nexttrack', () => void player.next()],
    ['seekto', (d) => { if (typeof d.seekTime === 'number') player.seek(d.seekTime) }],
    ['seekbackward', (d) => player.seek(Math.max(0, (audio?.currentTime ?? 0) - (d.seekOffset ?? 10)))],
    ['seekforward', (d) => player.seek((audio?.currentTime ?? 0) + (d.seekOffset ?? 10))],
  ]
  for (const [action, handler] of handlers) {
    try {
      ms.setActionHandler(action, handler)
    } catch {
      /* azione non supportata */
    }
  }
}

async function updateMetadata(track: Track): Promise<void> {
  if (!('mediaSession' in navigator)) return
  try {
    const token = loadToken
    const art = await provider?.getArtworkUrl(track.artworkId, 'full')
    if (token !== loadToken) return // nel frattempo è cambiato brano
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: art ? [{ src: art, sizes: '600x600', type: 'image/jpeg' }] : [],
    })
  } catch {
    /* MediaMetadata non disponibile */
  }
}

async function urlFor(id: string): Promise<string | null> {
  if (prefetched?.id === id) {
    const u = prefetched.url
    prefetched = null
    return u
  }
  const blob = await db.getFile(id)
  if (!blob) return null
  return URL.createObjectURL(blob)
}

function prefetchNext(): void {
  const st = playerStore.get()
  const ni = nextIndex(st.index, st.queue.length, st.repeat, false)
  if (ni === null) return
  const id = st.queue[ni]?.id
  if (!id || prefetched?.id === id) return
  void db.getFile(id).then((blob) => {
    if (!blob) return
    if (prefetched) URL.revokeObjectURL(prefetched.url)
    prefetched = { id, url: URL.createObjectURL(blob) }
  })
}

async function loadIndex(index: number, autoplay: boolean): Promise<void> {
  const st = playerStore.get()
  const item = st.queue[index]
  if (!item) return
  const token = ++loadToken
  const el = ensureAudio()
  setupGraph(el)
  setupMediaSession()
  playerStore.patch({ index, trackId: item.id, status: 'loading', error: null })
  progressStore.set({ position: 0, duration: provider?.getTrack(item.id)?.duration ?? 0 })
  const url = await urlFor(item.id)
  if (token !== loadToken) {
    if (url && prefetched?.url !== url) URL.revokeObjectURL(url)
    return
  }
  if (!url) {
    playerStore.patch({ error: item.id })
    await advance(true)
    return
  }
  if (currentUrl) staleUrls.push(currentUrl)
  currentUrl = url
  el.muted = false
  el.src = url
  applyVolume()
  const track = provider?.getTrack(item.id)
  if (track) {
    void updateMetadata(track)
    provider?.onTrackPlayed?.(track)
  }
  if (autoplay) {
    try {
      await el.play()
    } catch {
      // autoplay bloccato o errore: resta in pausa, l'utente premerà Play
      if (token === loadToken) playerStore.patch({ status: 'paused' })
    }
  } else {
    playerStore.patch({ status: 'paused' })
  }
  prefetchNext()
}

async function advance(dueToError: boolean): Promise<void> {
  const st = playerStore.get()
  if (dueToError) {
    errorStreak++
    if (errorStreak >= st.queue.length || errorStreak > 20) {
      // tutti i brani falliscono: fermati
      errorStreak = 0
      player.stop()
      return
    }
  } else errorStreak = 0
  // Un file illeggibile si salta anche con "Ripeti uno" (altrimenti si ritenterebbe all'infinito).
  const ni = nextIndex(st.index, st.queue.length, st.repeat, dueToError)
  if (ni === null) {
    // fine coda senza ripetizione: torna all'inizio e si ferma (come l'iPod)
    playerStore.patch({ status: 'paused' })
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    progressStore.patch({ position: 0 })
    setPlaybackState('paused')
    return
  }
  await loadIndex(ni, true)
}

export const player = {
  /** Avvia una nuova coda da un elenco di brani (nell'ordine dato), partendo da `startId`. */
  async playList(items: readonly QueueItem[], startId: string | null, shuffleOverride?: ShuffleMode): Promise<void> {
    const st = playerStore.get()
    if (shuffleOverride && shuffleOverride !== st.shuffle) playerStore.patch({ shuffle: shuffleOverride })
    const queue = buildOrder(items, startId, shuffleOverride ?? st.shuffle)
    const index = Math.max(0, startId ? queue.findIndex((i) => i.id === startId) : 0)
    if (prefetched) {
      URL.revokeObjectURL(prefetched.url)
      prefetched = null
    }
    errorStreak = 0
    playerStore.patch({ queue, source: items.slice(), index })
    await loadIndex(index, true)
  },
  async play(): Promise<void> {
    const st = playerStore.get()
    if (st.trackId === null) {
      if (st.queue.length) await loadIndex(Math.max(0, st.index), true)
      return
    }
    const el = ensureAudio()
    try {
      await el.play()
    } catch {
      /* resta in pausa */
    }
  },
  pause(): void {
    audio?.pause()
  },
  async toggle(): Promise<void> {
    const st = playerStore.get()
    if (st.status === 'playing') player.pause()
    else await player.play()
  },
  stop(): void {
    loadToken++
    errorStreak = 0
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    if (currentUrl) URL.revokeObjectURL(currentUrl)
    currentUrl = null
    for (const u of staleUrls) URL.revokeObjectURL(u)
    staleUrls = []
    if (prefetched) URL.revokeObjectURL(prefetched.url)
    prefetched = null
    playerStore.patch({ status: 'stopped', trackId: null, index: -1, queue: [], source: [] })
    progressStore.set({ position: 0, duration: 0 })
    setPlaybackState('none')
  },
  async next(): Promise<void> {
    const st = playerStore.get()
    const ni = nextIndex(st.index, st.queue.length, st.repeat, true)
    if (ni === null) {
      // ultimo brano, nessuna ripetizione: l'iPod torna al primo brano in pausa
      if (st.queue.length) {
        await loadIndex(0, false)
      }
      return
    }
    await loadIndex(ni, st.status !== 'paused')
  },
  /** Precedente: se sono passati più di 3 secondi ricomincia il brano, altrimenti va al precedente. */
  async previous(): Promise<void> {
    const st = playerStore.get()
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      progressStore.patch({ position: 0 })
      return
    }
    const pi = prevIndex(st.index, st.queue.length, st.repeat)
    if (pi === st.index) {
      if (audio) audio.currentTime = 0
      return
    }
    await loadIndex(pi, st.status !== 'paused')
  },
  seek(seconds: number): void {
    if (!audio) return
    const d = Number.isFinite(audio.duration) ? audio.duration : progressStore.get().duration
    const t = Math.max(0, Math.min(d > 0 ? d - 0.25 : seconds, seconds))
    try {
      audio.currentTime = t
      progressStore.patch({ position: t })
      updatePositionState()
    } catch {
      /* non ancora caricato */
    }
  },
  /** Avanzamento tenendo premuto: non oltrepassa mai la fine del brano (resta a mezzo secondo dalla fine). */
  seekBy(delta: number): void {
    const d = player.duration()
    const target = (audio?.currentTime ?? 0) + delta
    player.seek(d > 0 ? Math.min(target, d - 0.5) : target)
  },
  setVolume(volume: number): void {
    const v = Math.max(0, Math.min(100, Math.round(volume)))
    playerStore.patch({ volume: v })
    applyVolume()
  },
  setShuffle(mode: ShuffleMode): void {
    const st = playerStore.get()
    if (st.shuffle === mode) return
    const currentId = st.trackId
    const queue = st.source.length ? buildOrder(st.source, currentId, mode) : []
    const index = currentId ? Math.max(0, queue.findIndex((i) => i.id === currentId)) : -1
    playerStore.patch({ shuffle: mode, queue, index })
    if (prefetched) {
      URL.revokeObjectURL(prefetched.url)
      prefetched = null
    }
    prefetchNext()
  },
  setRepeat(mode: RepeatMode): void {
    playerStore.patch({ repeat: mode })
  },
  setEq(preset: EqPreset): void {
    playerStore.patch({ eq: preset })
    const ac = getAudioContext()
    if (eq && ac) eq.apply(preset, ac.currentTime)
  },
  /** Posizione corrente letta direttamente dall'elemento (senza aspettare timeupdate). */
  position(): number {
    return audio?.currentTime ?? progressStore.get().position
  },
  duration(): number {
    const d = audio?.duration
    return d !== undefined && Number.isFinite(d) ? d : progressStore.get().duration
  },
  /** Rimuove dalla coda brani cancellati dalla libreria. */
  removeFromQueue(ids: ReadonlySet<string>): void {
    const st = playerStore.get()
    if (!st.queue.some((i) => ids.has(i.id))) return
    const current = st.trackId
    if (current && ids.has(current)) {
      player.stop()
      return
    }
    const queue = st.queue.filter((i) => !ids.has(i.id))
    const source = st.source.filter((i) => !ids.has(i.id))
    const index = current ? queue.findIndex((i) => i.id === current) : -1
    playerStore.patch({ queue, source, index })
  },
}

export function usePlayer<S = PlayerState>(selector?: (s: PlayerState) => S): S {
  return useStore(playerStore, selector)
}

export function useProgress(): ProgressState {
  return useStore(progressStore)
}
