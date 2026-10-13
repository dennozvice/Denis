/**
 * Copertine: decodifica l'immagine trovata nei tag e la riduce a due JPEG (≤600 px e miniatura
 * ≤160 px) da salvare in IndexedDB. Usa OffscreenCanvas quando c'è (funziona anche in un worker),
 * altrimenti <img> + canvas normale. Non lancia mai: su qualunque problema restituisce null.
 */
import type { Artwork } from './types'

export const ARTWORK_MAX = 600
export const THUMB_MAX = 160

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
type Context2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

/** OffscreenCanvas senza convertToBlob (vecchi Safari) non serve a niente: si va di canvas normale. */
function hasOffscreenCanvas(): boolean {
  return typeof OffscreenCanvas !== 'undefined' && typeof OffscreenCanvas.prototype.convertToBlob === 'function'
}

function hasDocument(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function'
}

function decodeWithImage(input: Blob): Promise<Decoded | null> {
  if (!hasDocument() || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return Promise.resolve(null)
  const url = URL.createObjectURL(input)
  return new Promise<Decoded | null>((resolve) => {
    const img = document.createElement('img')
    img.onload = () => {
      const width = img.naturalWidth
      const height = img.naturalHeight
      if (!(width > 0 && height > 0)) {
        URL.revokeObjectURL(url)
        resolve(null)
        return
      }
      resolve({ source: img, width, height, release: () => URL.revokeObjectURL(url) })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

async function decode(input: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(input)
      if (bitmap.width > 0 && bitmap.height > 0) {
        return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
      }
      bitmap.close()
    } catch {
      // formato non gradito a createImageBitmap: si prova con <img>, che è più tollerante
    }
  }
  return decodeWithImage(input)
}

/** Dimensioni con il lato lungo ≤ max, proporzioni intatte (mai ingrandito). */
function fit(width: number, height: number, max: number): [number, number] {
  const scale = Math.min(1, max / Math.max(width, height))
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]
}

function makeCanvas(width: number, height: number): AnyCanvas | null {
  if (hasOffscreenCanvas()) return new OffscreenCanvas(width, height)
  if (!hasDocument()) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function context2d(canvas: AnyCanvas): Context2D | null {
  return 'convertToBlob' in canvas ? canvas.getContext('2d') : canvas.getContext('2d')
}

function draw(source: CanvasImageSource, width: number, height: number): AnyCanvas | null {
  const canvas = makeCanvas(width, height)
  if (!canvas) return null
  const ctx = context2d(canvas)
  if (!ctx) return null
  // Il JPEG non ha trasparenza: sfondo bianco, così i PNG con alfa non diventano neri.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  return canvas
}

function encode(canvas: AnyCanvas, quality: number): Promise<Blob | null> {
  try {
    if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality }).catch(() => null)
    return new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
      } catch {
        resolve(null)
      }
    })
  } catch {
    return Promise.resolve(null)
  }
}

/**
 * Produce la copertina di un album: `blob` (JPEG 0.85, lato lungo ≤ 600 px) e `thumb`
 * (JPEG 0.8, ≤ 160 px). `width`/`height` sono quelle di `blob`. null se l'immagine non si decodifica
 * o il browser non sa codificarla.
 */
export async function processArtwork(input: Blob, albumId: string): Promise<Artwork | null> {
  const decoded = await decode(input)
  if (!decoded) return null
  try {
    const [width, height] = fit(decoded.width, decoded.height, ARTWORK_MAX)
    const [thumbWidth, thumbHeight] = fit(decoded.width, decoded.height, THUMB_MAX)
    const big = draw(decoded.source, width, height)
    if (!big) return null
    // La miniatura si ricava dalla versione ridotta: un salto di scala più piccolo rende meglio.
    const small = draw(big, thumbWidth, thumbHeight)
    if (!small) return null
    const blob = await encode(big, 0.85)
    const thumb = await encode(small, 0.8)
    if (!blob || !thumb) return null
    return { id: albumId, blob, thumb, width, height }
  } catch {
    return null
  } finally {
    decoded.release()
  }
}
