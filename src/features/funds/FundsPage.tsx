import { CircleAlert, FileUp, FlaskConical, RefreshCw, Trash2 } from 'lucide-react'
import { useMemo, useState, type MouseEvent } from 'react'
import { LineChart, type LineSeries } from '../../components/charts/LineChart'
import { Sparkline } from '../../components/charts/Sparkline'
import { Card } from '../../components/ui/Card'
import { DemoBadge } from '../../components/ui/DemoBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pill } from '../../components/ui/Pill'
import { Segmented } from '../../components/ui/Segmented'
import { useToast } from '../../components/ui/Toast'
import { INSTRUMENT_GROUP_LABEL, PERIOD_LABEL, PERIODS } from '../../domain/labels'
import type { Instrument, InstrumentGroup, PerformancePeriod } from '../../domain/types'
import { annualizedVolatility, lastPoint, maxDrawdown, rebaseToPct, sliceSeries, tailValues, usesAbsoluteChange } from '../../lib/finance'
import {
  formatCurrency,
  formatDateShort,
  formatInstrumentValue,
  formatNumber,
  formatPercent,
  plural,
} from '../../lib/format'
import { buildHref, navigate, useRoute } from '../../router/router'
import { useMarket } from '../../store/MarketContext'
import {
  ChangeCell,
  formatLastValue,
  lastYieldYear,
  SeriesDot,
  SriMeter,
  useIsMobile,
  useMeasuredWidth,
} from './FundBits'
import {
  changeSortValue,
  instrumentChange,
  isGestioneSeparata,
  lastValue,
  stepDecimals,
  type ChangePeriod,
} from './fundsLogic'
import { ImportPricesModal } from './ImportPricesModal'
import { seriesColor } from '../../components/charts/LineChart'
import './funds.css'

const PERIOD_OPTIONS = PERIODS.map((p) => ({ value: p, label: p, title: PERIOD_LABEL[p] }))
const DEFAULT_DETAIL_ID = 'f-bil-prud'

const SELECT_GROUPS: { label: string; groups: InstrumentGroup[] }[] = [
  { label: 'Fondi', groups: ['fondo'] },
  { label: 'Gestione separata', groups: ['gestione_separata'] },
  { label: 'Indici', groups: ['indice'] },
  { label: 'Tassi e spread', groups: ['tasso', 'spread'] },
  { label: 'Cambi', groups: ['cambio'] },
]

/** Pagina #/fondi: dettaglio di un fondo o indice, confronto fondi, mercati e serie importate. */
export function FundsPage() {
  const { status, error, instruments, funds, markets, hasDemo, imports, reload } = useMarket()
  const { params } = useRoute()
  const [importOpen, setImportOpen] = useState(false)
  const openImport = () => setImportOpen(true)

  const selected =
    instruments.find((i) => i.id === params.id) ??
    instruments.find((i) => i.id === DEFAULT_DETAIL_ID) ??
    funds[0] ??
    instruments[0]

  const select = (id: string, scroll = false) => {
    navigate('fondi', { id }, true)
    if (scroll) document.getElementById('fd-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="page fd-page">
      <header className="page-header">
        <div>
          <h1>Fondi e mercati</h1>
          <p>Valori quota, indici di mercato e rendimenti</p>
        </div>
        {!hasDemo && (
          <button type="button" className="btn fd-tap" onClick={openImport} aria-haspopup="dialog">
            <FileUp size={16} aria-hidden="true" />
            Importa valori
          </button>
        )}
      </header>

      {hasDemo && (
        <div className="banner fd-demo-banner" role="note">
          <FlaskConical size={18} aria-hidden="true" />
          <p className="grow">
            <strong>Valori dimostrativi generati automaticamente: non sono quotazioni reali.</strong> Importa i valori
            ufficiali per usare dati veri.
          </p>
          <button type="button" className="btn btn-sm fd-tap" onClick={openImport} aria-haspopup="dialog">
            <FileUp size={16} aria-hidden="true" />
            Importa valori
          </button>
        </div>
      )}

      {status === 'loading' && <PageSkeleton />}
      {status === 'error' && (
        <Card>
          <div className="fd-error" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <span className="grow">{error ?? 'Dati di mercato non disponibili al momento.'}</span>
            <button type="button" className="btn btn-sm fd-tap" onClick={reload}>
              <RefreshCw size={14} aria-hidden="true" />
              Riprova
            </button>
          </div>
        </Card>
      )}

      {status === 'ready' && selected && (
        <>
          <DetailSection instrument={selected} instruments={instruments} onSelect={(id) => select(id)} />
          <CompareSection funds={funds} onSelect={(id) => select(id, true)} />
          <MarketsSection markets={markets} onSelect={(id) => select(id, true)} />
          <ImportedSection imports={imports} onImport={openImport} />
        </>
      )}

      <ImportPricesModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}

// ---------------------------------------------------------------- formattazione per unità

function valueFormatter(i: Instrument): (v: number) => string {
  return (v) => formatInstrumentValue(v, i.unit, i.decimals)
}

function tickFormatter(i: Instrument): (v: number, step: number) => string {
  return (v, step) => {
    const d = stepDecimals(step)
    switch (i.unit) {
      case 'EUR':
        return formatCurrency(v, Math.max(2, d))
      case 'pct':
        return formatPercent(v, Math.max(1, d))
      case 'bp':
        return `${formatNumber(v, d)} pb`
      case 'fx':
        return formatNumber(v, Math.max(2, d))
      case 'pt':
        return formatNumber(v, d)
    }
  }
}

const formatPct = (v: number) => formatPercent(v, 2, true)
const formatPctTick = (v: number, step: number) => formatPercent(v, stepDecimals(step), true)

// ---------------------------------------------------------------- dettaglio

type DetailMode = 'valore' | 'pct'

function DetailSection({
  instrument,
  instruments,
  onSelect,
}: {
  instrument: Instrument
  instruments: Instrument[]
  onSelect(id: string): void
}) {
  const gs = isGestioneSeparata(instrument)
  const isFund = instrument.group === 'fondo' || gs
  const benchmark = instrument.benchmarkId ? instruments.find((i) => i.id === instrument.benchmarkId) : undefined
  const showDemo = instrument.source === 'demo'

  return (
    <Card
      id="fd-detail"
      className="fd-card fd-detail-card"
      title={isFund ? 'Dettaglio fondo' : 'Dettaglio mercato'}
      badge={showDemo ? <DemoBadge /> : undefined}
      subtitle={instrument.name}
      actions={
        <label className="fd-select">
          <span className="visually-hidden">Scegli il fondo o l’indice da visualizzare</span>
          <select className="select" value={instrument.id} onChange={(e) => onSelect(e.target.value)}>
            {SELECT_GROUPS.map((g) => {
              const list = instruments.filter((i) => g.groups.includes(i.group))
              if (list.length === 0) return null
              return (
                <optgroup key={g.label} label={g.label}>
                  {list.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </select>
        </label>
      }
    >
      {gs ? <GestioneDetail instrument={instrument} /> : <SeriesDetail instrument={instrument} benchmark={benchmark} />}
    </Card>
  )
}

function SeriesDetail({ instrument, benchmark }: { instrument: Instrument; benchmark?: Instrument }) {
  const isMobile = useIsMobile()
  const [period, setPeriod] = useState<PerformancePeriod>('1A')
  const [mode, setMode] = useState<DetailMode>('valore')
  const [compare, setCompare] = useState(false)
  const absolute = usesAbsoluteChange(instrument)
  const withBenchmark = compare && !!benchmark
  const effMode: DetailMode = absolute ? 'valore' : withBenchmark ? 'pct' : mode

  const series = useMemo<LineSeries[]>(() => {
    const main = sliceSeries(instrument.series, period)
    const list: LineSeries[] = [
      {
        id: instrument.id,
        label: instrument.name,
        colorIndex: instrument.colorIndex,
        points: effMode === 'pct' ? rebaseToPct(main) : main,
      },
    ]
    if (withBenchmark && benchmark) {
      const b = sliceSeries(benchmark.series, period)
      list.push({
        id: `bench-${benchmark.id}`,
        label: `Benchmark: ${benchmark.name}`,
        colorIndex: benchmark.colorIndex === instrument.colorIndex ? (instrument.colorIndex % 8) + 1 : benchmark.colorIndex,
        points: rebaseToPct(b),
        dashed: true,
      })
    }
    return list
  }, [instrument, benchmark, period, effMode, withBenchmark])

  const last = lastPoint(instrument.series)
  const daily = instrumentChange(instrument, '1G')
  const oneYear = sliceSeries(instrument.series, '1A')
  const vol = absolute ? undefined : annualizedVolatility(oneYear)
  const dd = absolute ? undefined : maxDrawdown(oneYear)

  return (
    <div className="fd-detail">
      <div className="fd-detail-main">
        <div className="fd-hero">
          <div className="fd-hero-value">{last ? formatInstrumentValue(last.value, instrument.unit, instrument.decimals) : '—'}</div>
          <div className="fd-hero-meta">
            <ChangeCell info={daily} />
            <span className="xsmall muted">
              {last ? (
                <>
                  ultimo giorno · valore al <time dateTime={last.date}>{formatDateShort(last.date)}</time>
                </>
              ) : (
                'nessun valore'
              )}
            </span>
          </div>
        </div>

        <div className="fd-controls">
          <Segmented<PerformancePeriod> options={PERIOD_OPTIONS} value={period} onChange={setPeriod} ariaLabel="Periodo del grafico" />
          {!absolute && !withBenchmark && (
            <Segmented<DetailMode>
              options={[
                { value: 'valore', label: instrument.unit === 'EUR' ? 'Valore quota' : 'Valore' },
                { value: 'pct', label: 'Rendimento %' },
              ]}
              value={mode}
              onChange={setMode}
              ariaLabel="Unità del grafico"
            />
          )}
          {benchmark && (
            <label className="fd-inline-check">
              <input type="checkbox" className="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
              <span>Confronta con benchmark</span>
            </label>
          )}
        </div>
        {withBenchmark && benchmark && (
          <p className="xsmall muted">
            Rendimento % nel periodo, base 0% a inizio periodo. Benchmark: {benchmark.name}
            {benchmark.source === 'demo' ? ' (valori dimostrativi)' : ''}.
          </p>
        )}

        <LineChart
          series={series}
          formatValue={effMode === 'pct' ? formatPct : valueFormatter(instrument)}
          formatTick={effMode === 'pct' ? formatPctTick : tickFormatter(instrument)}
          ariaLabel={`${instrument.name}: andamento ${PERIOD_LABEL[period].toLowerCase()}${effMode === 'pct' ? ' in rendimento percentuale' : ''}${withBenchmark && benchmark ? ` confrontato con ${benchmark.name}` : ''}`}
          height={isMobile ? 220 : 320}
        />
      </div>

      <aside className="fd-stats" aria-label="Statistiche">
        <h3 className="fd-stats-title">Variazioni</h3>
        <dl className="fd-stat-grid">
          {PERIODS.map((p) => (
            <div key={p} className="fd-stat">
              <dt title={PERIOD_LABEL[p]}>{p === 'YTD' ? 'Da inizio anno' : PERIOD_LABEL[p]}</dt>
              <dd>
                <ChangeCell info={instrumentChange(instrument, p)} />
              </dd>
            </div>
          ))}
        </dl>
        <h3 className="fd-stats-title">Profilo</h3>
        <dl className="fd-facts">
          {!absolute && (
            <>
              <div>
                <dt>Volatilità annua (1A)</dt>
                <dd className="num">{vol === undefined ? '—' : formatPercent(vol, 1)}</dd>
              </div>
              <div>
                <dt>Massimo ribasso (1A)</dt>
                <dd className="num">{dd === undefined ? '—' : formatPercent(dd, 1)}</dd>
              </div>
            </>
          )}
          {instrument.sri && (
            <div>
              <dt>Rischio (SRI)</dt>
              <dd>
                <SriMeter value={instrument.sri} />
              </dd>
            </div>
          )}
          <div>
            <dt>Categoria</dt>
            <dd>{instrument.category ?? INSTRUMENT_GROUP_LABEL[instrument.group]}</dd>
          </div>
          <div>
            <dt>Fonte</dt>
            <dd>{instrument.source === 'demo' ? <DemoBadge /> : <Pill tone="positive">Importato</Pill>}</dd>
          </div>
          {instrument.description && (
            <div className="fd-facts-wide">
              <dt>Descrizione</dt>
              <dd className="text-2">{instrument.description}</dd>
            </div>
          )}
        </dl>
      </aside>
    </div>
  )
}

function GestioneDetail({ instrument }: { instrument: Instrument }) {
  const last = lastPoint(instrument.series)
  const change = instrumentChange(instrument, '1A')
  const recent = instrument.series.slice(-5)
  const avg = recent.length ? recent.reduce((s, p) => s + p.value, 0) / recent.length : undefined
  return (
    <div className="fd-detail">
      <div className="fd-detail-main">
        <div className="fd-hero">
          <div className="fd-hero-value">{last ? formatPercent(last.value, 2) : '—'}</div>
          <div className="fd-hero-meta">
            <ChangeCell info={change} title="Variazione rispetto al rendimento dell’anno precedente, in punti percentuali" />
            <span className="xsmall muted">rendimento annuo certificato {lastYieldYear(instrument)}</span>
          </div>
        </div>
        <p className="xsmall muted">
          La gestione separata non ha un valore quota giornaliero: il rendimento viene certificato una volta l’anno.
        </p>
        <YieldBars instrument={instrument} />
      </div>
      <aside className="fd-stats" aria-label="Statistiche">
        <h3 className="fd-stats-title">Profilo</h3>
        <dl className="fd-facts">
          <div>
            <dt>Ultimo rendimento</dt>
            <dd className="num">
              {last ? `${formatPercent(last.value, 2)} (${last.date.slice(0, 4)})` : '—'}
            </dd>
          </div>
          <div>
            <dt>Rispetto all’anno prima</dt>
            <dd>
              <ChangeCell info={change} />
            </dd>
          </div>
          <div>
            <dt>Media ultimi {recent.length} anni</dt>
            <dd className="num">{avg === undefined ? '—' : formatPercent(avg, 2)}</dd>
          </div>
          {instrument.sri && (
            <div>
              <dt>Rischio (SRI)</dt>
              <dd>
                <SriMeter value={instrument.sri} />
              </dd>
            </div>
          )}
          <div>
            <dt>Categoria</dt>
            <dd>{instrument.category ?? INSTRUMENT_GROUP_LABEL[instrument.group]}</dd>
          </div>
          <div>
            <dt>Fonte</dt>
            <dd>{instrument.source === 'demo' ? <DemoBadge /> : <Pill tone="positive">Importato</Pill>}</dd>
          </div>
          {instrument.description && (
            <div className="fd-facts-wide">
              <dt>Descrizione</dt>
              <dd className="text-2">{instrument.description}</dd>
            </div>
          )}
        </dl>
      </aside>
    </div>
  )
}

/** Barre verticali (SVG) dei rendimenti annui, con il valore sopra ogni barra. */
function YieldBars({ instrument }: { instrument: Instrument }) {
  const [width, measureRef] = useMeasuredWidth()
  const isMobile = useIsMobile()
  const points = instrument.series
  const height = isMobile ? 200 : 240
  const padTop = 24
  const padBottom = 28
  const max = Math.max(...points.map((p) => p.value), 0)
  const min = Math.min(...points.map((p) => p.value), 0)
  const range = max - min || 1
  const slot = points.length ? width / points.length : 0
  const barW = Math.min(36, Math.max(8, slot * 0.55))
  const yOf = (v: number) => padTop + ((max - v) / range) * (height - padTop - padBottom)
  const baseY = yOf(0)
  const color = seriesColor(instrument.colorIndex)
  const label = `Rendimenti annui certificati: ${points.map((p) => `${p.date.slice(0, 4)} ${formatPercent(p.value, 2)}`).join(', ')}`

  return (
    <div ref={measureRef} className="fd-bars" style={{ height }}>
      {width > 0 && points.length > 0 && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
          <line x1={0} x2={width} y1={Math.round(baseY) + 0.5} y2={Math.round(baseY) + 0.5} stroke="var(--grid)" strokeWidth={1} />
          {points.map((p, i) => {
            const cx = slot * i + slot / 2
            const top = yOf(Math.max(0, p.value))
            const bottom = yOf(Math.min(0, p.value))
            const h = Math.max(1, bottom - top)
            const r = Math.min(4, h / 2, barW / 2)
            const x0 = cx - barW / 2
            const x1 = cx + barW / 2
            // estremo arrotondato verso l'alto, base squadrata
            const d = `M${x0},${bottom}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x1 - r}Q${x1},${top} ${x1},${top + r}V${bottom}Z`
            const isLast = i === points.length - 1
            return (
              <g key={p.date}>
                <path d={d} fill={color} fillOpacity={isLast ? 1 : 0.6} />
                <text
                  x={cx}
                  y={top - 7}
                  textAnchor="middle"
                  className={`fd-bar-value${isLast ? ' fd-bar-value-last' : ''}`}
                >
                  {formatPercent(p.value, slot < 48 ? 1 : 2)}
                </text>
                <text x={cx} y={height - 8} textAnchor="middle" className="fd-bar-year">
                  {p.date.slice(0, 4)}
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- confronto fondi

type SortKey = 'default' | 'name' | 'value' | ChangePeriod
type SortDir = 'asc' | 'desc'
const COMPARE_PERIODS: ChangePeriod[] = ['1G', ...PERIODS]

function periodHeader(p: ChangePeriod): { short: string; long: string } {
  if (p === '1G') return { short: '1g', long: 'Variazione ultimo giorno' }
  return { short: p, long: `Variazione ${PERIOD_LABEL[p].toLowerCase()}` }
}

function useSort(initial: SortKey = 'default') {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: initial, dir: 'asc' })
  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }))
  return [sort, toggle] as const
}

function sortInstruments(list: Instrument[], key: SortKey, dir: SortDir, valueOf: (i: Instrument, k: SortKey) => number | string | undefined) {
  if (key === 'default') return list
  const factor = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const va = valueOf(a, key)
    const vb = valueOf(b, key)
    if (va === undefined && vb === undefined) return 0
    if (va === undefined) return 1 // i dati mancanti restano in fondo
    if (vb === undefined) return -1
    if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'it') * factor
    return (va - vb) * factor
  })
}

function SortHeader({
  label,
  title,
  sortKey,
  sort,
  onSort,
  numeric = false,
  className,
}: {
  label: string
  title?: string
  sortKey: SortKey
  sort: { key: SortKey; dir: SortDir }
  onSort(key: SortKey): void
  numeric?: boolean
  className?: string
}) {
  const active = sort.key === sortKey
  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <th scope="col" aria-sort={ariaSort} className={`${numeric ? 'num ' : ''}${className ?? ''}`}>
      <button type="button" className="fd-sort" onClick={() => onSort(sortKey)} title={title}>
        <span>{label}</span>
        {title && <span className="visually-hidden"> ({title})</span>}
        <span className="fd-sort-icon" aria-hidden="true">
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

function compareValue(i: Instrument, key: SortKey): number | string | undefined {
  if (key === 'name') return i.name
  if (key === 'value') return isGestioneSeparata(i) ? undefined : lastValue(i)
  if (key === 'default') return undefined
  return isGestioneSeparata(i) ? undefined : changeSortValue(i, key)
}

function SelectLink({ instrument, onSelect }: { instrument: Instrument; onSelect(id: string): void }) {
  return (
    <a
      className="fd-fund-name"
      href={buildHref('fondi', { id: instrument.id })}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        onSelect(instrument.id)
      }}
    >
      {instrument.name}
    </a>
  )
}

function CompareSection({ funds, onSelect }: { funds: Instrument[]; onSelect(id: string): void }) {
  const [sort, onSort] = useSort()
  const rows = sortInstruments(funds, sort.key, sort.dir, compareValue)
  const hasDemo = funds.some((f) => f.source === 'demo')
  return (
    <Card
      id="fd-compare"
      className="fd-card"
      title="Confronto fondi"
      badge={hasDemo ? <DemoBadge /> : undefined}
      subtitle="Valore quota e variazioni per periodo. Tocca un’intestazione per ordinare."
    >
      <p className="xsmall muted fd-scroll-hint" aria-hidden="true">
        Scorri la tabella di lato per vedere tutti i periodi →
      </p>
      <div className="table-wrap fd-table-wrap fd-compare-wrap">
        <table className="table fd-table fd-sticky-first">
          <caption className="visually-hidden">Confronto dei fondi: valore quota e variazioni per periodo</caption>
          <thead>
            <tr>
              <SortHeader label="Fondo" sortKey="name" sort={sort} onSort={onSort} className="fd-col-name" />
              <SortHeader label="Valore quota" sortKey="value" sort={sort} onSort={onSort} numeric />
              {COMPARE_PERIODS.map((p) => {
                const h = periodHeader(p)
                return <SortHeader key={p} label={h.short} title={h.long} sortKey={p} sort={sort} onSort={onSort} numeric />
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const gs = isGestioneSeparata(f)
              return (
                <tr key={f.id}>
                  <th scope="row" className="fd-col-name">
                    <div className="fd-fund">
                      <SeriesDot colorIndex={f.colorIndex} />
                      <div className="fd-fund-text">
                        <SelectLink instrument={f} onSelect={onSelect} />
                        <span className="xsmall muted">
                          {[f.category, f.source === 'import' ? 'valori importati' : undefined].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    </div>
                  </th>
                  <td className="num">
                    <span className="fd-value">{formatLastValue(f)}</span>
                    {gs && <span className="fd-caption">rendimento {lastYieldYear(f)}</span>}
                  </td>
                  {COMPARE_PERIODS.map((p) => (
                    <td key={p} className="num">
                      {gs ? (
                        <span className="muted" title="Rendimento annuo certificato: nessuna variazione giornaliera o di periodo">
                          <span aria-hidden="true">—</span>
                          <span className="visually-hidden">non applicabile</span>
                        </span>
                      ) : (
                        <ChangeCell info={instrumentChange(f, p)} variant="text" />
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- mercati

const MARKET_PERIODS: ChangePeriod[] = ['1G', '1M', 'YTD', '1A']

function marketValue(i: Instrument, key: SortKey): number | string | undefined {
  if (key === 'name') return i.name
  if (key === 'value') return lastValue(i)
  if (key === 'default') return undefined
  return changeSortValue(i, key)
}

function MarketsSection({ markets, onSelect }: { markets: Instrument[]; onSelect(id: string): void }) {
  const [sort, onSort] = useSort()
  const rows = sortInstruments(markets, sort.key, sort.dir, marketValue)
  const hasDemo = markets.some((m) => m.source === 'demo')
  return (
    <Card
      id="fd-markets"
      className="fd-card"
      title="Mercati"
      badge={hasDemo ? <DemoBadge /> : undefined}
      subtitle="Indici, tassi, spread e cambi. Tassi e spread: variazioni in punti base (pb)."
    >
      {markets.length === 0 ? (
        <p className="muted small">Nessun indice disponibile.</p>
      ) : (
        <>
          <div className="table-wrap fd-table-wrap fd-only-wide">
            <table className="table fd-table">
              <caption className="visually-hidden">Mercati: valore e variazioni</caption>
              <thead>
                <tr>
                  <SortHeader label="Nome" sortKey="name" sort={sort} onSort={onSort} />
                  <th scope="col">Tipo</th>
                  <SortHeader label="Valore" sortKey="value" sort={sort} onSort={onSort} numeric />
                  {MARKET_PERIODS.map((p) => {
                    const h = periodHeader(p)
                    return <SortHeader key={p} label={h.short} title={h.long} sortKey={p} sort={sort} onSort={onSort} numeric />
                  })}
                  <th scope="col" className="fd-col-trend">
                    Trend 30g
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const spark = tailValues(m.series, 22)
                  return (
                    <tr key={m.id}>
                      <th scope="row" className="fd-row-head">
                        <SelectLink instrument={m} onSelect={onSelect} />
                      </th>
                      <td className="muted small">{INSTRUMENT_GROUP_LABEL[m.group]}</td>
                      <td className="num">{formatLastValue(m)}</td>
                      {MARKET_PERIODS.map((p) => (
                        <td key={p} className="num">
                          <ChangeCell info={instrumentChange(m, p)} variant="text" />
                        </td>
                      ))}
                      <td className="fd-col-trend">
                        <Sparkline values={spark} width={72} height={24} label={trend(spark)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <ul className="fd-mcards fd-only-narrow" aria-label="Mercati">
            {rows.map((m) => {
              const spark = tailValues(m.series, 22)
              return (
                <li key={m.id} className="fd-mcard">
                  <div className="fd-mcard-head">
                    <div className="fd-mcard-name">
                      <SelectLink instrument={m} onSelect={onSelect} />
                      <span className="xsmall muted">{INSTRUMENT_GROUP_LABEL[m.group]}</span>
                    </div>
                    <Sparkline values={spark} width={64} height={24} label={trend(spark)} />
                  </div>
                  <div className="fd-mcard-value">
                    <span className="num strong">{formatLastValue(m)}</span>
                    <ChangeCell info={instrumentChange(m, '1G')} />
                  </div>
                  <dl className="fd-mcard-periods">
                    {MARKET_PERIODS.slice(1).map((p) => (
                      <div key={p}>
                        <dt>{p}</dt>
                        <dd>
                          <ChangeCell info={instrumentChange(m, p)} variant="text" />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Card>
  )
}

function trend(values: number[]): string {
  if (values.length < 2) return 'Andamento 30 giorni'
  return `Andamento 30 giorni: ${values[values.length - 1] >= values[0] ? 'in crescita' : 'in calo'}`
}

// ---------------------------------------------------------------- dati importati

function ImportedSection({ imports, onImport }: { imports: Instrument[]; onImport(): void }) {
  const { setImports } = useMarket()
  const toast = useToast()

  const failMessage = (reason: 'quota' | 'unavailable' | 'error') =>
    reason === 'unavailable' ? 'Archiviazione del browser non disponibile: modifica non salvata.' : 'Modifica non salvata: riprova.'

  const remove = (target: Instrument) => {
    const previous = imports
    const result = setImports(imports.filter((i) => i.id !== target.id))
    if (!result.ok) {
      toast({ message: failMessage(result.reason) })
      return
    }
    toast({
      message: `Valori importati di «${target.name}» rimossi`,
      actionLabel: 'Annulla',
      onAction: () => {
        setImports(previous)
      },
    })
  }

  const removeAll = () => {
    if (!window.confirm(`Rimuovere tutti i valori importati (${plural(imports.length, 'serie', 'serie')})? Torneranno i valori dimostrativi.`)) return
    const previous = imports
    const result = setImports([])
    if (!result.ok) {
      toast({ message: failMessage(result.reason) })
      return
    }
    toast({ message: 'Valori importati rimossi', actionLabel: 'Annulla', onAction: () => setImports(previous) })
  }

  return (
    <Card
      id="fd-imported"
      className="fd-card"
      title="Dati importati"
      subtitle="Salvati solo in questo browser"
      actions={
        imports.length > 0 ? (
          <button type="button" className="btn btn-sm fd-tap" onClick={onImport} aria-haspopup="dialog">
            <FileUp size={14} aria-hidden="true" />
            Importa
          </button>
        ) : undefined
      }
      footer={
        imports.length > 1 ? (
          <button type="button" className="btn btn-danger btn-sm fd-tap" onClick={removeAll}>
            <Trash2 size={14} aria-hidden="true" />
            Rimuovi tutti
          </button>
        ) : undefined
      }
    >
      {imports.length === 0 ? (
        <EmptyState
          icon={FileUp}
          title="Nessun dato importato"
          text="Importa da un file CSV i valori quota ufficiali (ad esempio dal sito della compagnia): sostituiranno i valori dimostrativi dello stesso fondo. Puoi anche aggiungere fondi nuovi."
          action={
            <button type="button" className="btn btn-primary fd-tap" onClick={onImport} aria-haspopup="dialog">
              <FileUp size={16} aria-hidden="true" />
              Importa valori
            </button>
          }
        />
      ) : (
        <ul className="fd-imports">
          {imports.map((i) => {
            const first = i.series[0]
            const last = lastPoint(i.series)
            return (
              <li key={i.id} className="fd-import-item">
                <div className="grow">
                  <div className="row">
                    <SeriesDot colorIndex={i.colorIndex} />
                    <span className="strong truncate">{i.name}</span>
                  </div>
                  <div className="xsmall muted num">
                    {plural(i.series.length, 'valore', 'valori')}
                    {first && last && (
                      <>
                        {' · '}
                        {first.date === last.date ? formatDateShort(last.date) : `${formatDateShort(first.date)} – ${formatDateShort(last.date)}`}
                      </>
                    )}
                    {i.id.startsWith('imp-') ? ' · nuovo fondo' : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm fd-tap"
                  onClick={() => remove(i)}
                  aria-label={`Rimuovi i valori importati di ${i.name}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Rimuovi
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function PageSkeleton() {
  return (
    <div className="stack" aria-busy="true" aria-label="Caricamento dei dati di mercato">
      <div className="card fd-skeleton">
        <span className="skeleton fd-skel-title" />
        <span className="skeleton fd-skel-chart fd-skel-chart-lg" />
      </div>
      <div className="card fd-skeleton">
        <span className="skeleton fd-skel-title" />
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="fd-skel-row">
            <span className="skeleton fd-skel-name" />
            <span className="skeleton fd-skel-val" />
            <span className="skeleton fd-skel-val" />
          </span>
        ))}
      </div>
    </div>
  )
}
