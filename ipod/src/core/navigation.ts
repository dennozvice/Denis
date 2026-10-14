/**
 * Pila delle schermate (come sull'iPod: MENU torna indietro e ritrova la riga selezionata).
 * Ogni schermata ricorda la riga selezionata (`sel`), la prima riga visibile (`first`)
 * e un eventuale "modo" interno (es. In riproduzione: barra → scorrimento → valutazione).
 */
import { createStore, useStore } from './store'

export type ScreenKind =
  | 'main'
  | 'music'
  | 'videos'
  | 'photos'
  | 'empty'
  | 'podcasts'
  | 'extras'
  | 'settings'
  | 'playlists'
  | 'playlist'
  | 'artists'
  | 'artist'
  | 'albums'
  | 'album'
  | 'songs'
  | 'genres'
  | 'genre'
  | 'composers'
  | 'composer'
  | 'audiobooks'
  | 'search'
  | 'coverflow'
  | 'nowPlaying'
  | 'about'
  | 'option' // scelta di un valore tra più opzioni (Casuale, Ripeti, EQ, Lingua, Retroilluminazione…)
  | 'brightness'
  | 'clock'
  | 'stopwatch'
  | 'games'
  | 'sync'
  | 'legal'
  | 'confirm'
  | 'message'

export interface Screen {
  /** Chiave univoca dell'istanza (per React e per le animazioni). */
  key: number
  kind: ScreenKind
  /** Parametri (id album, nome artista, nome impostazione…). */
  params: Record<string, string>
  sel: number
  first: number
  mode: string
}

export interface NavState {
  stack: Screen[]
}

let nextKey = 1

export function makeScreen(kind: ScreenKind, params: Record<string, string> = {}, sel = 0): Screen {
  return { key: nextKey++, kind, params, sel, first: 0, mode: '' }
}

export const navStore = createStore<NavState>({ stack: [makeScreen('main')] })

export const nav = {
  top(): Screen {
    const s = navStore.get().stack
    return s[s.length - 1]!
  },
  depth(): number {
    return navStore.get().stack.length
  },
  push(kind: ScreenKind, params: Record<string, string> = {}, sel = 0): void {
    navStore.set((st) => ({ stack: [...st.stack, makeScreen(kind, params, sel)] }))
  },
  /** Torna indietro di una schermata; alla radice non fa nulla. Restituisce true se è tornato. */
  pop(): boolean {
    const st = navStore.get()
    if (st.stack.length <= 1) return false
    navStore.set({ stack: st.stack.slice(0, -1) })
    return true
  },
  /** Sostituisce la schermata in cima (es. messaggio → schermata successiva). */
  replace(kind: ScreenKind, params: Record<string, string> = {}, sel = 0): void {
    navStore.set((st) => ({ stack: [...st.stack.slice(0, -1), makeScreen(kind, params, sel)] }))
  },
  /** Torna al menu principale. */
  home(): void {
    navStore.set((st) => ({ stack: [st.stack[0]!] }))
  },
  /** Aggiorna selezione/scorrimento/modo della schermata in cima. */
  update(partial: Partial<Pick<Screen, 'sel' | 'first' | 'mode' | 'params'>>): void {
    navStore.set((st) => {
      const top = st.stack[st.stack.length - 1]!
      const next = { ...top, ...partial }
      if (next.sel === top.sel && next.first === top.first && next.mode === top.mode && next.params === top.params) return st
      return { stack: [...st.stack.slice(0, -1), next] }
    })
  },
  /** Rimuove dalla pila tutte le schermate di un certo tipo (es. 'nowPlaying' quando finisce la coda). */
  removeKind(kind: ScreenKind): void {
    navStore.set((st) => {
      const stack = st.stack.filter((s) => s.kind !== kind)
      return stack.length === st.stack.length ? st : { stack: stack.length ? stack : [makeScreen('main')] }
    })
  },
  reset(): void {
    navStore.set({ stack: [makeScreen('main')] })
  },
}

export function useNav(): NavState {
  return useStore(navStore)
}

export function useTopScreen(): Screen {
  return useStore(navStore, (s) => s.stack[s.stack.length - 1]!)
}
