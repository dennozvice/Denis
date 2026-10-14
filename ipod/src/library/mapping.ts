/**
 * Dai tag letti da music-metadata alla Track della libreria. Codice puro (niente DOM, niente
 * IndexedDB): lo condividono il worker, il ripiego sul thread principale e i test in node.
 */
import type { IAudioMetadata } from 'music-metadata'
import { groupKey, type UnknownLabels } from './sort'
import type { Track } from './types'

/** Tag essenziali già ridotti a dati semplici, trasferibili dal worker con postMessage. */
export interface ParsedTags {
  title?: string
  artist?: string
  albumartist?: string
  album?: string
  year?: number
  track: { no: number | null; of: number | null }
  disk: { no: number | null }
  genre?: string[]
  composer?: string[]
  /** Secondi; manca per gli mp3 senza header Xing (la si ricava al primo ascolto). */
  duration?: number
}

/** Copertina incorporata nei tag: i byte stanno in un buffer proprio, così si può trasferire. */
export interface ParsedPicture {
  mime: string
  data: ArrayBuffer
}

/** Il poco che serve sapere del file sorgente (un File del browser o un surrogato nei test). */
export interface FileInfo {
  name: string
  /** Percorso relativo alla cartella importata ('' se il file è stato scelto da solo). */
  path: string
  size: number
  lastModified: number
  /** MIME dichiarato dal browser ('' se non lo conosce). */
  type: string
}

/** Estensioni importabili (minuscole, senza punto). "alac" è in realtà un m4a. */
export const AUDIO_EXTENSIONS: readonly string[] = [
  'mp3',
  'm4a',
  'm4b',
  'aac',
  'mp4',
  'alac',
  'flac',
  'wav',
  'aif',
  'aiff',
  'ogg',
  'oga',
  'opus',
]

/** Formati che nessun browser riproduce: scartati anche se il sistema li dichiara audio/*. */
const UNPLAYABLE_EXTENSIONS: ReadonlySet<string> = new Set(['wma'])

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  alac: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
}

/** Estensione minuscola senza punto; '' se manca (".nascosto" e "nome." non ne hanno). */
export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : ''
}

/** Nome del file senza estensione, usato come titolo quando il tag manca ("01 - Titolo.mp3" → "01 - Titolo"). */
export function baseName(name: string): string {
  const ext = extensionOf(name)
  return (ext ? name.slice(0, -(ext.length + 1)) : name).trim()
}

export function guessMime(name: string): string {
  return MIME_BY_EXTENSION[extensionOf(name)] ?? ''
}

/** Vero per MIME audio/* o estensione nota; i formati non riproducibili (wma) restano fuori. */
export function isAudioFile(file: Pick<File, 'name' | 'type'>): boolean {
  const ext = extensionOf(file.name)
  if (UNPLAYABLE_EXTENSIONS.has(ext)) return false
  if (typeof file.type === 'string' && file.type.toLowerCase().startsWith('audio/')) return true
  return AUDIO_EXTENSIONS.includes(ext)
}

/** Impronta del file sorgente: evita di reimportare lo stesso file a una nuova selezione. */
export function fingerprintOf(file: Pick<FileInfo, 'name' | 'path' | 'size' | 'lastModified'>): string {
  // Solo nome, dimensione e data: lo stesso file scelto da "file" o da "cartella" non si duplica.
  return `${file.name}|${file.size}|${file.lastModified}`
}

/** uuid v4; crypto.randomUUID manca nei contesti non sicuri (http in LAN), quindi c'è un ripiego. */
export function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function firstText(list: unknown): string {
  if (!Array.isArray(list)) return ''
  for (const item of list) {
    const t = text(item)
    if (t) return t
  }
  return ''
}

function positiveInt(n: unknown): number | null {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null
}

function validYear(y: unknown): number | null {
  return typeof y === 'number' && Number.isInteger(y) && y >= 1000 && y <= 2999 ? y : null
}

export function kindOf(genre: string, extension: string): Track['kind'] {
  if (/podcast/i.test(genre)) return 'podcast'
  if (extension === 'm4b' || /audiobook|audiolibro/i.test(genre)) return 'audiobook'
  return 'music'
}

/**
 * Costruisce la Track: tag mancanti sostituiti dai ripieghi (nome file, etichette "sconosciuto"),
 * numeri validati, album raggruppato per albumArtist + album. artworkId resta null: lo assegna
 * l'importazione quando l'album ha una copertina.
 */
export function tagsToTrack(
  parsed: ParsedTags,
  file: FileInfo,
  labels: UnknownLabels,
  options: { id?: string; addedAt?: number } = {},
): Track {
  // Artista e album mancanti restano vuoti: l'etichetta "sconosciuto" si aggiunge alla visualizzazione,
  // nella lingua del momento (così cambiando lingua non nascono due artisti "sconosciuti").
  const artist = text(parsed.artist)
  const albumArtist = text(parsed.albumartist) || artist
  const album = text(parsed.album)
  const genre = firstText(parsed.genre)
  const duration = parsed.duration
  return {
    id: options.id ?? newId(),
    fingerprint: fingerprintOf(file),
    title: text(parsed.title) || baseName(file.name) || labels.title,
    artist,
    albumArtist,
    album,
    albumId: groupKey(albumArtist, album),
    artworkId: null,
    year: validYear(parsed.year),
    trackNo: positiveInt(parsed.track?.no),
    trackOf: positiveInt(parsed.track?.of),
    discNo: positiveInt(parsed.disk?.no),
    genre,
    composer: firstText(parsed.composer),
    duration: typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : 0,
    fileName: file.name,
    path: file.path,
    size: file.size,
    mime: file.type || guessMime(file.name),
    addedAt: options.addedAt ?? Date.now(),
    playCount: 0,
    rating: 0,
    lastPlayedAt: null,
    kind: kindOf(genre, extensionOf(file.name)),
  }
}

/** Riduce il risultato di music-metadata ai soli tag che servono (oggetti semplici, clonabili). */
export function toParsedTags(meta: IAudioMetadata): ParsedTags {
  const c = meta.common
  return {
    title: c.title,
    artist: c.artist,
    albumartist: c.albumartist,
    album: c.album,
    year: c.year,
    track: { no: c.track?.no ?? null, of: c.track?.of ?? null },
    disk: { no: c.disk?.no ?? null },
    genre: c.genre,
    composer: c.composer,
    duration: meta.format.duration,
  }
}

/** La prima immagine utile: la copertina frontale se c'è, altrimenti la prima. I byte vengono copiati in un buffer proprio. */
export function pickPicture(meta: IAudioMetadata): ParsedPicture | null {
  const pictures = meta.common.picture
  if (!pictures || pictures.length === 0) return null
  const front = pictures.find((p) => typeof p.type === 'string' && /^(cover \(front\)|front|cover)$/i.test(p.type.trim()))
  const pic = front ?? pictures[0]
  if (!pic || !pic.data || pic.data.byteLength === 0) return null
  return { mime: pic.format || 'image/jpeg', data: pic.data.slice().buffer }
}
