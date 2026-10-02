import { CircleAlert, ChevronRight, RefreshCw } from 'lucide-react'
import { ChangeValue } from '../../components/ui/ChangeValue'
import { DemoBadge } from '../../components/ui/DemoBadge'
import type { Instrument } from '../../domain/types'
import { lastPoint } from '../../lib/finance'
import { formatDayMonth, formatInstrumentValue } from '../../lib/format'
import { buildHref } from '../../router/router'
import { useMarket } from '../../store/MarketContext'
import { marketChange } from './homeLogic'
import './home.css'

const SKELETON_ITEMS = 7

/**
 * Striscia dei mercati (indici, tassi, spread, cambi) con valore e variazione giornaliera.
 * Statica: su schermi piccoli si scorre in orizzontale con lo scroll-snap, senza animazioni automatiche.
 */
export function MarketStrip() {
  const { status, markets, asOf, reload } = useMarket()
  const hasDemo = markets.some((i) => i.source === 'demo')

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
      <ul className="hm-market-list">
        {markets.map((instrument) => (
          <MarketItem key={instrument.id} instrument={instrument} />
        ))}
      </ul>
    )
  }

  return (
    <section className="card hm-market" aria-labelledby="hm-market-title" aria-busy={status === 'loading'}>
      <h2 id="hm-market-title" className="visually-hidden">
        Mercati
      </h2>
      {body}
      <div className="hm-market-meta">
        {hasDemo && <DemoBadge />}
        <span className="hm-market-meta-row">
          {asOf && status === 'ready' && (
            <span className="xsmall muted">
              al <time dateTime={asOf}>{formatDayMonth(asOf)}</time>
            </span>
          )}
          <a className="hm-market-more" href={buildHref('fondi')}>
            Dettagli
            <ChevronRight size={14} aria-hidden="true" />
          </a>
        </span>
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
            variant="text"
          />
        </span>
      </a>
    </li>
  )
}
