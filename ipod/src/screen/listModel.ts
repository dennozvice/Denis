/**
 * Modello dichiarativo delle liste: ogni schermata-lista è una definizione
 * (titolo, righe, pannello diviso o no) e le righe portano la loro azione.
 * Il gestore di input generico (listInput.ts) e il renderer (MenuList.tsx) lavorano solo su questo.
 */
import type { QueueItem, ShuffleMode } from '../audio/queue'
import type { Screen, ScreenKind } from '../core/navigation'

export type PaneKind = 'slideshow' | 'nowPlaying' | 'extras' | 'settings' | 'podcasts' | 'none'

export type ItemAction =
  | { kind: 'push'; screen: ScreenKind; params?: Record<string, string> }
  | { kind: 'play'; items: () => QueueItem[]; startId: string | null; shuffle?: ShuffleMode }
  | { kind: 'run'; run: () => void }
  | { kind: 'none' }

export interface ListItem {
  id: string
  label: string
  /** Valore a destra (righe che cambiano valore sul posto). */
  value?: string
  chevron?: boolean
  checked?: boolean
  /** Testo secondario piccolo (es. risultati di ricerca). */
  sub?: string
  /** Riga del brano in riproduzione (altoparlante). */
  playing?: boolean
  action: ItemAction
  /** Brani aggiunti alla playlist On-The-Go tenendo premuto il tasto centrale. */
  otgTrackIds?: string[]
  pane?: PaneKind
  /** Lettera dell'indice per l'overlay dello scorrimento veloce. */
  letter?: string
}

export interface ListDef {
  title: (screen: Screen) => string
  items: (screen: Screen) => ListItem[]
  /** Menu diviso (lista a sinistra, pannello a destra). */
  split?: boolean
  /** Mostra la lettera grande scorrendo veloce. */
  letters?: boolean
  /** Testo mostrato al posto delle righe quando la lista è vuota (null = lista bianca vuota). */
  empty?: (screen: Screen) => string | null
}

export const VISIBLE_ROWS = 9
export const ROW_HEIGHT = 24

const defs = new Map<ScreenKind, ListDef>()

export function defineList(kind: ScreenKind, def: ListDef): void {
  defs.set(kind, def)
}

export function listDef(kind: ScreenKind): ListDef | undefined {
  return defs.get(kind)
}

/* Memo delle righe: invalidato quando cambia qualunque store (library, settings, player, system). */
const cache = new Map<string, ListItem[]>()
export function invalidateLists(): void {
  cache.clear()
}
export function listItems(screen: Screen): ListItem[] {
  const def = defs.get(screen.kind)
  if (!def) return []
  const key = `${screen.kind}|${JSON.stringify(screen.params)}`
  let items = cache.get(key)
  if (!items) {
    items = def.items(screen)
    cache.set(key, items)
  }
  return items
}
