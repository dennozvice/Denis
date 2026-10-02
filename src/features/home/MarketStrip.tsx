import { CircleAlert, ChevronRight, RefreshCw } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { ChangeValue } from '../../components/ui/ChangeValue'
import { DemoBadge } from '../../components/ui/DemoBadge'
import type { Instrument } from '../../domain/types'
import { lastPoint } from '../../lib/finance'
import { formatDayMonth, formatInstrumentValue } from '../../lib/format'
import { buildHref } from '../../router/router'
import { useMarket } from '../../store/MarketContext'
import { latestDate, marketChange, scrollEdges, type ScrollEdges } from './homeLogic'
import './home.css'

const SKELETON_ITEMS = 7

const NO_EDGES: ScrollEdges = { start: false, end: false }

/** Rileva se l'elenco scorre in orizzontale e da che lato c'è altro (ResizeObserver + scroll). */
function useScrollEdges(): [ScrollEdges, (node: HTMLElement | null) => (() => void) | undefined] {
  const [edges, setEdges] = useState<ScrollEdges>(NO_EDGES)
  const ref = useCallback((node: HTMLElement | null) => {
    if (!node || typeof ResizeObserver === 'undefined') return undefined
    const update = () => {
      const next = scrollEdges(node)
      setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next))
    }
    // Il primo rilevamento arriva subito dall'observer; le celle cambiano larghezza quando cambiano i valori.
    const ro = new ResizeObserver(update)
    ro.observe(node)
    for (const child of node.children) ro.observe(child)
    node.addEventListener('scroll', update, { passive: true })
    return () => {
      ro.disconnect()
      node.removeEventListener('scroll', update)
    }
  }, [])
  return [edges, ref]
}

/**
 * Striscia dei mercati (indici, tassi, spread, cambi) con valore e variazione giornaliera.
 * Statica: su schermi piccoli si scorre in orizzontale con lo scroll-snap, senza animazioni automatiche;
 * una dissolvenza sul bordo indica che c'è altro da scorrere.
 * Il badge "Dati dimostrativi" precede l'elenco nel DOM (letto per primo). Su desktop badge, data e
 * "Dettagli" stanno nella colonna a destra; su tablet e mobile formano la riga in testa alla striscia,
 * così il badge resta sempre visibile mentre l'elenco scorre.
 */
export function MarketStrip() {
  const { status, markets, reload } = useMarket()
  const hasDemo = markets.some((i) => i.source === 'demo')
  // Data dei soli strumenti della striscia: i fondi importati possono essere più recenti (o più vecchi).
  const asOf = useMemo(() => latestDate(markets), [markets])
  const [edges, scrollRef] = useScrollEdges()

  let body
  if (status === 'loading') {
    body = (
      <ul className="hm-market-list" aria-hidden="true">
        {Array.from({ length: SKELETON_ITEMS }, (_, i) => (
          <li key={i} className="hm-market-item">
            <span className="hm-market-cell">
              <span className="skeleton hm-skel-name" />
              <span className="skeleton hm-skel-value" />
              <span className="skeleton hm-skel-change" />
            </span>
          </li>
        ))}
      </ul>
    )
  } else if (status === 'error') {
    body = (
      <div className="hm-market-error" role="alert">
        <CircleAlert size={18} aria-hidden="true" />
        <span className="grow">Dati di mercato non disponibili al momento.</span>
        <button type="button" className="btn btn-sm hm-tap" onClick={reload}>
          <RefreshCw size={14} aria-hidden="true" />
          Riprova
        </button>
      </div>
    )
  } else if (markets.length === 0) {
    body = <p className="hm-market-error muted small">Nessun indice di mercato disponibile.</p>
  } else {
    body = (
      <ul
        ref={scrollRef}
        className="hm-market-list"
        data-more-start={edges.start || undefined}
        data-more-end={edges.end || undefined}
      >
        {markets.map((instrument) => (
          <MarketItem key={instrument.id} instrument={instrument} />
        ))}
      </ul>
    )
  }

  return (
    <section
      className="card hm-market"
      aria-labelledby="hm-market-title"
      aria-busy={status === 'loading'}
      data-demo={hasDemo || undefined}
    >
      <h2 id="hm-market-title" className="visually-hidden">
        Mercati
      </h2>
      {hasDemo && (
        <div className="hm-market-badge">
          <DemoBadge />
        </div>
      )}
      <div className="hm-market-body">{body}</div>
      <div className="hm-market-meta">
        {asOf && status === 'ready' && (
          <span className="xsmall muted">
            al <time dateTime={asOf}>{formatDayMonth(asOf)}</time>
          </span>
        )}
        <a className="card-link hm-market-more" href={buildHref('fondi')}>
          Dettagli
          <ChevronRight size={14} aria-hidden="true" />
        </a>
      </div>
    </section>
  )
}

function MarketItem({ instrument }: { instrument: Instrument }) {
  const last = lastPoint(instrument.series)
  const change = marketChange(instrument)
  return (
    <li className="hm-market-item">
      <a className="hm-market-cell" href={buildHref('fondi', { id: instrument.id })}>
        <span className="hm-market-name">{instrument.name}</span>
        <span className="hm-market-value num">
          {last ? formatInstrumentValue(last.value, instrument.unit, instrument.decimals) : '—'}
        </span>
        <span className="hm-market-change" title="Variazione giornaliera">
          <span className="visually-hidden">variazione giornaliera </span>
          <ChangeValue
            value={change?.value}
            kind={change?.kind}
            decimals={change?.decimals}
            suffix={change?.suffix}
            invert={change?.invert}
            neutral={change?.neutral}
            variant="text"
          />
        </span>
      </a>
    </li>
  )
}
