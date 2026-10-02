import { describe, expect, it } from 'vitest'
import { niceTicks, sampleDates, seriesColor, timeTicks } from '../../components/charts/LineChart'
import type { Instrument, PricePoint } from '../../domain/types'
import { addDays } from '../../lib/dates'
import {
  buildImports,
  effectiveSelection,
  groupImportRows,
  instrumentChange,
  looksOffScale,
  matchKey,
  mergeSeries,
  slugify,
  stepDecimals,
} from './fundsLogic'

const fund = (id: string, extra: Partial<Instrument> = {}): Instrument => ({
  id,
  name: `Fondo ${id}`,
  group: 'fondo',
  unit: 'EUR',
  decimals: 3,
  series: [],
  source: 'demo',
  colorIndex: 1,
  ...extra,
})

const series = (start: string, values: number[]): PricePoint[] =>
  values.map((value, i) => ({ date: addDays(start, i), value }))

describe('effectiveSelection', () => {
  const chartable = [fund('f-a'), fund('f-bil-prud'), fund('f-az-glob'), fund('f-b')]

  it('usa la selezione predefinita se non c’è una scelta salvata', () => {
    expect(effectiveSelection(null, chartable)).toEqual(['f-bil-prud', 'f-az-glob'])
  })

  it('filtra gli ID non più esistenti e limita a 4', () => {
    expect(effectiveSelection(['x', 'f-b', 'f-a'], chartable)).toEqual(['f-b', 'f-a'])
    expect(effectiveSelection(['f-a', 'f-b', 'f-bil-prud', 'f-az-glob', 'x'], chartable)).toHaveLength(4)
  })

  it('rispetta una selezione vuota scelta dall’utente', () => {
    expect(effectiveSelection([], chartable)).toEqual([])
  })

  it('ripiega sulla predefinita se nessun ID salvato esiste più', () => {
    expect(effectiveSelection(['sparito'], chartable)).toEqual(['f-bil-prud', 'f-az-glob'])
    expect(effectiveSelection(null, [fund('z1'), fund('z2'), fund('z3')])).toEqual(['z1', 'z2'])
  })
})

describe('instrumentChange', () => {
  it('fondi: variazione percentuale', () => {
    const f = fund('f', { series: series('2026-09-28', [10, 10.5]) })
    expect(instrumentChange(f, '1G')).toMatchObject({ kind: 'pct', value: expect.closeTo(5, 6) })
  })

  it('tassi: punti base, spread: punti base con colore invertito', () => {
    const rate = fund('r', { group: 'tasso', unit: 'pct', decimals: 2, series: series('2026-09-28', [3.4, 3.45]) })
    expect(instrumentChange(rate, '1G')).toMatchObject({ kind: 'abs', suffix: ' pb', invert: false, value: expect.closeTo(5, 6) })
    const spread = fund('s', { group: 'spread', unit: 'bp', decimals: 0, series: series('2026-09-28', [100, 95]) })
    expect(instrumentChange(spread, '1G')).toMatchObject({ kind: 'abs', invert: true, value: -5 })
  })

  it('gestione separata: differenza in punti percentuali rispetto all’anno prima, niente variazione giornaliera', () => {
    const gs = fund('gs', {
      group: 'gestione_separata',
      unit: 'pct',
      series: [
        { date: '2024-12-31', value: 2.95 },
        { date: '2025-12-31', value: 3.1 },
      ],
    })
    expect(instrumentChange(gs, '1G')).toBeUndefined()
    expect(instrumentChange(gs, '1A')).toMatchObject({ kind: 'abs', suffix: ' pp', value: expect.closeTo(0.15, 6) })
  })

  it('storia insufficiente → undefined', () => {
    expect(instrumentChange(fund('f', { series: series('2026-09-28', [10]) }), '1A')).toBeUndefined()
  })
})

describe('importazione', () => {
  const instruments = [
    fund('f-bil-prud', { name: 'Bilanciato Prudente', colorIndex: 2, sri: 3, category: 'Bilanciato', benchmarkId: 'idx' }),
    fund('imp-fondo-alfa', { name: 'Fondo Alfa', source: 'import', colorIndex: 1 }),
  ]

  it('slugify', () => {
    expect(slugify('Fondo Pensione – Linea A')).toBe('fondo-pensione-linea-a')
    expect(slugify('Città & Più')).toBe('citta-piu')
    expect(slugify('***')).toBe('serie')
  })

  it('associa le chiavi per ID, ID importato, nome; altrimenti nuovo fondo', () => {
    expect(matchKey('f-bil-prud', instruments).existing?.id).toBe('f-bil-prud')
    expect(matchKey('F-BIL-PRUD', instruments).id).toBe('f-bil-prud')
    expect(matchKey('Bilanciato  prudente', instruments).id).toBe('f-bil-prud')
    expect(matchKey('Fondo Alfa', instruments).id).toBe('imp-fondo-alfa')
    const nuovo = matchKey('Fondo Beta', instruments)
    expect(nuovo).toEqual({ key: 'Fondo Beta', id: 'imp-fondo-beta' })
  })

  it('mergeSeries: unione ordinata, a parità di data vince il nuovo valore', () => {
    expect(
      mergeSeries(
        [
          { date: '2026-09-29', value: 1 },
          { date: '2026-09-30', value: 2 },
        ],
        [
          { date: '2026-09-30', value: 3 },
          { date: '2026-09-28', value: 0 },
        ],
      ),
    ).toEqual([
      { date: '2026-09-28', value: 0 },
      { date: '2026-09-29', value: 1 },
      { date: '2026-09-30', value: 3 },
    ])
  })

  it('buildImports copia i metadati degli strumenti esistenti e crea i fondi nuovi', () => {
    const groups = groupImportRows(
      [
        { key: 'f-bil-prud', date: '2026-09-30', value: 11.82 },
        { key: 'Bilanciato Prudente', date: '2026-10-01', value: 11.9 },
        { key: 'Fondo Beta', date: '2026-09-30', value: 5.5 },
      ],
      instruments,
    )
    expect(groups).toHaveLength(2)
    const list = buildImports(groups, [])
    const prud = list.find((i) => i.id === 'f-bil-prud')
    expect(prud).toMatchObject({
      name: 'Bilanciato Prudente',
      colorIndex: 2,
      sri: 3,
      category: 'Bilanciato',
      benchmarkId: 'idx',
      source: 'import',
    })
    expect(prud?.series.map((p) => p.value)).toEqual([11.82, 11.9])
    const beta = list.find((i) => i.id === 'imp-fondo-beta')
    expect(beta).toMatchObject({ name: 'Fondo Beta', group: 'fondo', unit: 'EUR', decimals: 3, source: 'import' })
    expect(beta?.colorIndex).toBeGreaterThanOrEqual(1)
    expect(beta?.colorIndex).toBeLessThanOrEqual(8)
  })

  it('buildImports unisce ai valori già importati senza duplicare lo strumento', () => {
    const existing: Instrument[] = [
      { ...instruments[0], source: 'import', series: [{ date: '2026-09-29', value: 11.7 }, { date: '2026-09-30', value: 11.75 }] },
    ]
    const groups = groupImportRows([{ key: 'f-bil-prud', date: '2026-09-30', value: 11.8 }], instruments)
    const list = buildImports(groups, existing)
    expect(list).toHaveLength(1)
    expect(list[0].series).toEqual([
      { date: '2026-09-29', value: 11.7 },
      { date: '2026-09-30', value: 11.8 },
    ])
  })

  it('i colori dei fondi nuovi ruotano da 1 a 8', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ key: `Nuovo ${i}`, date: '2026-09-30', value: 1 }))
    const list = buildImports(groupImportRows(rows, []), [])
    expect(list.map((i) => i.colorIndex)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 1])
  })

  it('looksOffScale segnala probabili errori di separatore', () => {
    expect(looksOffScale(1182, 11.8)).toBe(true)
    expect(looksOffScale(11.9, 11.8)).toBe(false)
    expect(looksOffScale(11.9, undefined)).toBe(false)
  })
})

describe('stepDecimals', () => {
  it.each([
    [5, 0],
    [2.5, 1],
    [0.25, 2],
    [0.1, 1],
    [1000, 0],
    [0.005, 3],
  ])('%d → %d', (step, d) => expect(stepDecimals(step)).toBe(d))
})

describe('LineChart: scale', () => {
  it('niceTicks usa passi 1/2/2,5/5 × 10^n e copre l’intervallo', () => {
    const { ticks, step } = niceTicks(11.62, 11.94)
    expect([0.1, 0.2, 0.25, 0.5, 0.05]).toContain(Number(step.toFixed(4)))
    expect(ticks[0]).toBeLessThanOrEqual(11.62)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(11.94)
    expect(ticks.length).toBeGreaterThanOrEqual(3)
    expect(ticks.length).toBeLessThanOrEqual(5)
  })

  it('niceTicks con intervallo che attraversa lo zero include lo zero', () => {
    const { ticks } = niceTicks(-3.2, 7.9)
    expect(ticks).toContain(0)
  })

  it('niceTicks con valori costanti non divide per zero', () => {
    const { ticks } = niceTicks(5, 5)
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    expect(ticks[0]).toBeLessThan(5)
    expect(ticks[ticks.length - 1]).toBeGreaterThan(5)
  })

  it('timeTicks: giorni fino a 3 mesi, mesi fino a 13 mesi, mesi con anno oltre', () => {
    const days = timeTicks('2026-09-01', '2026-10-01', 5)
    expect(days.length).toBeLessThanOrEqual(5)
    expect(days[0].label).toMatch(/^\d+ \w+/)
    const months = timeTicks('2025-10-01', '2026-10-01', 6)
    expect(months.length).toBeLessThanOrEqual(6)
    expect(months.every((t) => t.date.endsWith('-01'))).toBe(true)
    const years = timeTicks('2023-10-02', '2026-10-01', 6)
    expect(years.length).toBeLessThanOrEqual(6)
    expect(years[0].label).toMatch(/\d{2}$/)
  })

  it('sampleDates limita le righe della tabella a 24 includendo l’ultima data', () => {
    const dates = Array.from({ length: 800 }, (_, i) => addDays('2023-01-02', i))
    const sampled = sampleDates(dates)
    expect(sampled.length).toBeLessThanOrEqual(24)
    expect(sampled[sampled.length - 1]).toBe(dates[dates.length - 1])
    const short = Array.from({ length: 60 }, (_, i) => addDays('2026-08-01', i))
    expect(sampleDates(short).length).toBeLessThanOrEqual(24)
    expect(sampleDates(short.slice(0, 10))).toHaveLength(10)
  })

  it('seriesColor resta nella palette 1..8', () => {
    expect(seriesColor(1)).toBe('var(--series-1)')
    expect(seriesColor(9)).toBe('var(--series-1)')
    expect(seriesColor(0)).toBe('var(--series-8)')
  })
})
