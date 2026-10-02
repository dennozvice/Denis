/**
 * Router minimale basato sull'hash (#/agenda, #/clienti?id=c01…):
 * funziona su GitHub Pages e su qualunque hosting statico senza configurazione.
 */
import { useSyncExternalStore } from 'react'

export type PageId = 'home' | 'agenda' | 'attivita' | 'clienti' | 'fondi' | 'pratiche' | 'impostazioni'

export interface Route {
  page: PageId
  params: Record<string, string>
}

const PAGES: PageId[] = ['home', 'agenda', 'attivita', 'clienti', 'fondi', 'pratiche', 'impostazioni']

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '')
  const [path, query = ''] = clean.split('?')
  const page = (PAGES.includes(path as PageId) ? path : 'home') as PageId
  const params: Record<string, string> = {}
  new URLSearchParams(query).forEach((value, key) => {
    params[key] = value
  })
  return { page, params }
}

export function buildHref(page: PageId, params: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') query.set(k, v)
  const qs = query.toString()
  return `#/${page === 'home' ? '' : page}${qs ? `?${qs}` : ''}`
}

export function navigate(page: PageId, params: Record<string, string | undefined> = {}, replace = false): void {
  const href = buildHref(page, params)
  if (replace) {
    window.history.replaceState(null, '', href)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = href
  }
}

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

const getSnapshot = () => window.location.hash

/** Rotta corrente; si aggiorna a ogni cambio di hash. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => '')
  return parseHash(hash)
}
