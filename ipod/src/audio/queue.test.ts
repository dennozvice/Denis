import { describe, expect, it } from 'vitest'
import { buildOrder, formatTime, nextIndex, prevIndex, seededRandom, shuffleArray, volumeToGain } from './queue'

const items = [
  { id: 'a1', albumId: 'A' },
  { id: 'a2', albumId: 'A' },
  { id: 'a3', albumId: 'A' },
  { id: 'b1', albumId: 'B' },
  { id: 'b2', albumId: 'B' },
  { id: 'c1', albumId: 'C' },
]

describe('shuffleArray', () => {
  it('è una permutazione e non modifica l’originale', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8]
    const out = shuffleArray(src, seededRandom(1))
    expect(out).toHaveLength(src.length)
    expect([...out].sort()).toEqual([...src].sort())
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('buildOrder', () => {
  it('senza casuale mantiene l’ordine', () => {
    expect(buildOrder(items, 'b1', 'off').map((i) => i.id)).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'c1'])
  })
  it('casuale brani: il brano scelto resta per primo', () => {
    const out = buildOrder(items, 'b1', 'songs', seededRandom(7))
    expect(out[0]!.id).toBe('b1')
    expect(out.map((i) => i.id).sort()).toEqual(items.map((i) => i.id).sort())
  })
  it('casuale album: album interi, l’album scelto parte dal brano scelto', () => {
    const out = buildOrder(items, 'a2', 'albums', seededRandom(3)).map((i) => i.id)
    expect(out.slice(0, 3)).toEqual(['a2', 'a3', 'a1'])
    const rest = out.slice(3)
    const albums = rest.map((id) => id[0])
    // le tracce dello stesso album sono contigue e in ordine
    expect(albums.join('')).toMatch(/^(bbc|cbb)$/)
    expect(rest.indexOf('b1')).toBeLessThan(rest.indexOf('b2'))
  })
  it('gestisce lista vuota e brano iniziale sconosciuto', () => {
    expect(buildOrder([], 'x', 'songs')).toEqual([])
    expect(buildOrder(items, 'zz', 'songs', seededRandom(1))).toHaveLength(items.length)
  })
})

describe('nextIndex / prevIndex', () => {
  it('ripeti off: finisce in fondo', () => {
    expect(nextIndex(0, 3, 'off', false)).toBe(1)
    expect(nextIndex(2, 3, 'off', false)).toBeNull()
    expect(nextIndex(2, 3, 'off', true)).toBeNull()
  })
  it('ripeti tutti: ricomincia', () => {
    expect(nextIndex(2, 3, 'all', false)).toBe(0)
    expect(prevIndex(0, 3, 'all')).toBe(2)
    expect(prevIndex(0, 3, 'off')).toBe(0)
  })
  it('ripeti uno: resta sul brano a fine riproduzione, ma avanza se lo chiede l’utente', () => {
    expect(nextIndex(1, 3, 'one', false)).toBe(1)
    expect(nextIndex(1, 3, 'one', true)).toBe(2)
    expect(nextIndex(2, 3, 'one', true)).toBe(0)
  })
  it('coda vuota', () => {
    expect(nextIndex(0, 0, 'all', false)).toBeNull()
    expect(prevIndex(0, 0, 'all')).toBe(0)
  })
})

describe('formatTime', () => {
  it('formatta come l’iPod', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(3725)).toBe('1:02:05')
    expect(formatTime(125.9, true)).toBe('-2:05')
    expect(formatTime(NaN)).toBe('0:00')
  })
})

describe('volumeToGain', () => {
  it('è monotona e limitata', () => {
    expect(volumeToGain(0)).toBe(0)
    expect(volumeToGain(100)).toBe(1)
    expect(volumeToGain(50)).toBeCloseTo(0.25)
    expect(volumeToGain(150)).toBe(1)
  })
})
