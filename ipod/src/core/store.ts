/**
 * Store minimale (senza librerie): stato immutabile + sottoscrizioni, usabile sia da React
 * (tramite useSyncExternalStore) sia da codice puro (gestori di input, motore audio, test).
 */
import { useSyncExternalStore } from 'react'

export interface Store<T> {
  get(): T
  set(next: T | ((prev: T) => T)): void
  /** Aggiorna solo alcuni campi (shallow merge). */
  patch(partial: Partial<T> | ((prev: T) => Partial<T>)): void
  subscribe(listener: (state: T) => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<(state: T) => void>()
  const store: Store<T> = {
    get: () => state,
    set(next) {
      const value = typeof next === 'function' ? (next as (prev: T) => T)(state) : next
      if (Object.is(value, state)) return
      state = value
      listeners.forEach((l) => l(state))
    },
    patch(partial) {
      const p = typeof partial === 'function' ? partial(state) : partial
      let changed = false
      for (const key in p) {
        if (!Object.is((p as Record<string, unknown>)[key], (state as Record<string, unknown>)[key])) {
          changed = true
          break
        }
      }
      if (!changed) return
      store.set({ ...state, ...p })
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  return store
}

/** Hook React: legge una proiezione dello store e ri-renderizza solo quando cambia (Object.is). */
export function useStore<T, S = T>(store: Store<T>, selector: (state: T) => S = (s) => s as unknown as S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  )
}
