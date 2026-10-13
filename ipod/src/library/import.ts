/**
 * Importazione della musica: dalla scelta dei file (input, cartella, File System Access API)
 * alla libreria in IndexedDB. I tag si leggono in un piccolo pool di worker (con ripiego sul
 * thread principale se i worker non partono), le copertine si elaborano una volta per album,
 * e si salva a lotti: un'importazione interrotta lascia comunque in libreria i brani già fatti.
 * Nessun accesso a window/Worker al caricamento del modulo: i test girano in node.
 */
import { parseBlob } from 'music-metadata'
import { processArtwork } from './artwork'
import { db } from './db'
import { fingerprintOf, isAudioFile, pickPicture, tagsToTrack, toParsedTags, type FileInfo, type ParsedPicture, type ParsedTags } from './mapping'
import type { MetadataReply, MetadataRequest } from './metadata.worker'
import type { UnknownLabels } from './sort'
import type { Artwork, Track } from './types'

export { AUDIO_EXTENSIONS, isAudioFile, tagsToTrack } from './mapping'
export type { FileInfo, ParsedPicture, ParsedTags } from './mapping'

export interface ImportProgress {
  total: number
  done: number
  currentName: string
  added: number
  updated: number
  skipped: number
  failed: number
}

export interface ImportResult {
  added: number
  /** Brani già in libreria che hanno ricevuto ora la copertina del loro album. */
  updated: number
  skipped: number
  failed: number
  errors: Array<{ name: string; error: string }>
}

export interface ImportOptions {
  labels: UnknownLabels
  /** Brani già in libreria, per impronta: quelli con la stessa impronta vengono saltati. */
  existing: ReadonlyMap<string, Track>
  onProgress?: (p: ImportProgress) => void
  signal?: AbortSignal
}

const BATCH_SIZE = 25
const MAX_ERRORS = 50
const MAX_WORKERS = 4
/** Oltre questo tempo un worker si considera bloccato: lo si riavvia e il file si legge sul thread principale. */
const PARSE_TIMEOUT_MS = 60_000

/** Valore dell'attributo accept dell'input file (audio/* non basta a Safari per m4a/flac). */
export const AUDIO_ACCEPT = 'audio/*,.m4a,.m4b,.flac,.mp3,.wav,.aiff,.aif,.ogg,.opus,.aac,.mp4'

// ---- Percorsi relativi ---------------------------------------------------------------------

/** I File della File System Access API non hanno webkitRelativePath: il percorso si annota qui. */
const filePaths = new WeakMap<File, string>()

export function setFilePath(file: File, path: string): void {
  filePaths.set(file, path)
}

export function getFilePath(file: File): string {
  const noted = filePaths.get(file)
  if (noted !== undefined) return noted
  const rel = (file as Partial<File>).webkitRelativePath
  return typeof rel === 'string' ? rel : ''
}

function fileInfo(file: File): FileInfo {
  return { name: file.name, path: getFilePath(file), size: file.size, lastModified: file.lastModified, type: file.type }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.name
  return typeof e === 'string' ? e : 'errore sconosciuto'
}

function errorName(e: unknown): string {
  return typeof e === 'object' && e !== null && typeof (e as { name?: unknown }).name === 'string' ? (e as { name: string }).name : ''
}

// ---- Lettura dei tag -------------------------------------------------------------------------

interface ParseOutcome {
  common: ParsedTags
  picture: ParsedPicture | null
}

interface TagParser {
  /** Quante letture possono correre insieme. */
  readonly concurrency: number
  parse(file: File): Promise<ParseOutcome>
  dispose(): void
}

/** Guasto del worker (script non caricato, bloccato): il file si rilegge sul thread principale. */
class WorkerFailure extends Error {}

function mainThreadParser(): TagParser {
  return {
    concurrency: 1,
    async parse(file) {
      const meta = await parseBlob(file, { skipPostHeaders: true, duration: false })
      return { common: toParsedTags(meta), picture: pickPicture(meta) }
    },
    dispose() {},
  }
}

interface Job {
  file: File
  resolve: (outcome: ParseOutcome) => void
  reject: (error: unknown) => void
}

interface Lane {
  worker: Worker | null
  job: Job | null
  jobId: number
  timer: ReturnType<typeof setTimeout> | undefined
}

/** Pool di worker: ogni corsia serve una richiesta alla volta. null se i worker non si creano. */
function workerPool(size: number): TagParser | null {
  if (typeof Worker === 'undefined') return null
  const lanes: Lane[] = []
  const queue: Job[] = []
  let nextId = 1

  const liveLanes = () => lanes.filter((l) => l.worker !== null)

  const take = (lane: Lane): Job | null => {
    clearTimeout(lane.timer)
    lane.timer = undefined
    const job = lane.job
    lane.job = null
    return job
  }

  const pump = () => {
    for (const lane of lanes) {
      if (queue.length === 0) return
      if (!lane.worker || lane.job) continue
      const job = queue.shift()!
      lane.job = job
      lane.jobId = nextId++
      const request: MetadataRequest = { id: lane.jobId, file: job.file }
      try {
        lane.worker.postMessage(request)
      } catch (e) {
        take(lane)?.reject(e)
        continue
      }
      lane.timer = setTimeout(() => kill(lane, new WorkerFailure('lettura dei tag troppo lenta'), true), PARSE_TIMEOUT_MS)
    }
  }

  /** Spegne il worker della corsia (riavviandolo se richiesto) e respinge il lavoro in corso. */
  const kill = (lane: Lane, error: WorkerFailure, respawn: boolean) => {
    lane.worker?.terminate()
    lane.worker = respawn ? spawn(lane) : null
    take(lane)?.reject(error)
    if (liveLanes().length === 0) for (const job of queue.splice(0)) job.reject(new WorkerFailure('nessun worker disponibile'))
    pump()
  }

  const spawn = (lane: Lane): Worker | null => {
    try {
      const worker = new Worker(new URL('./metadata.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (ev: MessageEvent<MetadataReply>) => {
        const reply = ev.data
        if (lane.worker !== worker || !reply || reply.id !== lane.jobId) return
        const job = take(lane)
        if (job) {
          if (reply.ok) job.resolve({ common: reply.common, picture: reply.picture ?? null })
          else job.reject(new Error(reply.error))
        }
        pump()
      }
      worker.onerror = (ev) => {
        // Script non caricato (es. build vecchia dopo un deploy) o crash: la corsia muore.
        if (lane.worker !== worker) return
        ev.preventDefault()
        kill(lane, new WorkerFailure(ev.message || 'worker dei tag non avviato'), false)
      }
      worker.onmessageerror = () => {
        if (lane.worker !== worker) return
        take(lane)?.reject(new WorkerFailure('risposta del worker illeggibile'))
        pump()
      }
      return worker
    } catch {
      return null
    }
  }

  for (let i = 0; i < size; i++) {
    const lane: Lane = { worker: null, job: null, jobId: 0, timer: undefined }
    lane.worker = spawn(lane)
    if (lane.worker) lanes.push(lane)
  }
  if (lanes.length === 0) return null

  return {
    concurrency: lanes.length,
    parse(file) {
      if (liveLanes().length === 0) return Promise.reject(new WorkerFailure('nessun worker disponibile'))
      return new Promise<ParseOutcome>((resolve, reject) => {
        queue.push({ file, resolve, reject })
        pump()
      })
    },
    dispose() {
      for (const lane of lanes) {
        lane.worker?.terminate()
        lane.worker = null
        take(lane)?.reject(new WorkerFailure('importazione terminata'))
      }
      for (const job of queue.splice(0)) job.reject(new WorkerFailure('importazione terminata'))
    },
  }
}

function poolSize(): number {
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2
  return Math.max(1, Math.min(MAX_WORKERS, cores - 1))
}

// ---- Importazione ----------------------------------------------------------------------------

interface Batch {
  tracks: Track[]
  files: Array<{ id: string; blob: Blob }>
  artwork: Artwork[]
  /** Brani già in libreria riscritti in questo lotto (per correggere i conteggi se la scrittura fallisce). */
  updated: number
}

function emptyBatch(): Batch {
  return { tracks: [], files: [], artwork: [], updated: 0 }
}

/**
 * Importa i file nella libreria. Mai interrotta da un singolo file guasto; con `signal` si ferma
 * tra un file e l'altro salvando quanto fatto. I brani con impronta già presente in `existing`
 * (o doppi nella stessa selezione) vengono saltati.
 */
export async function importFiles(files: ArrayLike<File> | Iterable<File>, opts: ImportOptions): Promise<ImportResult> {
  const { labels, existing, onProgress, signal } = opts
  const candidates = Array.from(files).filter(isAudioFile)
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, failed: 0, errors: [] }
  const progress: ImportProgress = { total: candidates.length, done: 0, currentName: '', added: 0, updated: 0, skipped: 0, failed: 0 }

  const report = (name: string) => {
    if (!onProgress) return
    progress.currentName = name
    progress.added = result.added
    progress.updated = result.updated
    progress.skipped = result.skipped
    progress.failed = result.failed
    onProgress({ ...progress })
  }
  const pushError = (name: string, e: unknown) => {
    if (result.errors.length < MAX_ERRORS) result.errors.push({ name, error: errorMessage(e) })
  }

  // Doppioni: stessa impronta già in libreria o già vista in questa selezione.
  const seen = new Set<string>()
  const todo: Array<{ file: File; info: FileInfo }> = []
  for (const file of candidates) {
    const info = fileInfo(file)
    const fp = fingerprintOf(info)
    if (existing.has(fp) || seen.has(fp)) {
      result.skipped++
      progress.done++
      continue
    }
    seen.add(fp)
    todo.push({ file, info })
  }
  report('')
  if (todo.length === 0) return result

  // Album che hanno già una copertina (in archivio o prodotta in questa importazione).
  let albumsWithArt = new Set<string>()
  try {
    albumsWithArt = new Set(await db.getAllArtworkIds())
  } catch {
    // archivio illeggibile: al più si rielabora una copertina già presente
  }
  // Brani già in libreria senza copertina, per album: se ne arriva una adesso, la ricevono anche loro.
  const existingNoArt = new Map<string, Track[]>()
  for (const t of existing.values()) {
    if (t.artworkId) continue
    const list = existingNoArt.get(t.albumId)
    if (list) list.push(t)
    else existingNoArt.set(t.albumId, [t])
  }

  const tracksByAlbum = new Map<string, Track[]>()
  /** Id dei brani già consegnati a una scrittura: se cambiano dopo, vanno riscritti nel lotto successivo. */
  const handedOver = new Set<string>()
  const artJobs = new Map<string, Promise<boolean>>()
  let batch = emptyBatch()
  let stopped = false

  const flush = async () => {
    if (batch.tracks.length === 0 && batch.artwork.length === 0) return
    const current = batch
    batch = emptyBatch()
    for (const f of current.files) handedOver.add(f.id)
    try {
      await db.putBatch({ tracks: current.tracks, files: current.files, artwork: current.artwork })
    } catch (e) {
      // Scrittura fallita (spazio esaurito, archivio chiuso): nulla del lotto è in libreria.
      const failedIds = new Set(current.files.map((f) => f.id))
      const byId = new Map(current.tracks.map((t) => [t.id, t] as const))
      for (const id of failedIds) {
        handedOver.delete(id)
        result.added--
        result.failed++
        pushError(byId.get(id)?.fileName ?? id, e)
      }
      for (const [albumId, list] of tracksByAlbum) tracksByAlbum.set(albumId, list.filter((t) => !failedIds.has(t.id)))
      for (const a of current.artwork) albumsWithArt.delete(a.id)
      result.updated -= current.updated
      if (errorName(e) === 'QuotaExceededError') stopped = true
    }
  }

  /** L'album ha ora una copertina: la ricevono tutte le sue tracce, anche quelle già scritte o già in libreria. */
  const grantArtwork = (albumId: string) => {
    albumsWithArt.add(albumId)
    for (const t of tracksByAlbum.get(albumId) ?? []) {
      if (t.artworkId) continue
      t.artworkId = albumId
      if (handedOver.has(t.id)) batch.tracks.push(t)
    }
    const olds = existingNoArt.get(albumId)
    if (!olds) return
    existingNoArt.delete(albumId)
    for (const t of olds) {
      batch.tracks.push({ ...t, artworkId: albumId })
      batch.updated++
      result.updated++
    }
  }

  const ensureArtwork = async (albumId: string, picture: ParsedPicture) => {
    if (albumsWithArt.has(albumId)) return
    const pending = artJobs.get(albumId)
    // Un'altra traccia dello stesso album ci sta già provando: se riesce, questa immagine non serve.
    if (pending && (await pending)) return
    if (albumsWithArt.has(albumId)) return
    const job = (async () => {
      try {
        const art = await processArtwork(new Blob([picture.data], { type: picture.mime }), albumId)
        if (!art) return false
        batch.artwork.push(art)
        grantArtwork(albumId)
        return true
      } catch {
        return false
      }
    })()
    artJobs.set(albumId, job)
    try {
      await job
    } finally {
      if (artJobs.get(albumId) === job) artJobs.delete(albumId)
    }
  }

  const pool = workerPool(poolSize())
  const parser: TagParser = pool ?? mainThreadParser()
  let fallback: TagParser | null = pool ? null : parser
  const parse = async (file: File): Promise<ParseOutcome> => {
    try {
      return await parser.parse(file)
    } catch (e) {
      if (!(e instanceof WorkerFailure)) throw e
      fallback ??= mainThreadParser()
      return fallback.parse(file)
    }
  }

  const processOne = async ({ file, info }: { file: File; info: FileInfo }) => {
    try {
      const outcome = await parse(file)
      const track = tagsToTrack(outcome.common, info, labels)
      if (albumsWithArt.has(track.albumId)) track.artworkId = track.albumId
      const siblings = tracksByAlbum.get(track.albumId)
      if (siblings) siblings.push(track)
      else tracksByAlbum.set(track.albumId, [track])
      if (outcome.picture && !track.artworkId) await ensureArtwork(track.albumId, outcome.picture)
      batch.tracks.push(track)
      batch.files.push({ id: track.id, blob: file })
      result.added++
      if (batch.tracks.length >= BATCH_SIZE) await flush()
    } catch (e) {
      result.failed++
      pushError(info.name, e)
    } finally {
      progress.done++
      report(info.name)
    }
  }

  let next = 0
  const lane = async () => {
    while (!stopped && next < todo.length) {
      if (signal?.aborted) {
        stopped = true
        break
      }
      await processOne(todo[next++]!)
    }
  }
  try {
    await Promise.all(Array.from({ length: parser.concurrency }, lane))
    await flush()
  } finally {
    parser.dispose()
    fallback?.dispose()
  }
  report(progress.currentName)
  return result
}

// ---- Selettori (da chiamare dentro un gesto dell'utente) -------------------------------------

/**
 * Apre il selettore di file del browser (`mode: 'folder'` = cartella intera, dove supportato;
 * su iOS l'input resta multi-file). Risolve [] se l'utente annulla.
 */
export function pickFiles(mode: 'files' | 'folder'): Promise<File[]> {
  if (typeof document === 'undefined' || !document.body) return Promise.resolve([])
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = AUDIO_ACCEPT
    if (mode === 'folder') input.setAttribute('webkitdirectory', '')
    // Fuori schermo ma non display:none: alcune versioni di Safari ignorano click() sugli input nascosti.
    input.style.cssText = 'position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;pointer-events:none'
    input.tabIndex = -1
    input.setAttribute('aria-hidden', 'true')
    document.body.appendChild(input)

    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (files: File[]) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
      input.remove()
      resolve(files)
    }
    const onFocus = () => {
      // Il dialogo si è chiuso: se 'change' non arriva entro poco, l'utente ha annullato (browser
      // senza evento 'cancel'). Per le cartelle si aspetta di più: Chrome chiede conferma e intanto
      // enumera i file, e in quel tempo la finestra ha già ripreso il fuoco.
      clearTimeout(timer)
      timer = setTimeout(() => finish([]), mode === 'folder' ? 10_000 : 1000)
    }
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])), { once: true })
    input.addEventListener('cancel', () => finish([]), { once: true })
    window.addEventListener('focus', onFocus)
    try {
      input.click()
    } catch {
      finish([])
    }
  })
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

function isAbort(e: unknown): boolean {
  return errorName(e) === 'AbortError'
}

/** Visita ricorsiva: salta le voci nascoste e i file che per nome non sono audio; annota il percorso relativo. */
async function walk(dir: FileSystemDirectoryHandle, prefix: string, out: File[]): Promise<void> {
  try {
    for await (const entry of dir.values()) {
      if (entry.name.startsWith('.')) continue
      const path = `${prefix}/${entry.name}`
      if (entry.kind === 'directory') {
        await walk(entry, path, out)
        continue
      }
      if (!isAudioFile({ name: entry.name, type: '' })) continue
      try {
        const file = await entry.getFile()
        setFilePath(file, path)
        out.push(file)
      } catch {
        // file non leggibile (permessi, rimosso nel frattempo): si salta
      }
    }
  } catch {
    // cartella non più leggibile: si tiene quanto raccolto finora
  }
}

/**
 * Sceglie una cartella con la File System Access API (Chrome/Edge desktop) e ne ricorda l'handle
 * in IndexedDB per le ri-sincronizzazioni. null se l'API manca o l'utente annulla.
 */
export async function pickDirectory(): Promise<File[] | null> {
  if (!supportsDirectoryPicker()) return null
  let handle: FileSystemDirectoryHandle
  try {
    handle = await window.showDirectoryPicker({ mode: 'read' })
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
  try {
    await db.setMeta('syncHandle', handle)
    await db.setMeta('syncHandleName', handle.name)
  } catch {
    // handle non serializzabile o archivio indisponibile: si importa lo stesso, senza ri-sincronizzazione
  }
  const files: File[] = []
  await walk(handle, handle.name, files)
  return files
}

/**
 * Rilegge la cartella scelta in precedenza. Se il permesso non è più valido lo richiede
 * (riesce solo dentro un gesto dell'utente); null se non c'è un handle o il permesso è negato.
 */
export async function resyncFromStoredHandle(): Promise<{ files: File[]; name: string } | null> {
  let handle: FileSystemDirectoryHandle | undefined
  try {
    handle = await db.getMeta<FileSystemDirectoryHandle>('syncHandle')
  } catch {
    return null
  }
  if (!handle || typeof handle.values !== 'function' || typeof handle.queryPermission !== 'function') return null
  try {
    let state = await handle.queryPermission({ mode: 'read' })
    if (state !== 'granted') state = await handle.requestPermission({ mode: 'read' })
    if (state !== 'granted') return null
  } catch {
    return null
  }
  const files: File[] = []
  await walk(handle, handle.name, files)
  return { files, name: handle.name }
}

export async function storedSyncFolderName(): Promise<string | null> {
  try {
    return (await db.getMeta<string>('syncHandleName')) ?? null
  } catch {
    return null
  }
}
