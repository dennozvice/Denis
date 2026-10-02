/**
 * Dati di mercato (fondi, gestione separata, indici, tassi, cambi).
 * Combina il provider (oggi: dimostrativo) con le serie importate dall'utente via CSV.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { demoMarketProvider } from '../data/market/demoMarket'
import { mergeImported, type MarketDataProvider } from '../data/market/provider'
import { IMPORTS_KEY, loadMarketImports, saveMarketImports, type SaveResult } from '../data/persistence'
import type { DateKey, Instrument } from '../domain/types'
import { lastPoint } from '../lib/finance'
import { useNow } from './NowContext'

export interface MarketState {
  status: 'loading' | 'ready' | 'error'
  error?: string
  /** Tutti gli strumenti, con le serie importate già sovrapposte. */
  instruments: Instrument[]
  /** Fondi e gestione separata, nell'ordine di visualizzazione. */
  funds: Instrument[]
  /** Indici, tassi, spread e cambi. */
  markets: Instrument[]
  /** Data dell'ultimo valore disponibile tra gli strumenti. */
  asOf?: DateKey
  /** true se almeno uno strumento mostrato è dimostrativo. */
  hasDemo: boolean
  providerLabel: string
  /** Serie importate dall'utente (salvate nel browser). */
  imports: Instrument[]
  /** Sostituisce l'elenco delle serie importate. */
  setImports(list: Instrument[]): SaveResult
  /**
   * Aggiorna le serie importate partendo dalla versione PIÙ RECENTE salvata nel browser
   * (rilette al momento: evita di perdere import fatti in un'altra scheda).
   */
  updateImports(update: (current: Instrument[]) => Instrument[]): SaveResult
  reload(): void
}

const MarketContext = createContext<MarketState | null>(null)

export function MarketProvider({
  children,
  provider = demoMarketProvider,
}: {
  children: ReactNode
  provider?: MarketDataProvider
}) {
  const now = useNow()
  const [base, setBase] = useState<Instrument[]>([])
  const [status, setStatus] = useState<MarketState['status']>('loading')
  const [error, setError] = useState<string>()
  const [imports, setImportsState] = useState<Instrument[]>(() => loadMarketImports())
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    provider
      .getInstruments(now.date)
      .then((list) => {
        if (cancelled) return
        setBase(list)
        setStatus('ready')
        setError(undefined)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setStatus('error')
        setError(e instanceof Error ? e.message : 'Errore nel caricamento dei dati di mercato')
      })
    return () => {
      cancelled = true
    }
  }, [provider, now.date, reloadKey])

  const setImports = useCallback((list: Instrument[]) => {
    const result = saveMarketImports(list)
    if (result.ok) setImportsState(list)
    return result
  }, [])
  const updateImports = useCallback((update: (current: Instrument[]) => Instrument[]) => {
    const next = update(loadMarketImports())
    const result = saveMarketImports(next)
    if (result.ok) setImportsState(next)
    return result
  }, [])
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // Import fatti in un'altra scheda: si riallinea questa.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === IMPORTS_KEY) setImportsState(loadMarketImports())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const value = useMemo<MarketState>(() => {
    const instruments = mergeImported(base, imports)
    const funds = instruments.filter((i) => i.group === 'fondo' || i.group === 'gestione_separata')
    const markets = instruments.filter((i) => i.group !== 'fondo' && i.group !== 'gestione_separata')
    const dates = instruments
      .filter((i) => i.group !== 'gestione_separata')
      .map((i) => lastPoint(i.series)?.date)
      .filter((d): d is string => Boolean(d))
      .sort()
    return {
      status,
      error,
      instruments,
      funds,
      markets,
      asOf: dates[dates.length - 1],
      hasDemo: instruments.some((i) => i.source === 'demo'),
      providerLabel: provider.label,
      imports,
      setImports,
      updateImports,
      reload,
    }
  }, [base, imports, status, error, provider.label, setImports, updateImports, reload])

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
}

export function useMarket(): MarketState {
  const v = useContext(MarketContext)
  if (!v) throw new Error('useMarket deve essere usato dentro <MarketProvider>')
  return v
}
