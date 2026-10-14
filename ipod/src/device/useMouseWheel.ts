/** Rotella del mouse / due dita sul trackpad sopra l'iPod = rotazione della ghiera. */
import { useEffect, type RefObject } from 'react'
import type { InputEvent } from '../core/input'
import { DetentAccumulator, VelocityMeter, wheelDeltaToDegrees } from './wheelMath'

export function useMouseWheel(ref: RefObject<HTMLElement | null>, onInput: (e: InputEvent) => void, onGesture: () => void): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const acc = new DetentAccumulator()
    const meter = new VelocityMeter(300)
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const delta = Math.abs(ev.deltaY) >= Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX
      const steps = acc.add(wheelDeltaToDegrees(delta, ev.deltaMode))
      if (steps === 0) return
      onGesture()
      // L'inerzia del trackpad produce velocità fantasma: l'accelerazione resta al massimo al 2° livello.
      const v = Math.min(12, meter.push(performance.now(), steps))
      onInput({ type: 'rotate', steps, velocity: steps < 0 ? -v : v })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, onInput, onGesture])
}
