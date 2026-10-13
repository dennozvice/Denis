/**
 * Archivio IndexedDB della libreria: metadati, file audio (Blob), copertine, playlist, varie.
 * Promesse al posto delle callback; scritture in blocco in un'unica transazione.
 */
import type { Artwork, Playlist, Track } from './types'

export const DB_NAME = 'ipod-classic'
export const DB_VERSION = 1

export type StoreName = 'tracks' | 'files' | 'artwork' | 'playlists' | 'meta'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files')
      if (!db.objectStoreNames.contains('artwork')) db.createObjectStore('artwork', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error ?? new Error('IndexedDB non disponibile'))
    req.onblocked = () => reject(new Error('IndexedDB bloccato da un’altra scheda'))
  })
  dbPromise.catch(() => {
    dbPromise = null
  })
  return dbPromise
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Errore IndexedDB'))
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Transazione fallita'))
    tx.onabort = () => reject(tx.error ?? new Error('Transazione annullata'))
  })
}

async function tx(stores: StoreName[], mode: IDBTransactionMode) {
  const db = await open()
  return db.transaction(stores, mode)
}

export const db = {
  async getAllTracks(): Promise<Track[]> {
    const t = await tx(['tracks'], 'readonly')
    return request(t.objectStore('tracks').getAll() as IDBRequest<Track[]>)
  },
  async putTracks(tracks: readonly Track[]): Promise<void> {
    if (tracks.length === 0) return
    const t = await tx(['tracks'], 'readwrite')
    const store = t.objectStore('tracks')
    for (const tr of tracks) store.put(tr)
    await done(t)
  },
  async putTrack(track: Track): Promise<void> {
    return db.putTracks([track])
  },
  /** Salva in una sola transazione tracce + file + copertine (importazione). */
  async putBatch(items: { tracks: Track[]; files: Array<{ id: string; blob: Blob }>; artwork: Artwork[] }): Promise<void> {
    const t = await tx(['tracks', 'files', 'artwork'], 'readwrite')
    const tracks = t.objectStore('tracks')
    const files = t.objectStore('files')
    const art = t.objectStore('artwork')
    for (const tr of items.tracks) tracks.put(tr)
    for (const f of items.files) files.put(f.blob, f.id)
    for (const a of items.artwork) art.put(a)
    await done(t)
  },
  async deleteTracks(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return
    const t = await tx(['tracks', 'files'], 'readwrite')
    for (const id of ids) {
      t.objectStore('tracks').delete(id)
      t.objectStore('files').delete(id)
    }
    await done(t)
  },
  async getFile(id: string): Promise<Blob | undefined> {
    const t = await tx(['files'], 'readonly')
    return request(t.objectStore('files').get(id) as IDBRequest<Blob | undefined>)
  },
  async getArtwork(id: string): Promise<Artwork | undefined> {
    const t = await tx(['artwork'], 'readonly')
    return request(t.objectStore('artwork').get(id) as IDBRequest<Artwork | undefined>)
  },
  async getAllArtworkIds(): Promise<string[]> {
    const t = await tx(['artwork'], 'readonly')
    return request(t.objectStore('artwork').getAllKeys() as IDBRequest<string[]>)
  },
  async deleteArtwork(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return
    const t = await tx(['artwork'], 'readwrite')
    for (const id of ids) t.objectStore('artwork').delete(id)
    await done(t)
  },
  async getAllPlaylists(): Promise<Playlist[]> {
    const t = await tx(['playlists'], 'readonly')
    return request(t.objectStore('playlists').getAll() as IDBRequest<Playlist[]>)
  },
  async putPlaylist(p: Playlist): Promise<void> {
    const t = await tx(['playlists'], 'readwrite')
    t.objectStore('playlists').put(p)
    await done(t)
  },
  async deletePlaylist(id: string): Promise<void> {
    const t = await tx(['playlists'], 'readwrite')
    t.objectStore('playlists').delete(id)
    await done(t)
  },
  async getMeta<T>(key: string): Promise<T | undefined> {
    const t = await tx(['meta'], 'readonly')
    return request(t.objectStore('meta').get(key) as IDBRequest<T | undefined>)
  },
  async setMeta(key: string, value: unknown): Promise<void> {
    const t = await tx(['meta'], 'readwrite')
    t.objectStore('meta').put(value, key)
    await done(t)
  },
  /** Svuota tutta la libreria (Impostazioni › Ripristina / Cancella musica). */
  async clearAll(): Promise<void> {
    const t = await tx(['tracks', 'files', 'artwork', 'playlists', 'meta'], 'readwrite')
    for (const name of ['tracks', 'files', 'artwork', 'playlists', 'meta'] as const) t.objectStore(name).clear()
    await done(t)
  },
  /** Spazio usato/disponibile per la schermata Info (stima del browser). */
  async storageEstimate(): Promise<{ usage: number; quota: number } | null> {
    try {
      if (!navigator.storage?.estimate) return null
      const e = await navigator.storage.estimate()
      return { usage: e.usage ?? 0, quota: e.quota ?? 0 }
    } catch {
      return null
    }
  },
  /** Chiede al browser di non cancellare i dati quando lo spazio scarseggia. */
  async persist(): Promise<boolean> {
    try {
      return (await navigator.storage?.persist?.()) ?? false
    } catch {
      return false
    }
  },
}
