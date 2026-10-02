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
import { lastPoint, maxDrawdown, rebaseToPct, sliceSeries, usesAbsoluteChange } from '../../lib/finance'
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
  LastChangeCell,
  lastYieldYear,
  NotApplicable,
  SeriesDot,
  ShowDemoToggle,
  SourceTag,
  SriMeter,
  TableScroll,
  useFundsView,
  useIsMobile,
  useMeasuredWidth,
} from './FundBits'
import {
  annualizedVolatilityByFrequency,
  changeSortValue,
  FREQUENCY_DATA_LABEL,
  hasWideLastChange,
  instrumentChange,
  isGestioneSeparata,
  lastChangeRef,
  lastValue,
  latestDate,
  rebaseAtCommonStart,
  removeImports,
  restoreImports,
  risingIsBad,
  stepDecimals,
  trendValues,
  type ChangePeriod,
  type RemovedImport,
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
  const { status, error, imports, reload } = useMarket()
  const { instruments, funds, markets, demoFundCount, showDemo } = useFundsView()
  const { params } = useRoute()
  const [importOpen, setImportOpen] = useState(false)
  const openImport = () => setImportOpen(true)

  // un ID esplicito nell'indirizzo vale anche per un fondo dimostrativo nascosto; altrimenti si sceglie tra quelli mostrati
  const visible = [...funds, ...markets]
  const selected =
    instruments.find((i) => i.id === params.id) ??
    visible.find((i) => i.id === DEFAULT_DETAIL_ID) ??
    funds[0] ??
    visible[0]
  const hasDemo = visible.some((i) => i.source === 'demo')

  /** Scelta da una tabella: si porta il dettaglio in vista e il focus sul suo titolo (annunciato dai lettori di schermo). */
  const select = (id: string, scroll = false) => {
    navigate('fondi', { id }, true)
    if (!scroll) return
    // dopo il nuovo render: il titolo annuncia già il nuovo strumento
    window.requestAnimationFrame(() => {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      document.getElementById('fd-detail')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
      const heading = document.getElementById('fd-detail-title')
      if (!heading) return
      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    })
  }

  return (
    <div className="page fd-page">
      <header className="page-header">
        <div>
          <h1>Fondi e mercati</h1>
          <p>Valori quota, indici di mercato e rendimenti</p>
          <p className="xsmall fd-disclaimer">I rendimenti passati non sono indicativi di quelli futuri.</p>
        </div>
        {(demoFundCount > 0 || !hasDemo) && (
          <div className="fd-page-actions">
            {demoFundCount > 0 && <ShowDemoToggle />}
            {!hasDemo && (
              <button type="button" className="btn fd-tap" onClick={openImport} aria-haspopup="dialog">
                <FileUp size={16} aria-hidden="true" />
                Importa valori
              </button>
            )}
          </div>
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
          <DetailSection
            instrument={selected}
            instruments={instruments}
            options={visible.includes(selected) ? visible : [...visible, selected]}
            onSelect={(id) => select(id)}
          />
          <CompareSection
            funds={funds}
            demoHidden={demoFundCount > 0 && !showDemo}
            onSelect={(id) => select(id, true)}
            onImport={openImport}
          />
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
  options,
  onSelect,
}: {
  instrument: Instrument
  instruments: Instrument[]
  /** Strumenti elencati nella scelta (senza i fondi dimostrativi nascosti). */
  options: Instrument[]
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
      title={
        <>
          {isFund ? 'Dettaglio fondo' : 'Dettaglio mercato'}
          <span className="visually-hidden">: {instrument.name}</span>
        </>
      }
      badge={showDemo ? <DemoBadge /> : undefined}
      subtitle={instrument.name}
      actions={
        <label className="fd-select">
          <span className="visually-hidden">Scegli il fondo o l’indice da visualizzare</span>
          <select className="select" value={instrument.id} onChange={(e) => onSelect(e.target.value)}>
            {SELECT_GROUPS.map((g) => {
              const list = options.filter((i) => g.groups.includes(i.group))
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

  const { series, compareStart } = useMemo(() => {
    const main = sliceSeries(instrument.series, period)
    const line: LineSeries = { id: instrument.id, label: instrument.name, colorIndex: instrument.colorIndex, points: main }
    if (!(withBenchmark && benchmark)) {
      return { series: [{ ...line, points: effMode === 'pct' ? rebaseToPct(main) : main }], compareStart: undefined }
    }
    // fondo e benchmark ribasati alla stessa data, anche se uno dei due ha una storia più corta
    const rebased = rebaseAtCommonStart([main, sliceSeries(benchmark.series, period)])
    const list: LineSeries[] = [
      { ...line, points: rebased.series[0] },
      {
        id: `bench-${benchmark.id}`,
        label: `Benchmark: ${benchmark.name}`,
        colorIndex: benchmark.colorIndex === instrument.colorIndex ? (instrument.colorIndex % 8) + 1 : benchmark.colorIndex,
        points: rebased.series[1],
        dashed: true,
      },
    ]
    return { series: list, compareStart: rebased.start }
  }, [instrument, benchmark, period, effMode, withBenchmark])

  const last = lastPoint(instrument.series)
  const daily = instrumentChange(instrument, '1G')
  const changeRef = lastChangeRef(instrument.series)
  const oneYear = sliceSeries(instrument.series, '1A')
  const vol = absolute ? undefined : annualizedVolatilityByFrequency(oneYear)
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
                  {changeRef?.wide ? (
                    <>
                      rispetto al <time dateTime={changeRef.previous}>{formatDateShort(changeRef.previous)}</time>
                    </>
                  ) : (
                    'ultimo giorno'
                  )}{' '}
                  · valore al <time dateTime={last.date}>{formatDateShort(last.date)}</time>
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
            Rendimento % nel periodo, base 0% {compareStart ? `al ${formatDateShort(compareStart)}` : 'a inizio periodo'}.
            Benchmark: {benchmark.name}
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
                <dt>
                  Volatilità annua (1A{vol ? `, ${FREQUENCY_DATA_LABEL[vol.frequency]}` : ''})
                </dt>
                <dd className="num">{vol === undefined ? '—' : formatPercent(vol.value, 1)}</dd>
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
        <p className="small text-2 fd-gs-note" role="note">
          Rendimento lordo annuo certificato della gestione. Il rendimento riconosciuto al cliente dipende dalle
          condizioni di polizza (es. trattenuta o rendimento minimo).
        </p>
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
/** Periodi nascosti quando la tabella di confronto non sta nella card (restano nel dettaglio del fondo). */
const LOW_PRIORITY_PERIODS = new Set<ChangePeriod>(['3M', '6M'])
const periodClass = (p: ChangePeriod) => (LOW_PRIORITY_PERIODS.has(p) ? 'fd-col-low' : undefined)

/**
 * Intestazione della colonna di periodo. `wideLast`: per almeno una riga l'ultima variazione copre più di 4 giorni
 * (dati settimanali o mensili): la colonna "1g" diventa "Ult. dato".
 */
function periodHeader(p: ChangePeriod, wideLast = false): { short: string; long: string } {
  if (p === '1G')
    return wideLast
      ? { short: 'Ult. dato', long: 'Variazione rispetto al valore precedente (per i dati settimanali o mensili non è di un giorno)' }
      : { short: '1g', long: 'Variazione ultimo giorno' }
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

function CompareSection({
  funds,
  demoHidden,
  onSelect,
  onImport,
}: {
  funds: Instrument[]
  /** true se l'utente ha nascosto i fondi dimostrativi. */
  demoHidden: boolean
  onSelect(id: string): void
  onImport(): void
}) {
  const [sort, onSort] = useSort()
  const rows = sortInstruments(funds, sort.key, sort.dir, compareValue)
  const hasDemo = funds.some((f) => f.source === 'demo')
  const wideLast = hasWideLastChange(funds)
  return (
    <Card
      id="fd-compare"
      className="fd-card"
      title="Confronto fondi"
      badge={hasDemo ? <DemoBadge /> : undefined}
      subtitle="Valore quota e variazioni per periodo. Seleziona un’intestazione per ordinare."
    >
      {funds.length === 0 ? (
        <EmptyState
          icon={FileUp}
          title="Nessun fondo da mostrare"
          text={`${demoHidden ? 'I fondi dimostrativi sono nascosti. ' : ''}Importa i valori quota ufficiali dei tuoi fondi per confrontarli qui.`}
          action={
            <button type="button" className="btn btn-primary fd-tap" onClick={onImport} aria-haspopup="dialog">
              <FileUp size={16} aria-hidden="true" />
              Importa valori
            </button>
          }
        />
      ) : (
        <TableScroll className="fd-compare-wrap">
          <table className="table fd-table fd-sticky-first">
            <caption className="visually-hidden">Confronto dei fondi: valore quota e variazioni per periodo</caption>
            <thead>
              <tr>
                <SortHeader label="Fondo" sortKey="name" sort={sort} onSort={onSort} className="fd-col-name" />
                <SortHeader label="Valore quota" sortKey="value" sort={sort} onSort={onSort} numeric />
                {COMPARE_PERIODS.map((p) => {
                  const h = periodHeader(p, wideLast)
                  return (
                    <SortHeader
                      key={p}
                      label={h.short}
                      title={h.long}
                      sortKey={p}
                      sort={sort}
                      onSort={onSort}
                      numeric
                      className={periodClass(p)}
                    />
                  )
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
                          <span className="xsmall muted fd-fund-meta">
                            <SourceTag source={f.source} />
                            {f.category}
                          </span>
                        </div>
                      </div>
                    </th>
                    <td className="num">
                      <span className="fd-value">{formatLastValue(f)}</span>
                      {gs && <span className="fd-caption">rendimento {lastYieldYear(f)}</span>}
                    </td>
                    {COMPARE_PERIODS.map((p) => (
                      <td key={p} className={['num', periodClass(p)].filter(Boolean).join(' ')}>
                        {gs ? (
                          <NotApplicable title="Rendimento annuo certificato: nessuna variazione giornaliera o di periodo" />
                        ) : p === '1G' ? (
                          <LastChangeCell instrument={f} variant="text" />
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
        </TableScroll>
      )}
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
  const demo = markets.filter((m) => m.source === 'demo')
  const demoAsOf = latestDate(demo)
  const wideLast = hasWideLastChange(markets)
  return (
    <Card
      id="fd-markets"
      className="fd-card"
      title="Mercati"
      badge={demo.length > 0 ? <DemoBadge /> : undefined}
      subtitle={
        <>
          {demo.length > 0 && (
            <strong className="fd-markets-demo">
              Valori simulati a scopo dimostrativo{demoAsOf ? `, fermi al ${formatDateShort(demoAsOf)}` : ''}: non sono
              quotazioni reali.{' '}
            </strong>
          )}
          Indici, tassi, spread e cambi. Tassi e spread: variazioni in punti base (pb). Per i tassi la variazione non è
          colorata (un rialzo non è di per sé né positivo né negativo); per lo spread un aumento è in rosso.
        </>
      }
    >
      {markets.length === 0 ? (
        <p className="muted small">Nessun indice disponibile.</p>
      ) : (
        <>
          <TableScroll className="fd-only-wide">
            <table className="table fd-table">
              <caption className="visually-hidden">Mercati: valore e variazioni</caption>
              <thead>
                <tr>
                  <SortHeader label="Nome" sortKey="name" sort={sort} onSort={onSort} />
                  <th scope="col" className="fd-col-type">
                    Tipo
                  </th>
                  <SortHeader label="Valore" sortKey="value" sort={sort} onSort={onSort} numeric />
                  {MARKET_PERIODS.map((p) => {
                    const h = periodHeader(p, wideLast)
                    return <SortHeader key={p} label={h.short} title={h.long} sortKey={p} sort={sort} onSort={onSort} numeric />
                  })}
                  <th scope="col" className="fd-col-trend">
                    Trend 30g
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <th scope="row" className="fd-row-head">
                      <span className="fd-row-name">
                        <SelectLink instrument={m} onSelect={onSelect} />
                        <SourceTag source={m.source} />
                      </span>
                    </th>
                    <td className="muted small fd-col-type">{INSTRUMENT_GROUP_LABEL[m.group]}</td>
                    <td className="num">{formatLastValue(m)}</td>
                    {MARKET_PERIODS.map((p) => (
                      <td key={p} className="num">
                        {p === '1G' ? (
                          <LastChangeCell instrument={m} variant="text" />
                        ) : (
                          <ChangeCell info={instrumentChange(m, p)} variant="text" />
                        )}
                      </td>
                    ))}
                    <td className="fd-col-trend">
                      <MarketTrend instrument={m} width={72} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          <ul className="fd-mcards fd-only-narrow" aria-label="Mercati">
            {rows.map((m) => (
              <li key={m.id} className="fd-mcard">
                <div className="fd-mcard-head">
                  <div className="fd-mcard-name">
                    <SelectLink instrument={m} onSelect={onSelect} />
                    <span className="xsmall muted fd-fund-meta">
                      <SourceTag source={m.source} />
                      {INSTRUMENT_GROUP_LABEL[m.group]}
                    </span>
                  </div>
                  <MarketTrend instrument={m} width={64} />
                </div>
                <div className="fd-mcard-value">
                  <span className="num strong">{formatLastValue(m)}</span>
                  <LastChangeCell instrument={m} />
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
            ))}
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

/** Sparkline degli ultimi 30 giorni di calendario; "—" se ci sono meno di 3 valori (es. dati mensili). */
function MarketTrend({ instrument, width }: { instrument: Instrument; width: number }) {
  const values = trendValues(instrument.series)
  if (!values) return <NotApplicable title="Meno di 3 valori negli ultimi 30 giorni" srText="andamento 30 giorni non disponibile" />
  return (
    <Sparkline
      values={values}
      width={width}
      height={24}
      label={trend(values)}
      invert={risingIsBad(instrument)}
      neutral={instrument.unit === 'pct'}
    />
  )
}

// ---------------------------------------------------------------- dati importati

function ImportedSection({ imports, onImport }: { imports: Instrument[]; onImport(): void }) {
  const { updateImports } = useMarket()
  const toast = useToast()

  const failMessage = (reason: 'quota' | 'unavailable' | 'error') =>
    reason === 'unavailable' ? 'Archiviazione del browser non disponibile: modifica non salvata.' : 'Modifica non salvata: riprova.'

  /** Ogni modifica parte dalle serie salvate più recenti (anche quelle importate in un'altra scheda). */
  const removeWithUndo = (ids: string[], message: string) => {
    let removed: RemovedImport[] = []
    const result = updateImports((latest) => {
      const r = removeImports(latest, ids)
      removed = r.removed
      return r.next
    })
    if (!result.ok) {
      toast({ message: failMessage(result.reason) })
      return
    }
    const undo = () => {
      const restored = updateImports((latest) => restoreImports(latest, removed))
      if (!restored.ok) toast({ message: failMessage(restored.reason) })
    }
    toast(removed.length > 0 ? { message, actionLabel: 'Annulla', onAction: undo } : { message })
  }

  const remove = (target: Instrument) => removeWithUndo([target.id], `Valori importati di «${target.name}» rimossi`)

  const removeAll = () => {
    if (!window.confirm(`Rimuovere tutti i valori importati (${plural(imports.length, 'serie', 'serie')})? Torneranno i valori dimostrativi.`)) return
    removeWithUndo(
      imports.map((i) => i.id),
      'Valori importati rimossi',
    )
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
            Importa valori
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
                        {first.date === last.date
                          ? `il ${formatDateShort(last.date)}`
                          : `dal ${formatDateShort(first.date)} al ${formatDateShort(last.date)}`}
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
