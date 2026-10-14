/**
 * Logica "senza grafica" della ghiera: trasforma i pointer event sull'anello e sul tasto
 * centrale in eventi di input (rotazione a scatti, pressioni, pressioni prolungate).
 * - rotazione: angolo attorno al centro, scatti ogni DEGREES_PER_DETENT gradi, velocità misurata;
 * - pressione: giù e su senza spostamento (zona = quadrante dell'anello o centro);
 * - pressione prolungata: MENU/centro dopo 600 ms, Play dopo 2 s (sospensione),
 *   prev/next ripetuta ogni 100 ms a partire da 500 ms (avanzamento veloce).
 */
import { useEffect, type RefObject } from 'react'
import type { InputEvent, WheelButton } from '../core/input'
import { DetentAccumulator, VelocityMeter, angleOf, deltaAngle, normalizedRadius } from './wheelMath'

export interface ClickWheelOptions {
  /** Raggio del tasto centrale rispetto al raggio esterno (0–1). */
  centerRatio: number
  onInput: (e: InputEvent) => void
  /** Chiamata al primo contatto (per sbloccare l'audio). */
  onPointerDown?: () => void
  onZoneChange?: (zone: WheelButton | 'ring' | null) => void
}

const HOLD_DELAY: Record<WheelButton, number> = { menu: 600, center: 600, play: 2000, prev: 500, next: 500 }
const HOLD_REPEAT_MS = 100
/** Movimento oltre cui un tocco diventa uno scorrimento (gradi) e (pixel). */
const MOVE_DEG = 6
const MOVE_PX = 10

export function zoneForAngle(angle: number): WheelButton {
  if (angle >= 315 || angle < 45) return 'menu'
  if (angle < 135) return 'next'
  if (angle < 225) return 'play'
  return 'prev'
}

export function useClickWheel(ref: RefObject<HTMLElement | null>, opts: ClickWheelOptions): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const { centerRatio, onInput, onPointerDown, onZoneChange } = opts
    const acc = new DetentAccumulator()
    const meter = new VelocityMeter()
    let pointerId: number | null = null
    let startX = 0
    let startY = 0
    let lastAngle = 0
    let zone: WheelButton | 'ring' | null = null
    let scrolling = false
    let held = false
    let holdTimer: ReturnType<typeof setTimeout> | null = null
    let repeatTimer: ReturnType<typeof setInterval> | null = null
    let downAt = 0
    let button: WheelButton | null = null

    const geometry = () => {
      const r = el.getBoundingClientRect()
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, radius: Math.min(r.width, r.height) / 2 }
    }
    const clearHold = () => {
      if (holdTimer) clearTimeout(holdTimer)
      if (repeatTimer) clearInterval(repeatTimer)
      holdTimer = null
      repeatTimer = null
    }
    const armHold = (b: WheelButton) => {
      clearHold()
      holdTimer = setTimeout(() => {
        held = true
        onInput({ type: 'hold', button: b, elapsed: HOLD_DELAY[b] })
        if (b === 'prev' || b === 'next') {
          repeatTimer = setInterval(() => {
            onInput({ type: 'hold', button: b, elapsed: performance.now() - downAt })
          }, HOLD_REPEAT_MS)
        }
      }, HOLD_DELAY[b])
    }

    const onDown = (ev: PointerEvent) => {
      if (pointerId !== null) return // un dito alla volta
      if (ev.button !== 0 && ev.pointerType === 'mouse') return
      const g = geometry()
      const nr = normalizedRadius(g.cx, g.cy, ev.clientX, ev.clientY, g.radius)
      if (nr > 1.04) return
      ev.preventDefault()
      pointerId = ev.pointerId
      try {
        el.setPointerCapture(ev.pointerId)
      } catch {
        /* non supportato */
      }
      onPointerDown?.()
      startX = ev.clientX
      startY = ev.clientY
      downAt = performance.now()
      scrolling = false
      held = false
      acc.reset()
      meter.reset()
      lastAngle = angleOf(g.cx, g.cy, ev.clientX, ev.clientY)
      if (nr <= centerRatio) {
        zone = 'center'
        button = 'center'
      } else {
        button = zoneForAngle(lastAngle)
        zone = button
      }
      onZoneChange?.(zone)
      armHold(button)
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      ev.preventDefault()
      if (zone === 'center' && !scrolling) return // il tasto centrale non scorre
      const g = geometry()
      const angle = angleOf(g.cx, g.cy, ev.clientX, ev.clientY)
      // Sul tasto centrale non si scorre: passando sopra il centro l'angolo salterebbe di ~180°.
      if (normalizedRadius(g.cx, g.cy, ev.clientX, ev.clientY, g.radius) < centerRatio) {
        lastAngle = angle
        return
      }
      const d = deltaAngle(lastAngle, angle)
      if (Math.abs(d) > 90) {
        lastAngle = angle
        return
      }
      const moved = Math.hypot(ev.clientX - startX, ev.clientY - startY)
      if (!scrolling) {
        const totalDeg = Math.abs(deltaAngle(angleOf(g.cx, g.cy, startX, startY), angle))
        if (totalDeg < MOVE_DEG && moved < MOVE_PX) return
        scrolling = true
        clearHold()
        zone = 'ring'
        onZoneChange?.('ring')
      }
      lastAngle = angle
      const steps = acc.add(d)
      if (steps !== 0) {
        const velocity = meter.push(performance.now(), steps)
        onInput({ type: 'rotate', steps, velocity: steps < 0 ? -velocity : velocity })
      }
    }

    const finish = (ev: PointerEvent, cancelled: boolean) => {
      if (ev.pointerId !== pointerId) return
      pointerId = null
      try {
        el.releasePointerCapture(ev.pointerId)
      } catch {
        /* ignorato */
      }
      clearHold()
      const b = button
      button = null
      zone = null
      onZoneChange?.(null)
      if (!b) return
      if (!cancelled && !scrolling && !held) onInput({ type: 'press', button: b })
      onInput({ type: 'release', button: b, held })
      scrolling = false
      held = false
    }
    const onUp = (ev: PointerEvent) => finish(ev, false)
    const onCancel = (ev: PointerEvent) => finish(ev, true)
    const onContext = (ev: Event) => ev.preventDefault()

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    el.addEventListener('lostpointercapture', onCancel)
    el.addEventListener('contextmenu', onContext)
    return () => {
      clearHold()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      el.removeEventListener('lostpointercapture', onCancel)
      el.removeEventListener('contextmenu', onContext)
    }
    // Le opzioni sono stabili per tutta la vita del componente (passate da un ref o memo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref])
}
