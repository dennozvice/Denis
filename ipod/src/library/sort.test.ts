import { describe, expect, it } from 'vitest'
import { buildIndex, compareNames, groupKey, indexLetter, sortKey } from './sort'
import type { Track } from './types'

function track(partial: Partial<Track> & { id: string; title: string }): Track {
  const artist = partial.artist ?? 'Artista'
  const album = partial.album ?? 'Album'
  const albumArtist = partial.albumArtist ?? artist
  return {
    fingerprint: `${partial.id}|0|0`,
    artist,
    album,
    albumArtist,
    albumId: groupKey(albumArtist, album),
    artworkId: null,
    year: null,
    trackNo: null,
    trackOf: null,
    discNo: null,
    genre: '',
    composer: '',
    duration: 0,
    fileName: `${partial.id}.mp3`,
    path: '',
    size: 0,
    mime: 'audio/mpeg',
    addedAt: 0,
    playCount: 0,
    rating: 0,
    lastPlayedAt: null,
    kind: 'music',
    ...partial,
  }
}

const labels = { artist: 'Artista sconosciuto', album: 'Album sconosciuto', title: 'Brano sconosciuto' }

describe('sortKey / compareNames / indexLetter', () => {
  it('ignora "The" iniziale, accenti e maiuscole', () => {
    expect(sortKey('The Beatles')).toBe('beatles')
    expect(sortKey('Élodie')).toBe('elodie')
    expect(compareNames('The Beatles', 'Battisti')).toBeGreaterThan(0)
    expect(compareNames('the beatles', 'The Beatles')).toBe(0)
    expect(indexLetter('The Beatles')).toBe('B')
    expect(indexLetter('883')).toBe('#')
    expect(indexLetter('Élodie')).toBe('E')
  })
  it('ordina i numeri in modo naturale', () => {
    expect(compareNames('Track 2', 'Track 10')).toBeLessThan(0)
  })
})

describe('buildIndex', () => {
  const tracks = [
    track({ id: 't1', title: 'Zeta', artist: 'The Beatles', album: 'Abbey Road', trackNo: 2, year: 1969 }),
    track({ id: 't2', title: 'Alfa', artist: 'The Beatles', album: 'Abbey Road', trackNo: 1, year: 1969 }),
    track({ id: 't3', title: 'Disco due', artist: 'The Beatles', album: 'Abbey Road', trackNo: 1, discNo: 2, year: 1969 }),
    track({ id: 't4', title: 'Help!', artist: 'The Beatles', album: 'Help!', trackNo: 1, year: 1965, genre: 'Rock' }),
    track({ id: 't5', title: 'Emozioni', artist: 'Lucio Battisti', album: 'Emozioni', trackNo: 1, year: 1970, genre: 'Pop' }),
    track({ id: 't6', title: 'Ospite', artist: 'Ospite Speciale', albumArtist: 'Lucio Battisti', album: 'Emozioni', trackNo: 2, year: 1970 }),
    track({ id: 't7', title: 'Senza tag', artist: '', album: '' }),
  ]
  const idx = buildIndex(tracks, labels)

  it('raggruppa gli album per artista dell’album e ordina le tracce per disco e numero', () => {
    const abbey = idx.albums.find((a) => a.title === 'Abbey Road')!
    expect(abbey.trackIds).toEqual(['t2', 't1', 't3'])
    const emozioni = idx.albums.find((a) => a.title === 'Emozioni')!
    expect(emozioni.trackIds).toEqual(['t5', 't6'])
    expect(emozioni.artist).toBe('Lucio Battisti')
    expect(emozioni.isCompilation).toBe(true)
  })
  it('ordina artisti ignorando "The" e album per anno dentro l’artista', () => {
    expect(idx.artists.map((a) => a.name)).toEqual(['Artista sconosciuto', 'The Beatles', 'Lucio Battisti'])
    const beatles = idx.artists.find((a) => a.name === 'The Beatles')!
    expect(beatles.albumIds.map((id) => idx.albumsById.get(id)!.title)).toEqual(['Help!', 'Abbey Road'])
  })
  it('ordina i brani per titolo', () => {
    expect(idx.songs.map((t) => t.title)).toEqual(['Alfa', 'Disco due', 'Emozioni', 'Help!', 'Ospite', 'Senza tag', 'Zeta'])
  })
  it('elenca generi e compositori presenti', () => {
    expect(idx.genres.map((g) => g.name)).toEqual(['Pop', 'Rock'])
    expect(idx.composers).toEqual([])
  })
  it('usa le etichette "sconosciuto" quando il tag manca', () => {
    const unknown = idx.albums.find((a) => a.title === 'Album sconosciuto')!
    expect(unknown.artist).toBe('Artista sconosciuto')
    expect(unknown.trackIds).toEqual(['t7'])
  })
})
