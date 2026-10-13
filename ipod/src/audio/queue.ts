/**
 * Logica pura della coda di riproduzione: ordine, casuale (brani o album), ripetizione.
 * Nessun accesso all'audio: tutto testabile in node.
 */
export type ShuffleMode = 'off' | 'songs' | 'albums'
export type RepeatMode = 'off' | 'one' | 'all'

export interface QueueItem {
  id: string
  albumId: string
}

/** Generatore casuale deterministico (mulberry32) per avere test ripetibili. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffleArray<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

/**
 * Costruisce l'ordine di riproduzione a partire dall'elenco originale.
 * - 'songs': brani mescolati, ma quello scelto dall'utente resta il primo.
 * - 'albums': album in ordine casuale, tracce in ordine dentro l'album; l'album del brano scelto parte per primo
 *   da quel brano.
 */
export function buildOrder(items: readonly QueueItem[], startId: string | null, mode: ShuffleMode, random: () => number = Math.random): QueueItem[] {
  if (items.length === 0) return []
  if (mode === 'off') return items.slice()
  if (mode === 'songs') {
    const rest = shuffleArray(
      items.filter((i) => i.id !== startId),
      random,
    )
    const start = items.find((i) => i.id === startId)
    return start ? [start, ...rest] : rest
  }
  // album
  const groups = new Map<string, QueueItem[]>()
  for (const it of items) {
    const g = groups.get(it.albumId)
    if (g) g.push(it)
    else groups.set(it.albumId, [it])
  }
  const startAlbum = startId ? items.find((i) => i.id === startId)?.albumId ?? null : null
  const keys = shuffleArray(
    [...groups.keys()].filter((k) => k !== startAlbum),
    random,
  )
  const ordered = startAlbum !== null ? [startAlbum, ...keys] : keys
  const out: QueueItem[] = []
  for (const k of ordered) {
    const g = groups.get(k)!
    if (k === startAlbum && startId) {
      const idx = g.findIndex((i) => i.id === startId)
      out.push(...g.slice(idx), ...g.slice(0, idx))
    } else out.push(...g)
  }
  return out
}

/** Indice del brano successivo, o null se la riproduzione finisce. */
export function nextIndex(index: number, length: number, repeat: RepeatMode, manual: boolean): number | null {
  if (length === 0) return null
  if (repeat === 'one' && !manual) return index
  if (index + 1 < length) return index + 1
  if (repeat === 'all' || (repeat === 'one' && manual)) return 0
  return null
}

/** Indice del brano precedente (con "ripeti tutti" torna all'ultimo). */
export function prevIndex(index: number, length: number, repeat: RepeatMode): number {
  if (length === 0) return 0
  if (index > 0) return index - 1
  return repeat === 'off' ? 0 : length - 1
}

/** Formato tempo dell'iPod: m:ss, oppure h:mm:ss sopra l'ora. `negative` aggiunge il segno "-" (tempo rimanente). */
export function formatTime(seconds: number, negative = false): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const body = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
  return negative ? `-${body}` : body
}

/** Curva di volume percettiva: 0–100 → gain 0–1 (quadratica, simile a quella dell'iPod). */
export function volumeToGain(volume: number): number {
  const v = Math.max(0, Math.min(100, volume)) / 100
  return v * v
}
