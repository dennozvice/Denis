/**
 * Store della libreria: carica i brani da IndexedDB, costruisce gli indici (album, artisti,
 * brani, generi, compositori), gestisce playlist (compresa la On-The-Go), statistiche di
 * ascolto e le URL delle copertine (create pigramente e condivise).
 */
import { createStore, useStore } from '../core/store'
import { db } from './db'
import { buildIndex, type UnknownLabels } from './sort'
import type { Album, Artist, Playlist, Track } from './types'

export interface LibraryIndex {
  albums: Album[]
  albumsById: Map<string, Album>
  artists: Artist[]
  songs: Track[]
  genres: Array<{ name: string; trackIds: string[] }>
  composers: Array<{ name: string; trackIds: string[] }>
}

export interface LibraryState {
  ready: boolean
  /** Errore di apertura di IndexedDB (modalità privata, storage disabilitato…). */
  error: string | null
  tracks: Map<string, Track>
  index: LibraryIndex
  playlists: Playlist[]
  /** Contatore che cambia a ogni modifica: comodo per invalidare memo. */
  version: number
  labels: UnknownLabels
}

const emptyIndex = (): LibraryIndex => ({ albums: [], albumsById: new Map(), artists: [], songs: [], genres: [], composers: [] })

export const libraryStore = createStore<LibraryState>({
  ready: false,
  error: null,
  tracks: new Map(),
  index: emptyIndex(),
  playlists: [],
  version: 0,
  labels: { artist: 'Artista sconosciuto', album: 'Album sconosciuto', title: 'Brano sconosciuto' },
})

export const OTG_PLAYLIST_ID = 'otg'

function rebuild(tracks: Map<string, Track>, playlists: Playlist[], labels: UnknownLabels, error: string | null = null): void {
  const list = [...tracks.values()]
  libraryStore.set((s) => ({
    ...s,
    ready: true,
    error,
    tracks,
    index: buildIndex(list, labels),
    playlists: playlists.map((p) => ({ ...p, trackIds: p.trackIds.filter((id) => tracks.has(id)) })),
    version: s.version + 1,
    labels,
  }))
}

/** Carica (o ricarica) tutto da IndexedDB. */
export async function loadLibrary(labels?: UnknownLabels): Promise<void> {
  const lbl = labels ?? libraryStore.get().labels
  try {
    const [tracks, playlists] = await Promise.all([db.getAllTracks(), db.getAllPlaylists()])
    rebuild(new Map(tracks.map((t) => [t.id, t])), playlists, lbl)
  } catch (e) {
    rebuild(new Map(), [], lbl, e instanceof Error ? e.message : String(e))
  }
}

/** Cambia le etichette "sconosciuto" (cambio lingua) senza rileggere il database. */
export function relabelLibrary(labels: UnknownLabels): void {
  const s = libraryStore.get()
  rebuild(s.tracks, s.playlists, labels, s.error)
}

export const library = {
  track(id: string): Track | undefined {
    return libraryStore.get().tracks.get(id)
  },
  album(id: string): Album | undefined {
    return libraryStore.get().index.albumsById.get(id)
  },
  artist(name: string): Artist | undefined {
    return libraryStore.get().index.artists.find((a) => a.name === name)
  },
  playlist(id: string): Playlist | undefined {
    return libraryStore.get().playlists.find((p) => p.id === id)
  },
  tracksOf(ids: readonly string[]): Track[] {
    const m = libraryStore.get().tracks
    return ids.map((id) => m.get(id)).filter((t): t is Track => t !== undefined)
  },
  byKind(kind: Track['kind']): Track[] {
    return libraryStore.get().index.songs.filter((t) => t.kind === kind)
  },
  get count(): number {
    return libraryStore.get().tracks.size
  },

  /** Statistiche di ascolto: conteggio e data (salvate senza bloccare). */
  async markPlayed(id: string): Promise<void> {
    const s = libraryStore.get()
    const t = s.tracks.get(id)
    if (!t) return
    const next = { ...t, playCount: t.playCount + 1, lastPlayedAt: Date.now() }
    const tracks = new Map(s.tracks)
    tracks.set(id, next)
    // Non ricostruiamo gli indici: ordinamento e raggruppamento non cambiano.
    libraryStore.set({ ...s, tracks })
    await db.putTrack(next).catch(() => {})
  },
  async setDuration(id: string, duration: number): Promise<void> {
    const s = libraryStore.get()
    const t = s.tracks.get(id)
    if (!t || Math.abs(t.duration - duration) < 1) return
    const next = { ...t, duration }
    const tracks = new Map(s.tracks)
    tracks.set(id, next)
    libraryStore.set({ ...s, tracks })
    await db.putTrack(next).catch(() => {})
  },
  async setRating(id: string, rating: number): Promise<void> {
    const s = libraryStore.get()
    const t = s.tracks.get(id)
    if (!t) return
    const next = { ...t, rating: Math.max(0, Math.min(5, Math.round(rating))) }
    const tracks = new Map(s.tracks)
    tracks.set(id, next)
    libraryStore.set({ ...s, tracks, version: s.version + 1 })
    await db.putTrack(next).catch(() => {})
  },

  /** Playlist On-The-Go: aggiunge (o toglie, se già presente) un brano. Restituisce true se aggiunto. */
  async toggleOnTheGo(id: string, name: string): Promise<boolean> {
    const s = libraryStore.get()
    const existing = s.playlists.find((p) => p.id === OTG_PLAYLIST_ID)
    const list: Playlist = existing ?? { id: OTG_PLAYLIST_ID, name, trackIds: [], kind: 'otg' }
    const has = list.trackIds.includes(id)
    const next: Playlist = { ...list, name, trackIds: has ? list.trackIds.filter((x) => x !== id) : [...list.trackIds, id] }
    const playlists = existing ? s.playlists.map((p) => (p.id === OTG_PLAYLIST_ID ? next : p)) : [...s.playlists, next]
    libraryStore.set({ ...s, playlists, version: s.version + 1 })
    await db.putPlaylist(next).catch(() => {})
    return !has
  },
  async clearOnTheGo(): Promise<void> {
    const s = libraryStore.get()
    libraryStore.set({ ...s, playlists: s.playlists.filter((p) => p.id !== OTG_PLAYLIST_ID), version: s.version + 1 })
    await db.deletePlaylist(OTG_PLAYLIST_ID).catch(() => {})
  },
  async savePlaylist(p: Playlist): Promise<void> {
    const s = libraryStore.get()
    const exists = s.playlists.some((x) => x.id === p.id)
    libraryStore.set({ ...s, playlists: exists ? s.playlists.map((x) => (x.id === p.id ? p : x)) : [...s.playlists, p], version: s.version + 1 })
    await db.putPlaylist(p).catch(() => {})
  },

  /** Cancella tutta la musica (file, copertine, playlist) e ricostruisce la libreria vuota. */
  async eraseAll(): Promise<void> {
    artworkCache.clear()
    await db.clearAll()
    await loadLibrary()
  },
  /** Rimuove alcuni brani (es. file non più leggibili). */
  async removeTracks(ids: readonly string[]): Promise<void> {
    await db.deleteTracks(ids)
    await loadLibrary()
  },
}

/* ---------- copertine: URL oggetto create una volta e condivise ---------- */

interface ArtEntry {
  thumb: string | null
  full: string | null
}

class ArtworkCache {
  private entries = new Map<string, Promise<ArtEntry>>()
  get(id: string): Promise<ArtEntry> {
    let p = this.entries.get(id)
    if (!p) {
      p = db
        .getArtwork(id)
        .then((a) => (a ? { thumb: URL.createObjectURL(a.thumb), full: URL.createObjectURL(a.blob) } : { thumb: null, full: null }))
        .catch(() => ({ thumb: null, full: null }))
      this.entries.set(id, p)
    }
    return p
  }
  clear(): void {
    for (const p of this.entries.values()) {
      void p.then((e) => {
        if (e.thumb) URL.revokeObjectURL(e.thumb)
        if (e.full) URL.revokeObjectURL(e.full)
      })
    }
    this.entries.clear()
  }
}

export const artworkCache = new ArtworkCache()

export async function artworkUrl(artworkId: string | null, size: 'thumb' | 'full'): Promise<string | null> {
  if (!artworkId) return null
  const e = await artworkCache.get(artworkId)
  return size === 'thumb' ? e.thumb : e.full
}

export function useLibrary<S = LibraryState>(selector?: (s: LibraryState) => S): S {
  return useStore(libraryStore, selector)
}
