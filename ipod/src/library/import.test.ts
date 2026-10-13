import { describe, expect, it } from 'vitest'
import { parseBuffer, type IAudioMetadata } from 'music-metadata'
import { AUDIO_EXTENSIONS, getFilePath, isAudioFile, setFilePath, tagsToTrack } from './import'
import { baseName, extensionOf, fingerprintOf, guessMime, kindOf, newId, pickPicture, toParsedTags, type FileInfo, type ParsedTags } from './mapping'
import { groupKey } from './sort'
import { encodeWav } from './wav'

const labels = { artist: 'Artista sconosciuto', album: 'Album sconosciuto', title: 'Brano sconosciuto' }
const noTags: ParsedTags = { track: { no: null, of: null }, disk: { no: null } }

function info(partial: Partial<FileInfo> = {}): FileInfo {
  return { name: '01 - Titolo.mp3', path: '', size: 1234, lastModified: 1_700_000_000_000, type: '', ...partial }
}

function tags(partial: Partial<ParsedTags> = {}): ParsedTags {
  return { ...noTags, ...partial }
}

describe('tagsToTrack', () => {
  it('riporta i tag completi nella Track', () => {
    const t = tagsToTrack(
      tags({
        title: 'Città vuota',
        artist: 'Mina',
        albumartist: 'Mina',
        album: 'Studio Uno',
        year: 1963,
        track: { no: 2, of: 12 },
        disk: { no: 1 },
        genre: ['Pop', 'Italiana'],
        composer: ['Doc Pomus', 'Altro'],
        duration: 183.5,
      }),
      info({ name: 'citta.mp3', path: 'Musica/Mina/citta.mp3', size: 99, lastModified: 5, type: 'audio/mpeg' }),
      labels,
      { id: 'id-1', addedAt: 42 },
    )
    expect(t).toMatchObject({
      id: 'id-1',
      fingerprint: 'Musica/Mina/citta.mp3|99|5',
      title: 'Città vuota',
      artist: 'Mina',
      albumArtist: 'Mina',
      album: 'Studio Uno',
      albumId: groupKey('Mina', 'Studio Uno'),
      artworkId: null,
      year: 1963,
      trackNo: 2,
      trackOf: 12,
      discNo: 1,
      genre: 'Pop',
      composer: 'Doc Pomus',
      duration: 183.5,
      fileName: 'citta.mp3',
      path: 'Musica/Mina/citta.mp3',
      size: 99,
      mime: 'audio/mpeg',
      addedAt: 42,
      playCount: 0,
      rating: 0,
      lastPlayedAt: null,
      kind: 'music',
    })
  })

  it('senza tag usa il nome del file e le etichette "sconosciuto"', () => {
    const t = tagsToTrack(noTags, info(), labels)
    expect(t.title).toBe('01 - Titolo')
    expect(t.artist).toBe(labels.artist)
    expect(t.albumArtist).toBe(labels.artist)
    expect(t.album).toBe(labels.album)
    expect(t.albumId).toBe(groupKey(labels.artist, labels.album))
    expect(t.year).toBeNull()
    expect(t.trackNo).toBeNull()
    expect(t.trackOf).toBeNull()
    expect(t.discNo).toBeNull()
    expect(t.genre).toBe('')
    expect(t.composer).toBe('')
    expect(t.duration).toBe(0)
    expect(t.path).toBe('')
    expect(t.fingerprint).toBe('01 - Titolo.mp3|1234|1700000000000')
    expect(t.kind).toBe('music')
  })

  it('titolo: tag vuoto o solo spazi → nome file senza estensione, spazi tolti', () => {
    expect(tagsToTrack(tags({ title: '   ' }), info(), labels).title).toBe('01 - Titolo')
    expect(tagsToTrack(noTags, info({ name: 'Senza estensione' }), labels).title).toBe('Senza estensione')
    expect(tagsToTrack(noTags, info({ name: '.nascosto' }), labels).title).toBe('.nascosto')
    expect(tagsToTrack(noTags, info({ name: '  spazi .flac' }), labels).title).toBe('spazi')
    expect(tagsToTrack(noTags, info({ name: 'archivio.tar.mp3' }), labels).title).toBe('archivio.tar')
    expect(tagsToTrack(tags({ title: '  Con spazi  ' }), info(), labels).title).toBe('Con spazi')
  })

  it('album artist: ricade sull’artista; l’albumId raggruppa per album artist', () => {
    const a = tagsToTrack(tags({ artist: 'Mina', album: 'Duetti' }), info(), labels)
    expect(a.albumArtist).toBe('Mina')
    expect(a.albumId).toBe(groupKey('Mina', 'Duetti'))
    const b = tagsToTrack(tags({ artist: 'Mina & Celentano', albumartist: 'Mina', album: 'duetti' }), info(), labels)
    expect(b.artist).toBe('Mina & Celentano')
    expect(b.albumId).toBe(a.albumId)
    const c = tagsToTrack(tags({ artist: 'Mina', album: 'DUÉTTI' }), info(), labels)
    expect(c.albumId).toBe(a.albumId)
    const d = tagsToTrack(tags({ artist: 'Mina', album: 'Altro' }), info(), labels)
    expect(d.albumId).not.toBe(a.albumId)
  })

  it('anno valido solo tra 1000 e 2999, intero', () => {
    const year = (y: number | undefined) => tagsToTrack(tags({ year: y }), info(), labels).year
    expect(year(1963)).toBe(1963)
    expect(year(1000)).toBe(1000)
    expect(year(2999)).toBe(2999)
    expect(year(999)).toBeNull()
    expect(year(3000)).toBeNull()
    expect(year(0)).toBeNull()
    expect(year(2021.5)).toBeNull()
    expect(year(Number.NaN)).toBeNull()
    expect(year(undefined)).toBeNull()
  })

  it('numeri di traccia e disco: solo interi positivi', () => {
    const t = tagsToTrack(tags({ track: { no: 0, of: -3 }, disk: { no: 2.5 } }), info(), labels)
    expect(t.trackNo).toBeNull()
    expect(t.trackOf).toBeNull()
    expect(t.discNo).toBeNull()
    const u = tagsToTrack(tags({ track: { no: 7, of: 10 }, disk: { no: 2 } }), info(), labels)
    expect(u.trackNo).toBe(7)
    expect(u.trackOf).toBe(10)
    expect(u.discNo).toBe(2)
    const v = tagsToTrack({ ...noTags, track: { no: Number.NaN, of: null }, disk: { no: null } }, info(), labels)
    expect(v.trackNo).toBeNull()
  })

  it('durata: solo numeri finiti positivi, altrimenti 0', () => {
    const dur = (d: number | undefined) => tagsToTrack(tags({ duration: d }), info(), labels).duration
    expect(dur(123.4)).toBe(123.4)
    expect(dur(0)).toBe(0)
    expect(dur(-1)).toBe(0)
    expect(dur(Number.POSITIVE_INFINITY)).toBe(0)
    expect(dur(Number.NaN)).toBe(0)
    expect(dur(undefined)).toBe(0)
  })

  it('genere e compositore: il primo non vuoto, altrimenti stringa vuota', () => {
    const t = tagsToTrack(tags({ genre: ['', '  ', 'Rock', 'Pop'], composer: [] }), info(), labels)
    expect(t.genre).toBe('Rock')
    expect(t.composer).toBe('')
  })

  it('podcast e audiolibri dal genere o dall’estensione m4b', () => {
    expect(tagsToTrack(tags({ genre: ['Podcast'] }), info(), labels).kind).toBe('podcast')
    expect(tagsToTrack(tags({ genre: ['Tech podcasts'] }), info(), labels).kind).toBe('podcast')
    expect(tagsToTrack(tags({ genre: ['Audiobook'] }), info(), labels).kind).toBe('audiobook')
    expect(tagsToTrack(tags({ genre: ['Audiolibro'] }), info(), labels).kind).toBe('audiobook')
    expect(tagsToTrack(noTags, info({ name: 'libro.M4B' }), labels).kind).toBe('audiobook')
    expect(tagsToTrack(tags({ genre: ['Pop'] }), info({ name: 'x.m4a' }), labels).kind).toBe('music')
    // il podcast vince sull’estensione
    expect(tagsToTrack(tags({ genre: ['Podcast'] }), info({ name: 'ep.m4b' }), labels).kind).toBe('podcast')
    expect(kindOf('', 'mp3')).toBe('music')
  })

  it('MIME: quello del browser, altrimenti indovinato dall’estensione', () => {
    const mime = (name: string, type = '') => tagsToTrack(noTags, info({ name, type }), labels).mime
    expect(mime('a.mp3')).toBe('audio/mpeg')
    expect(mime('a.m4a')).toBe('audio/mp4')
    expect(mime('a.m4b')).toBe('audio/mp4')
    expect(mime('a.alac')).toBe('audio/mp4')
    expect(mime('a.mp4')).toBe('audio/mp4')
    expect(mime('a.aac')).toBe('audio/aac')
    expect(mime('a.FLAC')).toBe('audio/flac')
    expect(mime('a.wav')).toBe('audio/wav')
    expect(mime('a.aif')).toBe('audio/aiff')
    expect(mime('a.aiff')).toBe('audio/aiff')
    expect(mime('a.ogg')).toBe('audio/ogg')
    expect(mime('a.oga')).toBe('audio/ogg')
    expect(mime('a.opus')).toBe('audio/ogg')
    expect(mime('a.xyz')).toBe('')
    expect(mime('a.mp3', 'audio/x-mpeg')).toBe('audio/x-mpeg')
    expect(guessMime('senza')).toBe('')
  })

  it('impronta: percorso relativo se c’è, altrimenti il nome', () => {
    expect(fingerprintOf({ name: 'a.mp3', path: '', size: 1, lastModified: 2 })).toBe('a.mp3|1|2')
    expect(fingerprintOf({ name: 'a.mp3', path: 'Cartella/a.mp3', size: 1, lastModified: 2 })).toBe('Cartella/a.mp3|1|2')
  })

  it('id: uuid diversi a ogni chiamata, addedAt attuale', () => {
    const before = Date.now()
    const a = tagsToTrack(noTags, info(), labels)
    const b = tagsToTrack(noTags, info(), labels)
    expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(a.id).not.toBe(b.id)
    expect(a.addedAt).toBeGreaterThanOrEqual(before)
    expect(newId()).not.toBe(newId())
  })
})

describe('extensionOf / baseName', () => {
  it('gestisce i casi limite', () => {
    expect(extensionOf('a.MP3')).toBe('mp3')
    expect(extensionOf('a')).toBe('')
    expect(extensionOf('.nascosto')).toBe('')
    expect(extensionOf('nome.')).toBe('')
    expect(baseName('nome.')).toBe('nome.')
  })
})

describe('isAudioFile', () => {
  const file = (name: string, type = '') => new File([], name, { type })
  it('accetta per MIME audio/* o per estensione nota (anche maiuscola)', () => {
    expect(isAudioFile(file('brano.mp3'))).toBe(true)
    expect(isAudioFile(file('brano.FLAC'))).toBe(true)
    expect(isAudioFile(file('brano.m4b'))).toBe(true)
    expect(isAudioFile(file('brano.opus'))).toBe(true)
    expect(isAudioFile(file('strano.bin', 'audio/mpeg'))).toBe(true)
    expect(isAudioFile(file('video.mp4', 'video/mp4'))).toBe(true)
    expect(isAudioFile(file('brano.m4a', 'audio/x-m4a'))).toBe(true)
  })
  it('rifiuta immagini, testo, file senza estensione e wma anche se dichiarato audio', () => {
    expect(isAudioFile(file('cover.jpg', 'image/jpeg'))).toBe(false)
    expect(isAudioFile(file('note.txt', 'text/plain'))).toBe(false)
    expect(isAudioFile(file('senza'))).toBe(false)
    expect(isAudioFile(file('brano.wma', 'audio/x-ms-wma'))).toBe(false)
    expect(isAudioFile(file('.mp3'))).toBe(false)
  })
  it('AUDIO_EXTENSIONS elenca i formati principali', () => {
    for (const ext of ['mp3', 'm4a', 'm4b', 'aac', 'mp4', 'flac', 'wav', 'aif', 'aiff', 'ogg', 'oga', 'opus']) {
      expect(AUDIO_EXTENSIONS).toContain(ext)
    }
    expect(AUDIO_EXTENSIONS).not.toContain('wma')
  })
})

describe('setFilePath / getFilePath', () => {
  it('annota e rilegge il percorso; senza annotazione è vuoto', () => {
    const f = new File([], 'a.mp3')
    expect(getFilePath(f)).toBe('')
    setFilePath(f, 'Musica/a.mp3')
    expect(getFilePath(f)).toBe('Musica/a.mp3')
    expect(getFilePath(new File([], 'b.mp3'))).toBe('')
  })
})

describe('pickPicture', () => {
  const meta = (pictures: Array<{ format: string; data: Uint8Array; type?: string }>) =>
    ({ common: { picture: pictures }, format: {} }) as unknown as IAudioMetadata
  it('preferisce la copertina frontale, altrimenti la prima; copia i byte', () => {
    const back = new Uint8Array([1, 2])
    const front = new Uint8Array([3, 4, 5])
    const p = pickPicture(meta([{ format: 'image/png', data: back, type: 'Back cover' }, { format: 'image/jpeg', data: front, type: 'Cover (front)' }]))
    expect(p?.mime).toBe('image/jpeg')
    expect(Array.from(new Uint8Array(p!.data))).toEqual([3, 4, 5])
    expect(p!.data).not.toBe(front.buffer)
    const q = pickPicture(meta([{ format: 'image/png', data: back }, { format: 'image/jpeg', data: front }]))
    expect(Array.from(new Uint8Array(q!.data))).toEqual([1, 2])
  })
  it('null senza immagini o con dati vuoti', () => {
    expect(pickPicture(meta([]))).toBeNull()
    expect(pickPicture(({ common: {}, format: {} }) as unknown as IAudioMetadata)).toBeNull()
    expect(pickPicture(meta([{ format: 'image/png', data: new Uint8Array(0) }]))).toBeNull()
  })
})

describe('catena completa: WAV con tag → music-metadata → Track', () => {
  const sine = (n: number) => Float32Array.from({ length: n }, (_, i) => Math.sin(i / 10) * 0.5)
  it('legge tag e copertina con le stesse opzioni del worker', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    const bytes = encodeWav([sine(8000), sine(8000)], 8000, {
      title: 'Città vuota',
      artist: 'Mina',
      album: 'Studio Uno',
      year: 1963,
      trackNo: 2,
      trackOf: 12,
      discNo: 1,
      genre: 'Pop',
      composer: 'Doc Pomus',
      picture: { mime: 'image/png', data: png },
    })
    const meta = await parseBuffer(bytes, { mimeType: 'audio/wav' }, { skipPostHeaders: true, duration: false })
    const parsed = toParsedTags(meta)
    const picture = pickPicture(meta)
    const t = tagsToTrack(parsed, info({ name: '02 Città vuota.wav', path: 'Mina/Studio Uno/02 Città vuota.wav', size: bytes.length }), labels)
    expect(t).toMatchObject({
      title: 'Città vuota',
      artist: 'Mina',
      albumArtist: 'Mina',
      album: 'Studio Uno',
      albumId: groupKey('Mina', 'Studio Uno'),
      year: 1963,
      trackNo: 2,
      trackOf: 12,
      discNo: 1,
      genre: 'Pop',
      composer: 'Doc Pomus',
      mime: 'audio/wav',
      kind: 'music',
    })
    expect(t.duration).toBeCloseTo(1, 3)
    expect(picture?.mime).toBe('image/png')
    expect(Array.from(new Uint8Array(picture!.data))).toEqual(Array.from(png))
  })
  it('senza tag: ripieghi su nome file ed etichette', async () => {
    const bytes = encodeWav([sine(100)], 44100)
    const meta = await parseBuffer(bytes, { mimeType: 'audio/wav' }, { skipPostHeaders: true, duration: false })
    const t = tagsToTrack(toParsedTags(meta), info({ name: '03 - Senza tag.wav' }), labels)
    expect(t.title).toBe('03 - Senza tag')
    expect(t.artist).toBe(labels.artist)
    expect(t.album).toBe(labels.album)
    expect(pickPicture(meta)).toBeNull()
  })
})
