/**
 * "Adesso" per le schermate che si ridisegnano a intervalli (Orologi: 1 s, Cronometro: 100 ms).
 * L'istante vive in uno store esterno: il render resta puro (niente Date.now() mentre si disegna)
 * e un solo intervallo serve tutta la schermata.
 */
import { useCallback, useSyncExternalStore } from 'react'
import { createStore } from '../../core/store'

const nowStore = createStore(Date.now())
const snapshot = () => nowStore.get()

/** Timestamp corrente (ms), aggiornato ogni `intervalMs`; con 0 si aggiorna solo all'ingresso. */
export function useNow(intervalMs: number): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const unsubscribe = nowStore.subscribe(onChange)
      // lo store può essere fermo alla visita precedente: lo riallineiamo subito
      nowStore.set(Date.now())
      const id = intervalMs > 0 ? setInterval(() => nowStore.set(Date.now()), intervalMs) : null
      return () => {
        if (id !== null) clearInterval(id)
        unsubscribe()
      }
    },
    [intervalMs],
  )
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
