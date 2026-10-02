import { describe, expect, it } from 'vitest'
import type { PricePoint } from '../domain/types'
import { dailyChange, maxDrawdown, periodChangePct, pointOnOrBefore, rebaseToPct, sliceSeries } from './finance'

const series: PricePoint[] = [
  { date: '2025-09-30', value: 100 },
  { date: '2025-12-31', value: 104 },
  { date: '2026-01-02', value: 105 },
  { date: '2026-06-30', value: 95 },
  { date: '2026-09-01', value: 108 },
  { date: '2026-10-01', value: 110 },
  { date: '2026-10-02', value: 110.55 },
]

describe('finance', () => {
  it('trova il punto alla data o precedente', () => {
    expect(pointOnOrBefore(series, '2026-09-15')?.value).toBe(108)
    expect(pointOnOrBefore(series, '2025-01-01')).toBeUndefined()
  })

  it('variazioni per periodo', () => {
    expect(periodChangePct(series, 'YTD')).toBeCloseTo((110.55 / 104 - 1) * 100, 6)
    expect(periodChangePct(series, '1M')).toBeCloseTo((110.55 / 108 - 1) * 100, 6)
    expect(periodChangePct(series, '1A')).toBeCloseTo(10.55, 6)
    expect(periodChangePct(series, '3A')).toBeUndefined()
  })

  it('variazione giornaliera', () => {
    expect(dailyChange(series)?.pct).toBeCloseTo(0.5, 6)
  })

  it('slice e ribasamento', () => {
    const ytd = sliceSeries(series, 'YTD')
    expect(ytd[0].date).toBe('2025-12-31')
    expect(rebaseToPct(ytd)[0].value).toBe(0)
  })

  it('massimo ribasso', () => {
    expect(maxDrawdown(series)).toBeCloseTo((95 / 105 - 1) * 100, 6)
  })
})
