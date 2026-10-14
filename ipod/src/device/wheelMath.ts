/**
 * Matematica della ghiera: dall'angolo del dito agli "scatti" (detent), con accelerazione
 * per le liste lunghe. Funzioni pure, testate in vitest.
 */

/** Gradi di rotazione per ogni scatto della ghiera (l'iPod originale ne ha circa 24 per giro). */
export const DEGREES_PER_DETENT = 15

/** Angolo (gradi, 0 = ore 12, in senso orario) di un punto rispetto al centro. */
export function angleOf(cx: number, cy: number, x: number, y: number): number {
  const deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90
  return ((deg % 360) + 360) % 360
}

/** Differenza angolare più breve tra due angoli (−180, 180]. */
export function deltaAngle(from: number, to: number): number {
  let d = to - from
  while (d > 180) d -= 360
  while (d <= -180) d += 360
  return d
}

/** Distanza dal centro, normalizzata sul raggio esterno della ghiera (1 = bordo). */
export function normalizedRadius(cx: number, cy: number, x: number, y: number, outerRadius: number): number {
  return Math.hypot(x - cx, y - cy) / outerRadius
}

/**
 * Accumulatore di rotazione: somma i gradi e restituisce gli scatti interi maturati,
 * conservando il resto (così un movimento lento e continuo scatta comunque).
 */
export class DetentAccumulator {
  private remainder = 0
  constructor(private readonly degreesPerDetent = DEGREES_PER_DETENT) {}
  add(deltaDegrees: number): number {
    this.remainder += deltaDegrees
    const steps = Math.trunc(this.remainder / this.degreesPerDetent)
    this.remainder -= steps * this.degreesPerDetent
    return steps
  }
  reset(): void {
    this.remainder = 0
  }
}

/**
 * Accelerazione nelle liste lunghe: con rotazione veloce ogni scatto avanza di più righe.
 * `velocity` in scatti/secondo, `length` righe della lista. Restituisce le righe per scatto.
 * Per liste corte (≤ 20 righe) non c'è mai accelerazione, come sull'iPod.
 */
export function rowsPerDetent(velocity: number, length: number): number {
  const v = Math.abs(velocity)
  if (length <= 20) return 1
  if (v < 8) return 1
  if (v < 14) return 2
  if (v < 22) return Math.min(4, Math.max(1, Math.round(length / 60)) + 2)
  return Math.min(10, Math.max(3, Math.round(length / 25)))
}

/** Misuratore di velocità angolare: media mobile degli ultimi scatti (scatti/secondo). */
export class VelocityMeter {
  private samples: Array<{ t: number; steps: number }> = []
  constructor(private readonly windowMs = 250) {}
  push(t: number, steps: number): number {
    this.samples.push({ t, steps: Math.abs(steps) })
    this.samples = this.samples.filter((s) => t - s.t <= this.windowMs)
    return this.value(t)
  }
  value(t: number): number {
    this.samples = this.samples.filter((s) => t - s.t <= this.windowMs)
    if (this.samples.length < 2) return 0
    const total = this.samples.reduce((a, s) => a + s.steps, 0)
    const span = Math.max(this.windowMs / 2, t - this.samples[0]!.t)
    return (total * 1000) / span
  }
  reset(): void {
    this.samples = []
  }
}

/**
 * Nuova posizione di selezione in una lista dopo `steps` scatti, senza mai uscire dai limiti
 * (l'iPod non "gira" dall'ultimo al primo elemento).
 */
export function moveSelection(index: number, steps: number, length: number): number {
  if (length <= 0) return 0
  return Math.min(length - 1, Math.max(0, index + steps))
}

/**
 * Finestra visibile di una lista: l'evidenziazione si muove dentro la finestra e la lista
 * scorre solo quando la selezione raggiunge il bordo (comportamento dell'iPod).
 */
export function scrollWindow(firstVisible: number, selected: number, visibleRows: number, length: number): number {
  let first = firstVisible
  if (selected < first) first = selected
  if (selected >= first + visibleRows) first = selected - visibleRows + 1
  first = Math.max(0, Math.min(first, Math.max(0, length - visibleRows)))
  return first
}

/** Normalizza il delta della rotella del mouse/trackpad in "gradi" equivalenti di ghiera. */
export function wheelDeltaToDegrees(deltaY: number, deltaMode: number): number {
  // deltaMode: 0 = pixel, 1 = righe, 2 = pagine
  // Mouse con rotella a scatti: Chrome manda ±100/±120 px per scatto → esattamente uno scatto della ghiera.
  if (deltaMode === 0 && Math.abs(deltaY) >= 50) return Math.sign(deltaY) * DEGREES_PER_DETENT
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY
  // ~40px di scroll = uno scatto (15°)
  return (px / 40) * DEGREES_PER_DETENT
}
