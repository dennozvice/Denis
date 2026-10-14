/**
 * Scrittura di file WAV (PCM 16 bit) con tag ID3v2.3 incorporati nel chunk "id3 ".
 * Serve per i brani dimostrativi generati nel browser, che passano poi dallo stesso
 * percorso di importazione dei file veri (music-metadata legge il chunk id3 dei WAV).
 * Codice puro: funziona anche in node (test).
 */

export interface Id3Tags {
  title: string
  artist: string
  album: string
  albumArtist?: string
  year?: number
  trackNo?: number
  trackOf?: number
  discNo?: number
  genre?: string
  composer?: string
  /** Copertina (JPEG o PNG). */
  picture?: { mime: string; data: Uint8Array }
}

const enc = new TextEncoder()

function frame(id: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(10 + payload.length)
  out.set(enc.encode(id), 0)
  const n = payload.length
  out[4] = (n >>> 24) & 0xff
  out[5] = (n >>> 16) & 0xff
  out[6] = (n >>> 8) & 0xff
  out[7] = n & 0xff
  out[8] = 0
  out[9] = 0
  out.set(payload, 10)
  return out
}

/** Frame di testo in UTF-16 con BOM (encoding 1), così gli accenti sono sicuri. */
function textFrame(id: string, text: string): Uint8Array {
  const chars = text + '\0'
  const payload = new Uint8Array(1 + 2 + chars.length * 2)
  payload[0] = 1
  payload[1] = 0xff
  payload[2] = 0xfe
  for (let i = 0; i < chars.length; i++) {
    const c = chars.charCodeAt(i)
    payload[3 + i * 2] = c & 0xff
    payload[4 + i * 2] = c >> 8
  }
  return frame(id, payload)
}

function pictureFrame(mime: string, data: Uint8Array): Uint8Array {
  const mimeBytes = enc.encode(mime)
  const payload = new Uint8Array(1 + mimeBytes.length + 1 + 1 + 1 + data.length)
  let o = 0
  payload[o++] = 0 // ISO-8859-1 per il mime/descrizione
  payload.set(mimeBytes, o)
  o += mimeBytes.length
  payload[o++] = 0
  payload[o++] = 3 // tipo: copertina (fronte)
  payload[o++] = 0 // descrizione vuota
  payload.set(data, o)
  return frame('APIC', payload)
}

function syncsafe(n: number): [number, number, number, number] {
  return [(n >>> 21) & 0x7f, (n >>> 14) & 0x7f, (n >>> 7) & 0x7f, n & 0x7f]
}

/** Tag ID3v2.3 completo (header + frame). */
export function encodeId3(tags: Id3Tags): Uint8Array {
  const frames: Uint8Array[] = [textFrame('TIT2', tags.title), textFrame('TPE1', tags.artist), textFrame('TALB', tags.album)]
  if (tags.albumArtist) frames.push(textFrame('TPE2', tags.albumArtist))
  if (tags.year) frames.push(textFrame('TYER', String(tags.year)))
  if (tags.trackNo) frames.push(textFrame('TRCK', tags.trackOf ? `${tags.trackNo}/${tags.trackOf}` : String(tags.trackNo)))
  if (tags.discNo) frames.push(textFrame('TPOS', String(tags.discNo)))
  if (tags.genre) frames.push(textFrame('TCON', tags.genre))
  if (tags.composer) frames.push(textFrame('TCOM', tags.composer))
  if (tags.picture) frames.push(pictureFrame(tags.picture.mime, tags.picture.data))
  const size = frames.reduce((a, f) => a + f.length, 0)
  const out = new Uint8Array(10 + size)
  out.set(enc.encode('ID3'), 0)
  out[3] = 3
  out[4] = 0
  out[5] = 0
  out.set(syncsafe(size), 6)
  let o = 10
  for (const f of frames) {
    out.set(f, o)
    o += f.length
  }
  return out
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

/**
 * Crea un file WAV PCM 16 bit a partire da campioni float (−1..1) per canale.
 * Il chunk "id3 " è messo in fondo, dopo i dati, come fanno iTunes e altri lettori.
 */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number, tags?: Id3Tags): Uint8Array {
  const numChannels = channels.length
  const frames = channels[0]?.length ?? 0
  const dataSize = frames * numChannels * 2
  const id3 = tags ? encodeId3(tags) : null
  const id3Chunk = id3 ? 8 + id3.length + (id3.length % 2) : 0
  const total = 44 + dataSize + id3Chunk
  const buf = new ArrayBuffer(total)
  const view = new DataView(buf)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, total - 8, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  view.setUint16(32, numChannels * 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)
  let o = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]![i] ?? 0))
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      o += 2
    }
  }
  if (id3) {
    writeAscii(view, o, 'id3 ')
    view.setUint32(o + 4, id3.length, true)
    new Uint8Array(buf, o + 8, id3.length).set(id3)
  }
  return new Uint8Array(buf)
}
