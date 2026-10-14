import { describe, expect, it } from 'vitest'
import { parseBuffer } from 'music-metadata'
import { encodeWav } from './wav'

describe('encodeWav', () => {
  it('produce un WAV leggibile con i tag ID3 (titolo, artista, album, numero, copertina)', async () => {
    const sampleRate = 8000
    const n = sampleRate * 2
    const left = new Float32Array(n)
    const right = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      left[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5
      right[i] = Math.sin((2 * Math.PI * 660 * i) / sampleRate) * 0.5
    }
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    const bytes = encodeWav([left, right], sampleRate, {
      title: 'Città vuota',
      artist: 'Mina',
      album: 'Studio Uno',
      albumArtist: 'Mina',
      year: 1963,
      trackNo: 2,
      trackOf: 12,
      genre: 'Pop',
      composer: 'Doc Pomus',
      picture: { mime: 'image/png', data: png },
    })
    const meta = await parseBuffer(bytes, { mimeType: 'audio/wav' })
    expect(meta.common.title).toBe('Città vuota')
    expect(meta.common.artist).toBe('Mina')
    expect(meta.common.album).toBe('Studio Uno')
    expect(meta.common.albumartist).toBe('Mina')
    expect(meta.common.year).toBe(1963)
    expect(meta.common.track).toEqual({ no: 2, of: 12 })
    expect(meta.common.genre).toEqual(['Pop'])
    expect(meta.common.composer).toEqual(['Doc Pomus'])
    expect(meta.common.picture?.[0]?.format).toBe('image/png')
    expect(Array.from(meta.common.picture![0]!.data)).toEqual(Array.from(png))
    expect(meta.format.duration).toBeCloseTo(2, 3)
    expect(meta.format.numberOfChannels).toBe(2)
    expect(meta.format.sampleRate).toBe(8000)
  })
  it('funziona anche senza tag e con un solo canale', async () => {
    const bytes = encodeWav([new Float32Array(100)], 44100)
    const meta = await parseBuffer(bytes, { mimeType: 'audio/wav' })
    expect(meta.format.numberOfChannels).toBe(1)
    expect(meta.common.title).toBeUndefined()
  })
})
