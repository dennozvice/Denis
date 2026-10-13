/**
 * Regole di ordinamento e raggruppamento della libreria, come iTunes/iPod:
 * - "The " iniziale ignorato nell'ordinamento di artisti e album;
 * - confronto in base alla lingua, senza distinzione di maiuscole/accenti, con numeri "naturali";
 * - album raggruppati per "artista dell'album" (albumartist, altrimenti artist);
 * - tracce in ordine di disco e numero, poi titolo.
 */
import type { Album, Artist, Track } from './types'

const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true, ignorePunctuation: false })

/** Chiave di ordinamento di un nome: senza "The " iniziale, minuscola e senza accenti. */
export function sortKey(name: string): string {
  const trimmed = name.trim()
  const noArticle = trimmed.replace(/^(the|a|an)\s+/i, '')
  return noArticle
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function compareNames(a: string, b: string): number {
  const ka = sortKey(a)
  const kb = sortKey(b)
  const c = collator.compare(ka, kb)
  return c !== 0 ? c : collator.compare(a, b)
}

/** Lettera dell'indice (A–Z, "#" per numeri/simboli) con cui iniziano un nome ordinato: serve all'overlay di scorrimento veloce. */
export function indexLetter(name: string): string {
  const k = sortKey(name)
  const first = k.charAt(0).toUpperCase()
  if (first >= 'A' && first <= 'Z') return first
  return '#'
}

/** Chiave normalizzata per raggruppare (es. id album = albumArtist + album). */
export function groupKey(...parts: string[]): string {
  return parts.map((p) => sortKey(p).replace(/\s+/g, ' ')).join('\u0000')
}

export function compareTracksInAlbum(a: Track, b: Track): number {
  const da = a.discNo ?? 1
  const db = b.discNo ?? 1
  if (da !== db) return da - db
  const ta = a.trackNo ?? Number.MAX_SAFE_INTEGER
  const tb = b.trackNo ?? Number.MAX_SAFE_INTEGER
  if (ta !== tb) return ta - tb
  return compareNames(a.title, b.title)
}

export function compareAlbums(a: Album, b: Album): number {
  // Album di un artista: per anno, poi titolo. Tra artisti diversi: per artista.
  const c = compareNames(a.artist, b.artist)
  if (c !== 0) return c
  const ya = a.year ?? Number.MAX_SAFE_INTEGER
  const yb = b.year ?? Number.MAX_SAFE_INTEGER
  if (ya !== yb) return ya - yb
  return compareNames(a.title, b.title)
}

export function compareAlbumTitles(a: Album, b: Album): number {
  const c = compareNames(a.title, b.title)
  return c !== 0 ? c : compareNames(a.artist, b.artist)
}

export function compareTitles(a: Track, b: Track): number {
  const c = compareNames(a.title, b.title)
  if (c !== 0) return c
  const d = compareNames(a.artist, b.artist)
  return d !== 0 ? d : compareNames(a.album, b.album)
}

/** Etichetta usata quando un tag manca, nella lingua dell'interfaccia. */
export interface UnknownLabels {
  artist: string
  album: string
  title: string
}

/** Costruisce gli indici derivati (album, artisti, brani ordinati, generi, compositori). */
export function buildIndex(tracks: readonly Track[], labels: UnknownLabels) {
  const albumsById = new Map<string, Album>()
  const artistsByKey = new Map<string, Artist>()
  const genres = new Map<string, string[]>()
  const composers = new Map<string, string[]>()

  for (const t of tracks) {
    const artistName = t.albumArtist || t.artist || labels.artist
    const albumTitle = t.album || labels.album
    let album = albumsById.get(t.albumId)
    if (!album) {
      album = {
        id: t.albumId,
        title: albumTitle,
        artist: artistName,
        year: t.year,
        artworkId: t.artworkId,
        trackIds: [],
        isCompilation: false,
      }
      albumsById.set(t.albumId, album)
    }
    album.trackIds.push(t.id)
    if (!album.artworkId && t.artworkId) album.artworkId = t.artworkId
    if (album.year === null && t.year !== null) album.year = t.year
    if (t.artist && t.albumArtist && sortKey(t.artist) !== sortKey(t.albumArtist)) album.isCompilation = true

    const akey = sortKey(artistName)
    let artist = artistsByKey.get(akey)
    if (!artist) {
      artist = { name: artistName, sortName: akey, albumIds: [], trackIds: [] }
      artistsByKey.set(akey, artist)
    }
    artist.trackIds.push(t.id)
    if (!artist.albumIds.includes(t.albumId)) artist.albumIds.push(t.albumId)

    if (t.genre) {
      const g = genres.get(t.genre) ?? []
      g.push(t.id)
      genres.set(t.genre, g)
    }
    if (t.composer) {
      const c = composers.get(t.composer) ?? []
      c.push(t.id)
      composers.set(t.composer, c)
    }
  }

  const byId = new Map(tracks.map((t) => [t.id, t] as const))
  for (const album of albumsById.values()) {
    album.trackIds.sort((a, b) => compareTracksInAlbum(byId.get(a)!, byId.get(b)!))
  }
  const albums = [...albumsById.values()].sort(compareAlbumTitles)
  const artists = [...artistsByKey.values()].sort((a, b) => compareNames(a.name, b.name))
  for (const artist of artists) {
    artist.albumIds.sort((a, b) => compareAlbums(albumsById.get(a)!, albumsById.get(b)!))
    artist.trackIds.sort((a, b) => compareTitles(byId.get(a)!, byId.get(b)!))
  }
  const songs = [...tracks].sort(compareTitles)
  const toSortedEntries = (m: Map<string, string[]>) =>
    [...m.entries()]
      .map(([name, ids]) => ({ name, trackIds: ids.sort((a, b) => compareTitles(byId.get(a)!, byId.get(b)!)) }))
      .sort((a, b) => compareNames(a.name, b.name))

  return {
    albums,
    albumsById,
    artists,
    songs,
    genres: toSortedEntries(genres),
    composers: toSortedEntries(composers),
  }
}
