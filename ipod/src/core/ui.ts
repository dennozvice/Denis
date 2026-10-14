/** Stato effimero dell'interfaccia: lettera grande dello scorrimento veloce, lampeggio di una riga, messaggi brevi. */
import { createStore, useStore } from './store'

export interface UiState {
  letter: string | null
  /** false durante la dissolvenza finale (150 ms), poi la lettera sparisce. */
  letterVisible: boolean
  letterUntil: number
  /** Chiave che cambia per far lampeggiare la riga selezionata (aggiunta a On-The-Go). */
  blink: number
  toast: string | null
  toastUntil: number
}

export const uiStore = createStore<UiState>({ letter: null, letterVisible: false, letterUntil: 0, blink: 0, toast: null, toastUntil: 0 })

let letterTimer: ReturnType<typeof setTimeout> | null = null
let letterFadeTimer: ReturnType<typeof setTimeout> | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null

export const ui = {
  showLetter(letter: string): void {
    uiStore.patch({ letter, letterVisible: true, letterUntil: Date.now() + 600 })
    if (letterTimer) clearTimeout(letterTimer)
    if (letterFadeTimer) clearTimeout(letterFadeTimer)
    letterTimer = setTimeout(() => {
      uiStore.patch({ letterVisible: false })
      letterFadeTimer = setTimeout(() => uiStore.patch({ letter: null }), 160)
    }, 600)
  },
  blinkRow(): void {
    uiStore.patch({ blink: uiStore.get().blink + 1 })
  },
  toast(text: string, ms = 1500): void {
    uiStore.patch({ toast: text, toastUntil: Date.now() + ms })
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => uiStore.patch({ toast: null }), ms)
  },
}

export function useUi<S = UiState>(selector?: (s: UiState) => S): S {
  return useStore(uiStore, selector)
}
