/**
 * Tastiera come ghiera: frecce su/giù = rotazione, Invio = centro, Esc/Backspace = MENU,
 * Spazio = Play/Pausa, frecce sinistra/destra = brano precedente/successivo (tenute premute = avanzamento).
 * H = interruttore Hold. I tasti tenuti premuti generano "hold" come sulla ghiera.
 */
import { useEffect } from 'react'
import type { InputEvent, WheelButton } from '../core/input'

const KEY_TO_BUTTON: Record<string, WheelButton> = {
  Enter: 'center',
  Escape: 'menu',
  Backspace: 'menu',
  ' ': 'play',
  p: 'play',
  P: 'play',
  ArrowLeft: 'prev',
  ArrowRight: 'next',
  MediaPlayPause: 'play',
  MediaTrackPrevious: 'prev',
  MediaTrackNext: 'next',
}
const HOLD_DELAY: Record<WheelButton, number> = { menu: 600, center: 600, play: 2000, prev: 500, next: 500 }

export function useKeyboard(onInput: (e: InputEvent) => void, onGesture: () => void, onHoldSwitch: (locked: boolean) => void): void {
  useEffect(() => {
    const down = new Map<WheelButton, { at: number; held: boolean; timer: ReturnType<typeof setTimeout> | null; repeat: ReturnType<typeof setInterval> | null }>()
    let holdLocked = false
    let rotateVelocity = 0
    let lastRotate = 0

    // Campi di testo e pulsanti della pagina tengono i loro tasti (Invio/Spazio attivano il pulsante, non la ghiera).
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'A' || t.isContentEditable)

    const onKeyDown = (ev: KeyboardEvent) => {
      if (isTyping(ev.target) || ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault()
        onGesture()
        const now = performance.now()
        // tasto tenuto premuto: la velocità cresce come una rotazione continua
        rotateVelocity = now - lastRotate < 120 ? Math.min(40, rotateVelocity + 2.5) : 4
        lastRotate = now
        const steps = ev.key === 'ArrowDown' ? 1 : -1
        onInput({ type: 'rotate', steps, velocity: steps * rotateVelocity })
        return
      }
      if (ev.key === 'h' || ev.key === 'H') {
        if (ev.repeat) return
        holdLocked = !holdLocked
        onHoldSwitch(holdLocked)
        return
      }
      const b = KEY_TO_BUTTON[ev.key]
      if (!b) return
      ev.preventDefault()
      if (ev.repeat || down.has(b)) return
      onGesture()
      const entry = { at: performance.now(), held: false, timer: null as ReturnType<typeof setTimeout> | null, repeat: null as ReturnType<typeof setInterval> | null }
      entry.timer = setTimeout(() => {
        entry.held = true
        onInput({ type: 'hold', button: b, elapsed: HOLD_DELAY[b] })
        if (b === 'prev' || b === 'next') {
          entry.repeat = setInterval(() => onInput({ type: 'hold', button: b, elapsed: performance.now() - entry.at }), 100)
        }
      }, HOLD_DELAY[b])
      down.set(b, entry)
    }
    const release = (b: WheelButton, cancelled: boolean) => {
      const entry = down.get(b)
      if (!entry) return
      down.delete(b)
      if (entry.timer) clearTimeout(entry.timer)
      if (entry.repeat) clearInterval(entry.repeat)
      if (!cancelled && !entry.held) onInput({ type: 'press', button: b })
      onInput({ type: 'release', button: b, held: entry.held })
    }
    const onKeyUp = (ev: KeyboardEvent) => {
      const b = KEY_TO_BUTTON[ev.key]
      if (b) release(b, false)
    }
    const onBlur = () => {
      for (const b of [...down.keys()]) release(b, true)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      onBlur()
    }
  }, [onInput, onGesture, onHoldSwitch])
}
