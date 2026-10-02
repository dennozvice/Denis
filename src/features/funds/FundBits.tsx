/** Piccoli elementi condivisi da widget e pagina dei fondi. */
import { useCallback, useState, useSyncExternalStore } from 'react'
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
