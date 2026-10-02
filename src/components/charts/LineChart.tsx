/**
 * Grafico a linee in SVG scritto a mano (nessuna libreria): assi con tacche "rotonde", griglia orizzontale,
 * mirino con tooltip al passaggio del mouse / al tocco, navigazione da tastiera con annuncio vocale,
 * legenda e tabella dei dati accessibile.
 * Le serie possono avere date diverse (es. fondo e benchmark): l'asse X è temporale sull'unione delle date.
 */
import { useCallback, useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { DateKey, PricePoint } from '../../domain/types'
import { addDays, dayNumber, diffDays, parseKey, startOfMonth, startOfWeek } from '../../lib/dates'
import { pointOnOrBefore } from '../../lib/finance'
import {
  formatDateLong,
  formatDateShort,
  formatDayMonth,
  formatMonthShort,
  formatMonthShortYear,
} from '../../lib/format'
import './charts.css'

export interface LineSeries {
  id: string
  label: string
  /** Indice palette 1..8 → var(--series-N). */
  colorIndex: number
  points: PricePoint[]
  /** Linea tratteggiata (es. benchmark). */
  dashed?: boolean
}

export interface LineChartProps {
  series: LineSeries[]
  /** Formattazione dei valori su asse Y e tooltip. */
  formatValue(value: number): string
  /** Descrizione per lettori di schermo. */
  ariaLabel: string
  height?: number
  /** Etichette dell'asse Y (default: `formatValue`). `step` è la distanza tra due tacche. */
  formatTick?(value: number, step: number): string
  /** Nasconde il pulsante "Mostra tabella". */
  hideTable?: boolean
  /** Testo mostrato quando non ci sono dati. */
  emptyText?: string
}

const PAD_TOP = 10
const PAD_BOTTOM = 28
const PAD_RIGHT = 14
const TICK_FONT_PX = 11
/** Larghezza media stimata di un carattere a 11px (cifre tabulari). */
const CHAR_W = 6.4
const MAX_TABLE_ROWS = 24

/** Colore della serie: sempre una variabile della palette (1..8). */
export function seriesColor(colorIndex: number): string {
  const n = Number.isFinite(colorIndex) ? Math.round(colorIndex) : 1
  return `var(--series-${(((n - 1) % 8) + 8) % 8 + 1})`
}

// ---------------------------------------------------------------- scale

/** Tacche "rotonde" (1 / 2 / 2,5 / 5 × 10^n) che coprono [min, max]: al massimo `maxCount`. */
export function niceTicks(min: number, max: number, maxCount = 5): { ticks: number[]; step: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0, 1], step: 1 }
  let lo = Math.min(min, max)
  let hi = Math.max(min, max)
  if (hi - lo < 1e-12) {
    const pad = Math.abs(lo) * 0.01 || 1
    lo -= pad
    hi += pad
  }
  const raw = (hi - lo) / Math.max(1, maxCount - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  for (const decade of [mag, mag * 10]) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * decade
      const first = Math.floor(lo / step + 1e-9) * step
      const last = Math.ceil(hi / step - 1e-9) * step
      const count = Math.round((last - first) / step) + 1
      if (count <= maxCount) {
        const ticks = Array.from({ length: count }, (_, i) => Number((first + i * step).toFixed(12)))
        return { ticks, step }
      }
    }
  }
  return { ticks: [lo, hi], step: hi - lo }
}

export interface TimeTick {
  date: DateKey
  label: string
}

/**
 * Tacche dell'asse temporale scelte in base all'ampiezza del periodo:
 * giorni ("2 ott") fino a 3 mesi, mesi ("gen") fino a 13 mesi, mesi con anno ("gen 25") oltre.
 */
export function timeTicks(first: DateKey, last: DateKey, maxTicks = 6): TimeTick[] {
  const span = diffDays(first, last)
  const limit = Math.max(2, maxTicks)
  if (span <= 0) return [{ date: first, label: formatDayMonth(first) }]
  if (span <= 92) {
    const step = [1, 2, 3, 7, 14, 21, 28, 42].find((s) => Math.floor(span / s) + 1 <= limit) ?? 42
    const out: TimeTick[] = []
    for (let d = first; d <= last; d = addDays(d, step)) out.push({ date: d, label: formatDayMonth(d) })
    return out
  }
  const withYear = span > 400
  // primi del mese compresi nel periodo
  const starts: DateKey[] = []
  let m = parseKey(first).day === 1 ? first : startOfMonth(addDays(startOfMonth(first), 32))
  while (m <= last) {
    starts.push(m)
    m = startOfMonth(addDays(m, 32))
  }
  for (const step of [1, 2, 3, 6, 12, 24]) {
    const picked = starts.filter((d) => {
      const { year, month } = parseKey(d)
      return step === 24 ? month === 1 && year % 2 === 0 : (month - 1) % step === 0
    })
    if (picked.length <= limit && picked.length > 0) {
      return picked.map((d) => ({
        date: d,
        label: withYear || parseKey(d).month === 1 ? formatMonthShortYear(d) : formatMonthShort(d),
      }))
    }
  }
  return [first, last].map((d) => ({ date: d, label: formatMonthShortYear(d) }))
}

/**
 * Date da mostrare nella tabella dei dati (≤ `max` righe): tutte se poche, altrimenti
 * la prima più le fine mese (o le fine settimana per periodi brevi), diradate se serve.
 */
export function sampleDates(dates: DateKey[], max = MAX_TABLE_ROWS): DateKey[] {
  if (dates.length <= max) return dates
  const lastOfGroups = (groupOf: (d: DateKey) => string) => {
    const out: DateKey[] = []
    for (let i = 0; i < dates.length; i++) {
      if (i === dates.length - 1 || groupOf(dates[i]) !== groupOf(dates[i + 1])) out.push(dates[i])
    }
    return out
  }
  const months = lastOfGroups((d) => d.slice(0, 7))
  let picked = months.length >= 4 ? months : lastOfGroups((d) => startOfWeek(d))
  if (picked[0] !== dates[0]) picked = [dates[0], ...picked]
  if (picked.length > max) {
    const k = Math.ceil(picked.length / max)
    const n = picked.length
    picked = picked.filter((_, i) => (n - 1 - i) % k === 0)
  }
  return picked
}

// ---------------------------------------------------------------- dati

interface Prepared {
  dates: DateKey[]
  dayNums: number[]
  lookups: Map<DateKey, number>[]
  min: number
  max: number
  empty: boolean
}

function prepare(series: LineSeries[]): Prepared {
  const all = new Set<DateKey>()
  let min = Infinity
  let max = -Infinity
  const lookups = series.map((s) => {
    const map = new Map<DateKey, number>()
    for (const p of s.points) {
      if (!Number.isFinite(p.value)) continue
      map.set(p.date, p.value)
      all.add(p.date)
      if (p.value < min) min = p.value
      if (p.value > max) max = p.value
    }
    return map
  })
  const dates = [...all].sort()
  return { dates, dayNums: dates.map(dayNumber), lookups, min, max, empty: dates.length === 0 }
}

/** Valore della serie a una data: esatto, oppure l'ultimo precedente se la data è dentro la serie. */
function valueAt(s: LineSeries, lookup: Map<DateKey, number>, date: DateKey): number | undefined {
  const exact = lookup.get(date)
  if (exact !== undefined) return exact
  const first = s.points[0]?.date
  const last = s.points[s.points.length - 1]?.date
  if (!first || !last || date < first || date > last) return undefined
  return pointOnOrBefore(s.points, date)?.value
}

function nearestIndex(xs: number[], x: number): number {
  let lo = 0
  let hi = xs.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xs[mid] < x) lo = mid
    else hi = mid
  }
  return Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi
}

// ---------------------------------------------------------------- componente

export function LineChart({
  series,
  formatValue,
  ariaLabel,
  height = 240,
  formatTick,
  hideTable = false,
  emptyText = 'Nessun dato disponibile per il periodo selezionato.',
}: LineChartProps) {
  const uid = useId()
  const tableId = `${uid}-table`
  const hintId = `${uid}-hint`
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [showTable, setShowTable] = useState(false)

  // Larghezza del contenitore: aggiornata dal ResizeObserver (mai durante il render).
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (!node || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0)
      setWidth((prev) => (prev === w ? prev : w))
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  const data = useMemo(() => prepare(series), [series])
  const { dates, dayNums, lookups } = data

  // Asse Y
  const { ticks: yTicks, step: yStep } = niceTicks(data.min, data.max, height < 180 ? 4 : 5)
  const tickFormatter = formatTick ?? ((v: number) => formatValue(v))
  const yLabels = yTicks.map((t) => tickFormatter(t, yStep))
  const yMin = yTicks[0]
  const yMax = yTicks[yTicks.length - 1]
  const plotLeft = Math.ceil(Math.max(...yLabels.map((l) => l.length), 3) * CHAR_W) + 12
  const plotRight = Math.max(plotLeft + 10, width - PAD_RIGHT)
  const plotTop = PAD_TOP
  const plotBottom = height - PAD_BOTTOM
  const d0 = dayNums[0] ?? 0
  const d1 = dayNums[dayNums.length - 1] ?? 1

  const geometry = useMemo(() => {
    const spanDays = d1 - d0
    const xOf = (dn: number) => (spanDays <= 0 ? (plotLeft + plotRight) / 2 : plotLeft + ((dn - d0) / spanDays) * (plotRight - plotLeft))
    const yOf = (v: number) => plotBottom - ((v - yMin) / (yMax - yMin || 1)) * (plotBottom - plotTop)
    const xs = dayNums.map(xOf)
    const paths = series.map((s) => {
      const pts = s.points.filter((p) => Number.isFinite(p.value))
      const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(dayNumber(p.date)).toFixed(1)},${yOf(p.value).toFixed(1)}`).join('')
      const firstX = pts.length ? xOf(dayNumber(pts[0].date)) : 0
      const lastX = pts.length ? xOf(dayNumber(pts[pts.length - 1].date)) : 0
      const area = pts.length > 1 ? `${line}L${lastX.toFixed(1)},${plotBottom}L${firstX.toFixed(1)},${plotBottom}Z` : ''
      const single = pts.length === 1 ? { x: firstX, y: yOf(pts[0].value) } : null
      return { line, area, single }
    })
    return { xs, paths, yOf, xOf }
  }, [series, dayNums, d0, d1, plotLeft, plotRight, plotTop, plotBottom, yMin, yMax])

  const plotWidth = plotRight - plotLeft
  const xTicks = data.empty ? [] : timeTicks(dates[0], dates[dates.length - 1], Math.floor(plotWidth / 72))

  const activeIndex = active !== null && active < dates.length ? active : null
  const activeDate = activeIndex !== null ? dates[activeIndex] : undefined
  const activeValues = activeDate ? series.map((s, i) => valueAt(s, lookups[i], activeDate)) : []

  const describe = (index: number) => {
    const date = dates[index]
    const parts = series.map((s, i) => {
      const v = valueAt(s, lookups[i], date)
      return `${s.label} ${v === undefined ? 'non disponibile' : formatValue(v)}`
    })
    return `${formatDateLong(date)}: ${parts.join(', ')}`
  }

  const moveTo = (index: number) => {
    const clamped = Math.max(0, Math.min(dates.length - 1, index))
    setActive(clamped)
    setAnnouncement(describe(clamped))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (data.empty) return
    const current = activeIndex ?? dates.length - 1
    const big = Math.max(1, Math.round(dates.length / 10))
    let next: number | null = null
    switch (e.key) {
      case 'ArrowLeft':
        next = activeIndex === null ? current : current - (e.shiftKey ? big : 1)
        break
      case 'ArrowRight':
        next = activeIndex === null ? current : current + (e.shiftKey ? big : 1)
        break
      case 'PageUp':
        next = current - big
        break
      case 'PageDown':
        next = current + big
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = dates.length - 1
        break
      case 'Escape':
        if (activeIndex !== null) {
          e.preventDefault()
          setActive(null)
        }
        return
      default:
        return
    }
    e.preventDefault()
    moveTo(next)
  }

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    if (data.empty || geometry.xs.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / (rect.width || 1)) * width
    setActive(nearestIndex(geometry.xs, x))
  }

  const tableDates = useMemo(() => sampleDates(dates), [dates])

  if (data.empty) {
    return (
      <div className="fd-chart">
        <div className="fd-chart-empty" style={{ minHeight: height }}>
          <p>{emptyText}</p>
        </div>
      </div>
    )
  }

  const activeX = activeIndex !== null ? geometry.xs[activeIndex] : 0
  const tooltipOnLeft = activeX > width / 2
  const singleSeries = series.length === 1

  return (
    <div className="fd-chart">
      <div className="fd-chart-top">
        <ul className="fd-chart-legend" aria-label="Legenda">
          {series.map((s) => (
            <li key={s.id}>
              <svg width="18" height="8" aria-hidden="true" className="fd-chart-swatch">
                <line
                  x1="1"
                  y1="4"
                  x2="17"
                  y2="4"
                  stroke={seriesColor(s.colorIndex)}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={s.dashed ? '4 3' : undefined}
                />
              </svg>
              <span>{s.label}</span>
              {s.dashed && <span className="visually-hidden"> (linea tratteggiata)</span>}
            </li>
          ))}
        </ul>
        {!hideTable && (
          <button
            type="button"
            className="btn btn-ghost btn-sm fd-chart-table-btn"
            aria-expanded={showTable}
            aria-controls={tableId}
            onClick={() => setShowTable((v) => !v)}
          >
            {showTable ? 'Nascondi tabella' : 'Mostra tabella'}
          </button>
        )}
      </div>

      <div
        ref={measureRef}
        className="fd-chart-plot"
        style={{ height }}
        tabIndex={0}
        role="group"
        aria-label={`${ariaLabel}. Grafico interattivo`}
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        <span id={hintId} className="visually-hidden">
          Usa le frecce sinistra e destra per scorrere le date, Inizio e Fine per andare al primo o all’ultimo valore.
        </span>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={ariaLabel}
            className="fd-chart-svg"
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse') setActive(null)
            }}
          >
            {/* griglia e asse Y */}
            <g className="fd-chart-grid">
              {yTicks.map((t, i) => {
                const y = Math.round(geometry.yOf(t)) + 0.5
                return (
                  <g key={t}>
                    <line x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke="var(--grid)" strokeWidth="1" />
                    <text
                      x={plotLeft - 8}
                      y={y}
                      textAnchor="end"
                      dominantBaseline="middle"
                      className="fd-chart-tick"
                      style={{ fontSize: TICK_FONT_PX }}
                    >
                      {yLabels[i]}
                    </text>
                  </g>
                )
              })}
            </g>

            {/* asse X */}
            <g>
              {xTicks.map((t) => {
                const x = geometry.xOf(dayNumber(t.date))
                const w = t.label.length * CHAR_W
                const anchor = x - w / 2 < 2 ? 'start' : x + w / 2 > width - 2 ? 'end' : 'middle'
                return (
                  <text
                    key={t.date}
                    x={anchor === 'start' ? Math.max(2, x - 4) : anchor === 'end' ? Math.min(width - 2, x + 4) : x}
                    y={plotBottom + 18}
                    textAnchor={anchor}
                    className="fd-chart-tick"
                    style={{ fontSize: TICK_FONT_PX }}
                  >
                    {t.label}
                  </text>
                )
              })}
            </g>

            {/* area (solo con una serie) e linee */}
            {singleSeries && geometry.paths[0].area && (
              <path d={geometry.paths[0].area} fill={seriesColor(series[0].colorIndex)} fillOpacity={0.1} stroke="none" />
            )}
            {series.map((s, i) => {
              const p = geometry.paths[i]
              const color = seriesColor(s.colorIndex)
              return p.single ? (
                <circle key={s.id} cx={p.single.x} cy={p.single.y} r={4} fill={color} />
              ) : (
                <path
                  key={s.id}
                  d={p.line}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={s.dashed ? '4 3' : undefined}
                />
              )
            })}

            {/* mirino */}
            {activeDate && (
              <g pointerEvents="none">
                <line
                  x1={activeX}
                  x2={activeX}
                  y1={plotTop}
                  y2={plotBottom}
                  stroke="var(--axis)"
                  strokeWidth="1"
                  strokeOpacity="0.6"
                />
                {series.map((s, i) => {
                  const v = activeValues[i]
                  if (v === undefined) return null
                  return (
                    <circle
                      key={s.id}
                      cx={activeX}
                      cy={geometry.yOf(v)}
                      r={4}
                      fill={seriesColor(s.colorIndex)}
                      stroke="var(--surface)"
                      strokeWidth={2}
                    />
                  )
                })}
              </g>
            )}

            {/* area di aggancio per il puntatore (più grande delle linee) */}
            <rect
              x={plotLeft}
              y={0}
              width={Math.max(0, plotWidth)}
              height={plotBottom}
              fill="transparent"
              className="fd-chart-hit"
            />
          </svg>
        )}

        {activeDate && width > 0 && (
          <div
            className="fd-chart-tooltip"
            aria-hidden="true"
            style={
              tooltipOnLeft
                ? { right: Math.max(4, width - activeX + 12), top: plotTop }
                : { left: Math.min(width - 4, activeX + 12), top: plotTop }
            }
          >
            <div className="fd-chart-tooltip-date">{width >= 480 ? formatDateLong(activeDate) : formatDateShort(activeDate)}</div>
            {series.map((s, i) => (
              <div key={s.id} className="fd-chart-tooltip-row">
                <svg width="12" height="8" aria-hidden="true">
                  <line
                    x1="1"
                    y1="4"
                    x2="11"
                    y2="4"
                    stroke={seriesColor(s.colorIndex)}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={s.dashed ? '3 2' : undefined}
                  />
                </svg>
                <span className="fd-chart-tooltip-label">{s.label}</span>
                <span className="fd-chart-tooltip-value">
                  {activeValues[i] === undefined ? '—' : formatValue(activeValues[i])}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="visually-hidden" aria-live="polite">
        {announcement}
      </div>

      {!hideTable && showTable && (
        <div className="table-wrap fd-chart-table-wrap" id={tableId}>
          <table className="table fd-chart-table">
            <caption className="visually-hidden">{ariaLabel}</caption>
            <thead>
              <tr>
                <th scope="col">Data</th>
                {series.map((s) => (
                  <th key={s.id} scope="col" className="num">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableDates.map((d) => (
                <tr key={d}>
                  <th scope="row" className="fd-chart-table-date">
                    <time dateTime={d}>{formatDateShort(d)}</time>
                  </th>
                  {series.map((s, i) => {
                    const v = valueAt(s, lookups[i], d)
                    return (
                      <td key={s.id} className="num">
                        {v === undefined ? '—' : formatValue(v)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {tableDates.length < dates.length && (
            <p className="xsmall muted fd-chart-table-note">
              Valori a fine mese (o fine settimana) e all’inizio del periodo: {tableDates.length} date su {dates.length}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
