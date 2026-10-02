import { describe, expect, it } from 'vitest'
import { isWeekend } from '../../lib/dates'
import { buildDemoInstruments } from './demoMarket'
import { mergeImported } from './provider'

describe('dati di mercato dimostrativi', () => {
  it('sono deterministici e stabili al passare dei giorni', () => {
    const a = buildDemoInstruments('2026-10-02')
    const b = buildDemoInstruments('2026-10-09')
    const fa = a.find((i) => i.id === 'f-bil-prud')!
    const fb = b.find((i) => i.id === 'f-bil-prud')!
    const sameDay = fb.series.find((p) => p.date === '2026-09-15')
    expect(fa.series.find((p) => p.date === '2026-09-15')).toEqual(sameDay)
    expect(fb.series[fb.series.length - 1].date).toBe('2026-10-09')
  })

  it('sono calibrati sul valore di ancoraggio e saltano i weekend', () => {
    const list = buildDemoInstruments('2026-10-02')
    const ftse = list.find((i) => i.id === 'idx-ftsemib')!
    expect(ftse.series.find((p) => p.date === '2026-10-01')?.value).toBe(43250)
    expect(ftse.series.some((p) => isWeekend(p.date))).toBe(false)
    expect(list.every((i) => i.source === 'demo')).toBe(true)
  })

  it('la serie importata sostituisce quella demo con lo stesso ID', () => {
    const list = buildDemoInstruments('2026-10-02')
    const merged = mergeImported(list, [
      {
        id: 'f-bil-prud',
        name: 'Bilanciato Prudente',
        group: 'fondo',
        unit: 'EUR',
        decimals: 3,
        series: [{ date: '2026-10-01', value: 12 }],
        source: 'import',
        colorIndex: 1,
      },
    ])
    const f = merged.find((i) => i.id === 'f-bil-prud')!
    expect(f.source).toBe('import')
    expect(f.series).toHaveLength(1)
    expect(f.colorIndex).toBe(2)
    expect(merged).toHaveLength(list.length)
  })
})
