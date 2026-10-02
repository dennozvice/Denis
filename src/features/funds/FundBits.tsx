/** Piccoli elementi condivisi da widget e pagina dei fondi. */
import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ChangeValue } from '../../components/ui/ChangeValue'
import type { Instrument } from '../../domain/types'
import { lastPoint } from '../../lib/finance'
import { formatInstrumentValue, formatPercent } from '../../lib/format'
import { seriesColor } from '../../components/charts/LineChart'
import { isGestioneSeparata, type ChangeInfo } from './fundsLogic'
import './funds.css'

/** Indicatore sintetico di rischio (SRI) 1-7: 7 segmenti, i primi N pieni, più il numero. */
export function SriMeter({ value }: { value?: number }) {
  if (!value) return <span className="muted">—</span>
  return (
    <span className="fd-sri" role="img" aria-label={`Rischio ${value} su 7`} title={`Indicatore sintetico di rischio: ${value} su 7`}>
      <span className="fd-sri-bars" aria-hidden="true">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <span key={i} className={i <= value ? 'fd-sri-on' : undefined} />
        ))}
      </span>
      <span className="fd-sri-num" aria-hidden="true">
        {value}
      </span>
    </span>
  )
}

/** Variazione (o "—") secondo le regole dello strumento. */
export function ChangeCell({
  info,
  variant = 'pill',
  title,
}: {
  info: ChangeInfo | undefined
  variant?: 'pill' | 'text'
  title?: string
}) {
  const content = (
    <ChangeValue
      value={info?.value}
      kind={info?.kind}
      decimals={info?.decimals}
      suffix={info?.suffix}
      invert={info?.invert}
      variant={variant}
    />
  )
  return title ? <span title={title}>{content}</span> : content
}

/** Pallino del colore della serie: identità visiva accanto al nome (mai sul testo). */
export function SeriesDot({ colorIndex }: { colorIndex: number }) {
  return <span className="dot fd-series-dot" style={{ color: seriesColor(colorIndex) }} aria-hidden="true" />
}

/** Ultimo valore formattato: valore quota in euro, oppure rendimento annuo per la gestione separata. */
export function formatLastValue(instrument: Instrument): string {
  const last = lastPoint(instrument.series)
  if (!last) return '—'
  if (isGestioneSeparata(instrument)) return formatPercent(last.value, 2)
  return formatInstrumentValue(last.value, instrument.unit, instrument.decimals)
}

/** Anno dell'ultimo rendimento della gestione separata. */
export function lastYieldYear(instrument: Instrument): string | undefined {
  return lastPoint(instrument.series)?.date.slice(0, 4)
}

const MOBILE_QUERY = '(max-width: 767px)'

function subscribeMobile(callback: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia(MOBILE_QUERY)
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}

/** true sotto i 768px: usato solo per dimensioni (altezza dei grafici), il layout resta in CSS. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribeMobile,
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MOBILE_QUERY).matches : false),
    () => false,
  )
}

/** Larghezza di un elemento, aggiornata da un ResizeObserver (callback ref, nessun setState nel render). */
export function useMeasuredWidth(): [number, (node: HTMLElement | null) => (() => void) | undefined] {
  const [width, setWidth] = useState(0)
  const ref = useCallback((node: HTMLElement | null) => {
    if (!node || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0)
      setWidth((prev) => (prev === w ? prev : w))
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [])
  return [width, ref]
}

interface ScrollEdges {
  /** C'è altro contenuto a sinistra. */
  start: boolean
  /** C'è altro contenuto a destra. */
  end: boolean
}

const NO_EDGES: ScrollEdges = { start: false, end: false }

/** Stato di scorrimento orizzontale di un contenitore (ResizeObserver + scroll, nessun setState nel render). */
function useScrollEdges(): [ScrollEdges, (node: HTMLElement | null) => (() => void) | undefined] {
  const [edges, setEdges] = useState<ScrollEdges>(NO_EDGES)
  const ref = useCallback((node: HTMLElement | null) => {
    if (!node || typeof ResizeObserver === 'undefined') return undefined
    const update = () => {
      const rest = node.scrollWidth - node.clientWidth - node.scrollLeft
      const next = { start: node.scrollLeft > 1, end: rest > 1 }
      setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next))
    }
    // il primo rilevamento arriva subito dall'observer; la tabella cambia larghezza anche senza che cambi il contenitore
    const ro = new ResizeObserver(update)
    ro.observe(node)
    if (node.firstElementChild) ro.observe(node.firstElementChild)
    node.addEventListener('scroll', update, { passive: true })
    return () => {
      ro.disconnect()
      node.removeEventListener('scroll', update)
    }
  }, [])
  return [edges, ref]
}

/**
 * Contenitore delle tabelle larghe: se la tabella non sta nella card, dissolvenza sul bordo
 * dove c'è altro da vedere e un suggerimento a scorrere.
 */
export function TableScroll({
  className,
  hint = 'Scorri la tabella di lato per vedere tutte le colonne →',
  children,
}: {
  className?: string
  hint?: string
  children: ReactNode
}) {
  const [edges, ref] = useScrollEdges()
  return (
    <>
      {(edges.start || edges.end) && (
        <p className="xsmall muted fd-scroll-hint" aria-hidden="true">
          {hint}
        </p>
      )}
      <div
        ref={ref}
        className={`table-wrap fd-table-wrap${className ? ` ${className}` : ''}`}
        data-more-start={edges.start || undefined}
        data-more-end={edges.end || undefined}
      >
        {children}
      </div>
    </>
  )
}
