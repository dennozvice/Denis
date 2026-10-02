import { ChevronRight, CircleAlert, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { LineChart, type LineSeries } from '../../components/charts/LineChart'
import { Sparkline } from '../../components/charts/Sparkline'
import { Card } from '../../components/ui/Card'
import { DemoBadge } from '../../components/ui/DemoBadge'
import { Segmented } from '../../components/ui/Segmented'
import { PERIOD_LABEL, PERIODS } from '../../domain/labels'
import type { Instrument, PerformancePeriod } from '../../domain/types'
import { rebaseToPct, sliceSeries, tailValues } from '../../lib/finance'
import { formatCurrency, formatDateShort, formatPercent } from '../../lib/format'
import { buildHref } from '../../router/router'
import { useMarket } from '../../store/MarketContext'
import { ChangeCell, formatLastValue, lastYieldYear, SeriesDot, SriMeter, TableScroll, useIsMobile } from './FundBits'
import {
  effectiveSelection,
  instrumentChange,
  isGestioneSeparata,
  latestDate,
  loadFundsSelection,
  MAX_CHART_FUNDS,
  risingIsBad,
  saveFundsSelection,
  stepDecimals,
} from './fundsLogic'
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
  const { status, funds, reload } = useMarket()
  const isMobile = useIsMobile()
  const [period, setPeriod] = useState<PerformancePeriod>('1A')
  const [stored, setStored] = useState<string[] | null>(() => loadFundsSelection())
  const [singleMode, setSingleMode] = useState<ChartMode>('valore')

  const chartable = useMemo(() => funds.filter((f) => f.group === 'fondo'), [funds])
  const selected = useMemo(() => effectiveSelection(stored, chartable), [stored, chartable])
  const mode: ChartMode = selected.length === 1 ? singleMode : 'pct'
  const hasDemo = funds.some((f) => f.source === 'demo')
  // data dei fondi mostrati qui (non degli indici): è quella che l'utente si aspetta di leggere
  const asOf = useMemo(() => latestDate(funds), [funds])

  const chartSeries = useMemo<LineSeries[]>(
    () =>
      chartable
        .filter((f) => selected.includes(f.id))
        .map((f) => {
          const sliced = sliceSeries(f.series, period)
          return {
            id: f.id,
            label: f.name,
            colorIndex: f.colorIndex,
            points: mode === 'pct' ? rebaseToPct(sliced) : sliced,
          }
        }),
    [chartable, selected, period, mode],
  )

  const toggle = (id: string) => {
    let next: string[]
    if (selected.includes(id)) next = selected.filter((x) => x !== id)
    else if (selected.length >= MAX_CHART_FUNDS) return
    else next = [...selected, id]
    setStored(next)
    saveFundsSelection(next)
  }

  const periodStartDate = chartSeries.find((s) => s.points.length > 0)?.points[0]?.date

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
    body = <p className="muted small">Nessun fondo disponibile.</p>
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
        <FundsTable funds={funds} period={period} selected={selected} onToggle={toggle} />
        <FundsMobileList funds={funds} period={period} selected={selected} onToggle={toggle} />
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
    >
      {body}
    </Card>
  )
}

interface ListProps {
  funds: Instrument[]
  period: PerformancePeriod
  selected: string[]
  onToggle(id: string): void
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

function FundsTable({ funds, period, selected, onToggle }: ListProps) {
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
            <th scope="col" className="num">
              Var. 1g
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
            const spark = gs ? f.series.map((p) => p.value) : tailValues(f.series, 22)
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
                      {f.category && <span className="xsmall muted">{f.category}</span>}
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
                    <span className="muted" title="Rendimento annuo certificato">
                      <span aria-hidden="true">—</span>
                      <span className="visually-hidden">non applicabile: rendimento annuo certificato</span>
                    </span>
                  ) : (
                    <ChangeCell info={instrumentChange(f, '1G')} variant="text" />
                  )}
                </td>
                <td className="num">
                  <ChangeCell
                    info={instrumentChange(f, period)}
                    title={gs ? 'Variazione rispetto al rendimento dell’anno precedente, in punti percentuali' : undefined}
                  />
                </td>
                <td className="fd-col-trend">
                  <Sparkline
                    values={spark}
                    width={72}
                    height={24}
                    label={trendLabel(spark, gs ? 'Rendimenti annui' : 'Andamento 30 giorni')}
                    invert={risingIsBad(f)}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableScroll>
  )
}

function FundsMobileList({ funds, period, selected, onToggle }: ListProps) {
  return (
    <ul className="fd-mlist fd-only-narrow" aria-label="Fondi">
      {funds.map((f) => {
        const gs = isGestioneSeparata(f)
        const spark = gs ? f.series.map((p) => p.value) : tailValues(f.series, 22)
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
                {[f.category, f.sri ? `Rischio ${f.sri}/7` : undefined].filter(Boolean).join(' · ')}
              </div>
              <div className="fd-mitem-values">
                <span className="fd-mitem-nav num">
                  {formatLastValue(f)}
                  {gs && <span className="fd-caption"> rendimento {lastYieldYear(f)}</span>}
                </span>
                <span className="fd-mitem-change">
                  <span className="visually-hidden">{gs ? 'Rispetto all’anno precedente: ' : `Variazione ${period}: `}</span>
                  <ChangeCell info={instrumentChange(f, period)} />
                </span>
                <span className="fd-mitem-spark">
                  <Sparkline
                    values={spark}
                    width={64}
                    height={24}
                    label={trendLabel(spark, gs ? 'Rendimenti annui' : 'Andamento 30 giorni')}
                    invert={risingIsBad(f)}
                  />
                </span>
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
