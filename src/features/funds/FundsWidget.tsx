import { ChevronRight, CircleAlert, FileUp, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { LineChart, type LineSeries } from '../../components/charts/LineChart'
import { Sparkline } from '../../components/charts/Sparkline'
import { Card } from '../../components/ui/Card'
import { DemoBadge } from '../../components/ui/DemoBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Segmented } from '../../components/ui/Segmented'
import { PERIOD_LABEL, PERIODS } from '../../domain/labels'
import type { Instrument, PerformancePeriod } from '../../domain/types'
import { sliceSeries } from '../../lib/finance'
import { formatCurrency, formatDateShort, formatPercent } from '../../lib/format'
import { buildHref } from '../../router/router'
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
} from './FundBits'
import {
  effectiveSelection,
  hasWideLastChange,
  instrumentChange,
  isGestioneSeparata,
  latestDate,
  loadFundsSelection,
  MAX_CHART_FUNDS,
  rebaseAtCommonStart,
  saveFundsSelection,
  stepDecimals,
  trendValues,
} from './fundsLogic'
import { ImportPricesModal } from './ImportPricesModal'
import './funds.css'

type ChartMode = 'valore' | 'pct'

const PERIOD_OPTIONS = PERIODS.map((p) => ({ value: p, label: p, title: PERIOD_LABEL[p] }))
const MODE_OPTIONS: { value: ChartMode; label: string }[] = [
  { value: 'valore', label: 'Valore quota' },
  { value: 'pct', label: 'Rendimento %' },
]

const formatPct = (v: number) => formatPercent(v, 2, true)
const formatPctTick = (v: number, step: number) => formatPercent(v, stepDecimals(step), true)
const formatNav = (v: number) => formatCurrency(v, 3)
const formatNavTick = (v: number, step: number) => formatCurrency(v, Math.max(2, stepDecimals(step)))

/** Home: andamento dei fondi (grafico di confronto) e tabella con valori quota, variazioni e rischio. */
export function FundsWidget() {
  const { status, reload } = useMarket()
  const { funds, demoFundCount, mixedFunds, showDemo } = useFundsView()
  const isMobile = useIsMobile()
  const [period, setPeriod] = useState<PerformancePeriod>('1A')
  const [stored, setStored] = useState<string[] | null>(() => loadFundsSelection())
  const [singleMode, setSingleMode] = useState<ChartMode>('valore')
  const [importOpen, setImportOpen] = useState(false)

  const chartable = useMemo(() => funds.filter((f) => f.group === 'fondo'), [funds])
  const selected = useMemo(() => effectiveSelection(stored, chartable), [stored, chartable])
  const mode: ChartMode = selected.length === 1 ? singleMode : 'pct'
  const hasDemo = funds.some((f) => f.source === 'demo')
  // data dei fondi mostrati qui (non degli indici): è quella che l'utente si aspetta di leggere
  const asOf = useMemo(() => latestDate(funds), [funds])

  // in rendimento % tutte le serie partono da 0% alla stessa data (la più recente tra i loro inizi)
  const chart = useMemo(() => {
    const shown = chartable.filter((f) => selected.includes(f.id))
    const slices = shown.map((f) => sliceSeries(f.series, period))
    const rebased = mode === 'pct' ? rebaseAtCommonStart(slices) : undefined
    const series: LineSeries[] = shown.map((f, i) => ({
      id: f.id,
      label: f.name,
      colorIndex: f.colorIndex,
      points: rebased ? rebased.series[i] : slices[i],
    }))
    return { series, start: rebased?.start }
  }, [chartable, selected, period, mode])
  const chartSeries = chart.series

  const toggle = (id: string) => {
    let next: string[]
    if (selected.includes(id)) next = selected.filter((x) => x !== id)
    else if (selected.length >= MAX_CHART_FUNDS) return
    else next = [...selected, id]
    setStored(next)
    saveFundsSelection(next)
  }

  const periodStartDate = chart.start
  // l'interruttore serve solo se ci sono fondi dimostrativi (resta visibile anche dopo l'uso: il focus non si perde)
  const showToggle = status === 'ready' && demoFundCount > 0

  let body
  if (status === 'loading') {
    body = <WidgetSkeleton />
  } else if (status === 'error') {
    body = (
      <div className="fd-error" role="alert">
        <CircleAlert size={18} aria-hidden="true" />
        <span className="grow">Valori dei fondi non disponibili al momento.</span>
        <button type="button" className="btn btn-sm fd-tap" onClick={reload}>
          <RefreshCw size={14} aria-hidden="true" />
          Riprova
        </button>
      </div>
    )
  } else if (funds.length === 0) {
    body = (
      <EmptyState
        icon={FileUp}
        title="Nessun fondo da mostrare"
        text={
          demoFundCount > 0 && !showDemo
            ? 'I fondi dimostrativi sono nascosti. Importa i valori quota ufficiali dei tuoi fondi per seguirli qui.'
            : 'Importa i valori quota ufficiali dei tuoi fondi per seguirli qui.'
        }
        action={
          <button type="button" className="btn btn-primary fd-tap" onClick={() => setImportOpen(true)} aria-haspopup="dialog">
            <FileUp size={16} aria-hidden="true" />
            Importa valori
          </button>
        }
      />
    )
  } else {
    body = (
      <>
        <div className="fd-chart-head">
          {selected.length === 1 ? (
            <Segmented<ChartMode> options={MODE_OPTIONS} value={singleMode} onChange={setSingleMode} ariaLabel="Unità del grafico" />
          ) : (
            <p className="xsmall muted">
              {selected.length > 1 ? 'Rendimento % nel periodo' : 'Nessun fondo selezionato'}
              {selected.length > 1 && periodStartDate && <> · base 0% al {formatDateShort(periodStartDate)}</>}
            </p>
          )}
        </div>
        <LineChart
          series={chartSeries}
          formatValue={mode === 'pct' ? formatPct : formatNav}
          formatTick={mode === 'pct' ? formatPctTick : formatNavTick}
          ariaLabel={`Andamento ${PERIOD_LABEL[period].toLowerCase()} di ${chartSeries.map((s) => s.label).join(', ') || 'nessun fondo'}${mode === 'pct' ? ', rendimento percentuale' : ', valore quota'}`}
          height={isMobile ? 200 : 240}
          emptyText="Seleziona almeno un fondo nella tabella per vederne l’andamento."
        />
        <p className="xsmall muted fd-hint" id="fd-widget-hint">
          Spunta fino a {MAX_CHART_FUNDS} fondi da confrontare nel grafico.
        </p>
        <FundsTable funds={funds} period={period} selected={selected} onToggle={toggle} markDemo={mixedFunds} />
        <FundsMobileList funds={funds} period={period} selected={selected} onToggle={toggle} markDemo={mixedFunds} />
      </>
    )
  }

  return (
    <Card
      id="fd-widget"
      className="fd-card fd-widget"
      title="Andamento fondi"
      badge={hasDemo ? <DemoBadge /> : undefined}
      subtitle={asOf && status === 'ready' ? `Aggiornato al ${formatDateShort(asOf)}` : undefined}
      actions={
        <>
          <Segmented<PerformancePeriod> options={PERIOD_OPTIONS} value={period} onChange={setPeriod} ariaLabel="Periodo" />
          <a className="card-link fd-more" href={buildHref('fondi')}>
            Dettagli
            <ChevronRight size={14} aria-hidden="true" />
          </a>
        </>
      }
      footer={showToggle ? <ShowDemoToggle className="fd-demo-toggle" /> : undefined}
    >
      {body}
      <ImportPricesModal open={importOpen} onClose={() => setImportOpen(false)} />
    </Card>
  )
}

interface ListProps {
  funds: Instrument[]
  period: PerformancePeriod
  selected: string[]
  onToggle(id: string): void
  /** true se ci sono fondi dimostrativi e importati insieme: i dimostrativi hanno l'etichetta "Demo". */
  markDemo: boolean
}

/** Variazione di periodo: la gestione separata ha solo il rendimento annuo (si vede nel dettaglio). */
function PeriodChange({ fund, period, variant }: { fund: Instrument; period: PerformancePeriod; variant?: 'pill' | 'text' }) {
  if (isGestioneSeparata(fund))
    return <NotApplicable title="Rendimento annuo: vedi dettaglio" srText="non applicabile: rendimento annuo, vedi dettaglio" />
  return <ChangeCell info={instrumentChange(fund, period)} variant={variant} />
}

/** Sparkline degli ultimi 30 giorni; "—" se non ci sono abbastanza punti (dati mensili) o per la gestione separata. */
function Trend({ fund, width }: { fund: Instrument; width: number }) {
  const values = isGestioneSeparata(fund) ? undefined : trendValues(fund.series)
  if (!values)
    return (
      <NotApplicable
        title={isGestioneSeparata(fund) ? 'Rendimento annuo: vedi dettaglio' : 'Meno di 3 valori negli ultimi 30 giorni'}
        srText="andamento 30 giorni non disponibile"
      />
    )
  return <Sparkline values={values} width={width} height={24} label={trendLabel(values, 'Andamento 30 giorni')} />
}

function ChartToggle({ fund, selected, onToggle }: { fund: Instrument; selected: string[]; onToggle(id: string): void }) {
  const checked = selected.includes(fund.id)
  const disabled = !checked && selected.length >= MAX_CHART_FUNDS
  return (
    <label className="fd-check" title={disabled ? `Massimo ${MAX_CHART_FUNDS} fondi nel grafico` : undefined}>
      <input
        type="checkbox"
        className="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => onToggle(fund.id)}
        aria-describedby="fd-widget-hint"
      />
      <span className="visually-hidden">Mostra {fund.name} nel grafico</span>
    </label>
  )
}

function trendLabel(values: number[], what: string): string {
  if (values.length < 2) return what
  return `${what}: ${values[values.length - 1] >= values[0] ? 'in crescita' : 'in calo'}`
}

function FundsTable({ funds, period, selected, onToggle, markDemo }: ListProps) {
  const wide = hasWideLastChange(funds)
  return (
    <TableScroll className="fd-only-wide">
      <table className="table fd-table">
        <caption className="visually-hidden">Fondi: valore quota, variazioni e rischio</caption>
        <thead>
          <tr>
            <th scope="col" className="fd-col-check">
              <span className="visually-hidden">Mostra nel grafico</span>
            </th>
            <th scope="col">Fondo</th>
            <th scope="col" className="fd-col-risk">
              Rischio
            </th>
            <th scope="col" className="num">
              Valore quota
            </th>
            <th scope="col" className="num fd-col-last">
              {wide ? (
                <abbr title="Variazione rispetto al valore precedente: per i dati settimanali o mensili non è di un giorno">
                  Var. ultimo dato
                </abbr>
              ) : (
                <abbr title="Variazione rispetto al giorno precedente">Var. 1g</abbr>
              )}
            </th>
            <th scope="col" className="num">
              <abbr title={`Variazione ${PERIOD_LABEL[period].toLowerCase()}`}>Var. {period}</abbr>
            </th>
            <th scope="col" className="fd-col-trend">
              Trend 30g
            </th>
          </tr>
        </thead>
        <tbody>
          {funds.map((f) => {
            const gs = isGestioneSeparata(f)
            return (
              <tr key={f.id}>
                <td className="fd-col-check">{!gs && <ChartToggle fund={f} selected={selected} onToggle={onToggle} />}</td>
                <td>
                  <div className="fd-fund">
                    <SeriesDot colorIndex={f.colorIndex} />
                    <div className="fd-fund-text">
                      <a className="fd-fund-name" href={buildHref('fondi', { id: f.id })}>
                        {f.name}
                      </a>
                      {(f.category || (markDemo && f.source === 'demo')) && (
                        <span className="xsmall muted fd-fund-meta">
                          {markDemo && f.source === 'demo' && <SourceTag source="demo" />}
                          {f.category}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="fd-col-risk">
                  <SriMeter value={f.sri} />
                </td>
                <td className="num">
                  <span className="fd-value">{formatLastValue(f)}</span>
                  {gs && <span className="fd-caption">rendimento {lastYieldYear(f)}</span>}
                </td>
                <td className="num">
                  {gs ? (
                    <NotApplicable title="Rendimento annuo certificato" srText="non applicabile: rendimento annuo certificato" />
                  ) : (
                    <LastChangeCell instrument={f} variant="text" />
                  )}
                </td>
                <td className="num">
                  <PeriodChange fund={f} period={period} />
                </td>
                <td className="fd-col-trend">
                  <Trend fund={f} width={72} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableScroll>
  )
}

function FundsMobileList({ funds, period, selected, onToggle, markDemo }: ListProps) {
  return (
    <ul className="fd-mlist fd-only-narrow" aria-label="Fondi">
      {funds.map((f) => {
        const gs = isGestioneSeparata(f)
        return (
          <li key={f.id} className="fd-mitem">
            <div className="fd-mitem-check">{!gs && <ChartToggle fund={f} selected={selected} onToggle={onToggle} />}</div>
            <div className="fd-mitem-main">
              <div className="fd-mitem-title">
                <SeriesDot colorIndex={f.colorIndex} />
                <a className="fd-fund-name" href={buildHref('fondi', { id: f.id })}>
                  {f.name}
                </a>
              </div>
              <div className="fd-mitem-sub xsmall muted">
                {markDemo && f.source === 'demo' && <SourceTag source="demo" />}
                {[f.category, f.sri ? `Rischio ${f.sri}/7` : undefined].filter(Boolean).join(' · ')}
              </div>
              <div className="fd-mitem-values">
                <span className="fd-mitem-nav num">
                  {formatLastValue(f)}
                  {gs && <span className="fd-caption"> rendimento {lastYieldYear(f)}</span>}
                </span>
                {!gs && (
                  <>
                    <span className="fd-mitem-change">
                      <span className="visually-hidden">Variazione {period}: </span>
                      <PeriodChange fund={f} period={period} />
                    </span>
                    <span className="fd-mitem-spark">
                      <Trend fund={f} width={64} />
                    </span>
                  </>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function WidgetSkeleton() {
  return (
    <div className="fd-skeleton" aria-busy="true" aria-label="Caricamento dei fondi">
      <span className="skeleton fd-skel-chart" />
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className="fd-skel-row">
          <span className="skeleton fd-skel-name" />
          <span className="skeleton fd-skel-val" />
          <span className="skeleton fd-skel-val" />
        </span>
      ))}
    </div>
  )
}
