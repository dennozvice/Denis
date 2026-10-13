/**
 * Smistamento degli input della ghiera: prima le regole di sistema (Hold, sospensione, clicker),
 * poi il gestore della schermata in cima alla pila, infine i comportamenti predefiniti
 * (play/pausa, brano precedente/successivo, MENU indietro).
 */
import { player, playerStore } from '../audio/player'
import { tick } from '../audio/clicker'
import type { InputEvent } from './input'
import { nav, type Screen, type ScreenKind } from './navigation'
import { settingsStore } from './settings'
import { system, systemStore } from './system'

/** Gestore di una schermata: restituisce true se ha consumato l'evento. */
export type ScreenInputHandler = (event: InputEvent, screen: Screen) => boolean | void

const handlers = new Map<ScreenKind, ScreenInputHandler>()

export function registerScreenInput(kind: ScreenKind, handler: ScreenInputHandler): void {
  handlers.set(kind, handler)
}

/** Avanzamento veloce tenendo premuto prev/next: parte lento e accelera. */
export function seekStepFor(elapsedMs: number): number {
  if (elapsedMs < 1500) return 2
  if (elapsedMs < 4000) return 5
  if (elapsedMs < 8000) return 15
  return 40
}

let seeking = false

function defaultHandler(e: InputEvent): void {
  const st = playerStore.get()
  switch (e.type) {
    case 'press':
      if (e.button === 'play') {
        if (st.trackId) void player.toggle()
      } else if (e.button === 'next') {
        if (st.trackId && !seeking) void player.next()
      } else if (e.button === 'prev') {
        if (st.trackId && !seeking) void player.previous()
      } else if (e.button === 'menu') {
        nav.pop()
      }
      break
    case 'hold':
      if (e.button === 'menu') nav.home()
      else if (e.button === 'play') system.sleep()
      else if ((e.button === 'next' || e.button === 'prev') && st.trackId) {
        seeking = true
        player.seekBy(e.button === 'next' ? seekStepFor(e.elapsed) : -seekStepFor(e.elapsed))
      }
      break
    case 'release':
      if (e.button === 'next' || e.button === 'prev') {
        // il "press" arriva prima del "release": liberiamo il blocco dopo
        queueMicrotask(() => {
          seeking = false
        })
      }
      break
    default:
      break
  }
}

export function dispatch(e: InputEvent): void {
  const sys = systemStore.get()
  if (e.type === 'holdSwitch') {
    system.setHold(e.locked)
    return
  }
  if (sys.hold) {
    if (e.type === 'press' || e.type === 'hold') {
      if (sys.asleep) system.wake()
      system.flashHold()
    }
    return
  }
  if (!sys.booted) return
  if (sys.asleep) {
    if (e.type === 'press' || e.type === 'hold') system.wake()
    return
  }
  const wasDark = !sys.backlight
  system.touch()
  // Con lo schermo spento il primo tocco lo riaccende soltanto (come sull'iPod).
  if (wasDark && e.type !== 'release') return
  const screen = nav.top()
  const handled = handlers.get(screen.kind)?.(e, screen) === true
  if (!handled) defaultHandler(e)
  // Il clicker suona a ogni tasto e a ogni scatto che muove davvero qualcosa (non a fine lista).
  if (settingsStore.get().clicker && (e.type === 'press' || (e.type === 'rotate' && handled))) {
    tick(e.type === 'rotate' ? Math.max(0.4, 1 - Math.abs(e.velocity) / 60) : 1)
  }
}
