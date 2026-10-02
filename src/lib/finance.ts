/** Calcoli di performance sulle serie storiche (valori quota, indici, tassi). */
import type { DateKey, Instrument, PerformancePeriod, PricePoint } from '../domain/types'
import { addMonths, addYears, startOfYear } from './dates'

export function lastPoint(series: PricePoint[]): PricePoint | undefined {
  return series[series.length - 1]
}

/** Ultimo punto con data <= `date` (ricerca binaria su serie ordinata). */
export function pointOnOrBefore(series: PricePoint[], date: DateKey): PricePoint | undefined {
  let lo = 0
  let hi = series.length - 1
  let found: PricePoint | undefined
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (series[mid].date <= date) {
      found = series[mid]
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/** Data di inizio del periodo, calcolata a ritroso dalla data dell'ultimo dato disponibile. */
export function periodStart(period: PerformancePeriod, asOf: DateKey): DateKey {
  switch (period) {
    case '1M':
      return addMonths(asOf, -1)
    case '3M':
      return addMonths(asOf, -3)
    case '6M':
      return addMonths(asOf, -6)
    case '1A':
      return addYears(asOf, -1)
    case '3A':
      return addYears(asOf, -3)
    case 'YTD':
      // riferimento: ultimo valore dell'anno precedente
      return startOfYear(asOf)
  }
}

/** Valore di riferimento a inizio periodo. Per YTD è l'ultimo valore dell'anno precedente. */
function baseValue(series: PricePoint[], period: PerformancePeriod, asOf: DateKey): number | undefined {
  const start = periodStart(period, asOf)
  if (period === 'YTD') {
    const prevYearEnd = pointOnOrBefore(series, `${Number(start.slice(0, 4)) - 1}-12-31`)
    return prevYearEnd?.value
  }
  return pointOnOrBefore(series, start)?.value
}

/** Variazione percentuale nel periodo (es. +3,8 = +3,8%). undefined se la storia non basta. */
export function periodChangePct(series: PricePoint[], period: PerformancePeriod): number | undefined {
  const last = lastPoint(series)
  if (!last) return undefined
  const base = baseValue(series, period, last.date)
  if (base === undefined || base === 0) return undefined
  return (last.value / base - 1) * 100
}

/** Variazione assoluta nel periodo (per tassi e spread, dove la % non ha senso). */
export function periodChangeAbs(series: PricePoint[], period: PerformancePeriod): number | undefined {
  const last = lastPoint(series)
  if (!last) return undefined
  const base = baseValue(series, period, last.date)
  return base === undefined ? undefined : last.value - base
}

/** Variazione dall'ultimo punto al precedente: percentuale e assoluta. */
export function dailyChange(series: PricePoint[]): { pct: number; abs: number } | undefined {
  if (series.length < 2) return undefined
  const a = series[series.length - 2].value
  const b = series[series.length - 1].value
  return { pct: a === 0 ? 0 : (b / a - 1) * 100, abs: b - a }
}

/** Per tassi, spread e gestioni separate conta la variazione assoluta, non quella percentuale. */
export function usesAbsoluteChange(instrument: Pick<Instrument, 'unit'>): boolean {
  return instrument.unit === 'pct' || instrument.unit === 'bp'
}

/** Sottoinsieme della serie dal punto di inizio periodo (incluso il valore base) all'ultimo. */
export function sliceSeries(series: PricePoint[], period: PerformancePeriod): PricePoint[] {
  const last = lastPoint(series)
  if (!last) return []
  const start = periodStart(period, last.date)
  const base = period === 'YTD' ? pointOnOrBefore(series, `${Number(start.slice(0, 4)) - 1}-12-31`) : pointOnOrBefore(series, start)
  const from = base ? base.date : start
  return series.filter((p) => p.date >= from)
}

/** Serie ribasata a 0% sul primo punto: utile per confrontare fondi con valori quota diversi. */
export function rebaseToPct(series: PricePoint[]): PricePoint[] {
  const first = series[0]?.value
  if (!first) return []
  return series.map((p) => ({ date: p.date, value: (p.value / first - 1) * 100 }))
}

/** Ultimi `n` valori, per le sparkline. */
export function tailValues(series: PricePoint[], n: number): number[] {
  return series.slice(-n).map((p) => p.value)
}

/** Volatilità annualizzata (%) dei rendimenti giornalieri. */
export function annualizedVolatility(series: PricePoint[]): number | undefined {
  if (series.length < 3) return undefined
  const rets: number[] = []
  for (let i = 1; i < series.length; i++) rets.push(Math.log(series[i].value / series[i - 1].value))
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1)
  return Math.sqrt(variance * 252) * 100
}

/** Massimo ribasso (%) nel periodo, valore negativo o zero. */
export function maxDrawdown(series: PricePoint[]): number | undefined {
  if (series.length < 2) return undefined
  let peak = series[0].value
  let worst = 0
  for (const p of series) {
    peak = Math.max(peak, p.value)
    worst = Math.min(worst, (p.value / peak - 1) * 100)
  }
  return worst
}
