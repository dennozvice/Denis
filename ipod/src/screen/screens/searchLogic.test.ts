import { describe, expect, it } from 'vitest'
import { groupKey } from '../../library/sort'
import type { Track } from '../../library/types'
import { buildSearchIndex, DONE_INDEX, foldText, moveRibbon, RIBBON, RIBBON_LINES, searchTracks, withoutLast, withSpace } from './searchLogic'

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

const tracks = [
  track({ id: 't1', title: 'Zeta', artist: 'The Beatles', album: 'Abbey Road' }),
  track({ id: 't2', title: 'Alfa', artist: 'The Beatles', album: 'Abbey Road' }),
  track({ id: 't3', title: 'Élodie', artist: 'Lucio Battisti', album: 'Emozioni' }),
  track({ id: 't4', title: 'Faro', artist: 'Marea Elettrica', album: 'Faro' }),
  track({ id: 't5', title: 'Scirocco', artist: 'Marea Elettrica', album: 'Faro' }),
  track({ id: 't6', title: 'Luci sul golfo', artist: 'Lume', album: 'Notte a Trieste' }),
]
const index = buildSearchIndex(tracks)
const titles = (q: string, limit?: number) => searchTracks(index, q, limit).map((t) => t.title)

describe('foldText', () => {
  it('toglie accenti e maiuscole ma conserva l’articolo', () => {
    expect(foldText('Élodie')).toBe('elodie')
    expect(foldText('The Beatles')).toBe('the beatles')
  })
})

describe('searchTracks', () => {
  it('con testo vuoto (o solo spazi) non dà risultati', () => {
    expect(titles('')).toEqual([])
    expect(titles('  ')).toEqual([])
  })
  it('cerca per prefisso e sottostringa su titolo, album e artista, in ordine di titolo', () => {
    expect(titles('F')).toEqual(['Alfa', 'Faro', 'Luci sul golfo', 'Scirocco'])
    expect(titles('far')).toEqual(['Faro', 'Scirocco'])
    expect(titles('beat')).toEqual(['Alfa', 'Zeta'])
    expect(titles('abbey')).toEqual(['Alfa', 'Zeta'])
  })
  it('ignora maiuscole e accenti da entrambe le parti', () => {
    expect(titles('ELO')).toEqual(['Élodie'])
    expect(titles('élo')).toEqual(['Élodie'])
    expect(titles('the b')).toEqual(['Alfa', 'Zeta'])
  })
  it('lo spazio appena inserito in coda non azzera i risultati', () => {
    expect(titles('sul ')).toEqual(['Luci sul golfo'])
    expect(titles('sul g')).toEqual(['Luci sul golfo'])
    expect(titles('sul x')).toEqual([])
  })
  it('tronca al limite', () => {
    expect(titles('a', 2)).toEqual(['Alfa', 'Élodie'])
    expect(searchTracks(index, 'a').length).toBeGreaterThan(2)
  })
})

describe('testo digitato', () => {
  it('lo spazio non va all’inizio né doppio; cancella toglie l’ultimo carattere', () => {
    expect(withSpace('')).toBe('')
    expect(withSpace('ab')).toBe('ab ')
    expect(withSpace('ab ')).toBe('ab ')
    expect(withoutLast('ab ')).toBe('ab')
    expect(withoutLast('')).toBe('')
  })
})

describe('nastro di lettere', () => {
  it('ha lettere e cifre su due righe più "Fine" in coda', () => {
    expect(RIBBON_LINES.join('')).toBe('ABCDEFGHIJKLM01234NOPQRSTUVWXYZ56789')
    expect(RIBBON.length).toBe(37)
    expect(RIBBON[0]).toEqual({ line: 0, col: 0, char: 'A' })
    expect(RIBBON[18]).toEqual({ line: 1, col: 0, char: 'N' })
    expect(RIBBON[DONE_INDEX]).toEqual({ line: 1, col: 18, char: null })
    expect(DONE_INDEX).toBe(36)
  })
  it('la ghiera passa alla riga dopo e si ferma agli estremi', () => {
    expect(moveRibbon(17, 1)).toBe(18)
    expect(moveRibbon(18, -1)).toBe(17)
    expect(moveRibbon(0, -1)).toBe(0)
    expect(moveRibbon(DONE_INDEX, 1)).toBe(DONE_INDEX)
    expect(moveRibbon(DONE_INDEX - 2, 5)).toBe(DONE_INDEX)
  })
})
