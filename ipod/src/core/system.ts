/**
 * Stato "di sistema" dell'iPod: retroilluminazione, sospensione, interruttore Hold,
 * accensione. I timer partono da ogni input e dipendono dalle impostazioni.
 */
import { createStore, useStore } from './store'
import { settingsStore } from './settings'

export interface SystemState {
  /** Schermo acceso (retroilluminazione). Quando è false lo schermo resta leggibile ma scuro. */
  backlight: boolean
  /** Dispositivo in sospensione: schermo nero, serve un tasto per svegliarlo. */
  asleep: boolean
  /** Interruttore Hold inserito: i comandi sono ignorati e compare il lucchetto. */
  hold: boolean
  /** Sequenza di accensione terminata. */
  booted: boolean
  /** Lampeggio del lucchetto quando si preme un tasto con Hold inserito. */
  holdFlashUntil: number
  /** Caricamento (collegato all'alimentazione): la batteria mostra il fulmine. */
  charging: boolean
}

export const systemStore = createStore<SystemState>({
  backlight: true,
  asleep: false,
  hold: false,
  booted: false,
  holdFlashUntil: 0,
  charging: false,
})

/** Minuti di inattività (in pausa o fermo) dopo cui l'iPod si spegne da solo. */
export const SLEEP_AFTER_MS = 2 * 60 * 1000

let backlightTimer: ReturnType<typeof setTimeout> | null = null
let sleepTimer: ReturnType<typeof setTimeout> | null = null
let isPlaying = () => false

/** Chi riproduce musica dice al sistema se sta suonando (così non si addormenta). */
export function setPlayingProbe(probe: () => boolean): void {
  isPlaying = probe
}

function clearTimers(): void {
  if (backlightTimer) clearTimeout(backlightTimer)
  if (sleepTimer) clearTimeout(sleepTimer)
  backlightTimer = null
  sleepTimer = null
}

function armTimers(): void {
  clearTimers()
  const seconds = settingsStore.get().backlightSeconds
  if (seconds > 0) {
    backlightTimer = setTimeout(() => {
      systemStore.patch({ backlight: false })
    }, seconds * 1000)
  }
  sleepTimer = setTimeout(() => {
    if (!isPlaying()) system.sleep()
    else armTimers() // sta suonando: riprova più tardi
  }, SLEEP_AFTER_MS)
}

export const system = {
  /** Da chiamare a ogni input: accende lo schermo e riarma i timer. */
  touch(): void {
    const s = systemStore.get()
    if (!s.backlight) systemStore.patch({ backlight: true })
    armTimers()
  },
  sleep(): void {
    clearTimers()
    systemStore.patch({ asleep: true, backlight: false })
  },
  wake(): void {
    systemStore.patch({ asleep: false, backlight: true })
    armTimers()
  },
  setHold(locked: boolean): void {
    systemStore.patch({ hold: locked, holdFlashUntil: 0 })
    if (!locked) system.touch()
  },
  flashHold(): void {
    systemStore.patch({ holdFlashUntil: Date.now() + 1200 })
  },
  boot(): void {
    systemStore.patch({ booted: true, asleep: false, backlight: true })
    armTimers()
  },
  setCharging(on: boolean): void {
    systemStore.patch({ charging: on })
  },
  /** Solo per i test. */
  reset(): void {
    clearTimers()
    systemStore.set({ backlight: true, asleep: false, hold: false, booted: false, holdFlashUntil: 0, charging: false })
  },
}

// Cambiando il tempo di retroilluminazione i timer ripartono.
settingsStore.subscribe(() => {
  if (systemStore.get().booted && !systemStore.get().asleep) armTimers()
})

export function useSystem<S = SystemState>(selector?: (s: SystemState) => S): S {
  return useStore(systemStore, selector)
}
