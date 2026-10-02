/**
 * App installabile (PWA): registrazione del service worker per l'uso offline e gestione
 * del pulsante "Installa l'app" (Chrome/Edge su Mac e Windows; su Safari si usa "Aggiungi al Dock").
 */
import { useSyncExternalStore } from 'react'

/** Evento non standard di Chromium che permette di mostrare il proprio pulsante "Installa". */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** Da chiamare una volta all'avvio (main.tsx). */
export function setupPwa(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // niente banner automatico: l'utente usa il pulsante in Impostazioni
    deferredPrompt = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
  // Il service worker serve solo nella versione pubblicata (in sviluppo darebbe file vecchi).
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        /* senza service worker l'app funziona lo stesso, solo non offline */
      })
    })
  }
}

/** true se l'app è aperta come app installata (finestra propria, senza barra del browser). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Funzione per mostrare la finestra di installazione del browser, se disponibile (altrimenti null). */
export function useInstallPrompt(): (() => Promise<boolean>) | null {
  const available = useSyncExternalStore(subscribe, () => deferredPrompt !== null, () => false)
  if (!available) return null
  return async () => {
    const e = deferredPrompt
    if (!e) return false
    await e.prompt()
    const { outcome } = await e.userChoice
    deferredPrompt = null
    notify()
    return outcome === 'accepted'
  }
}
