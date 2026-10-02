import { afterEach, describe, expect, it } from 'vitest'
import { niceTicks, sampleDates, seriesColor, timeTicks } from '../../components/charts/LineChart'
import type { Instrument, PricePoint } from '../../domain/types'
import { addDays, isWeekend } from '../../lib/dates'
import { annualizedVolatility } from '../../lib/finance'
import {
  annualizedVolatilityByFrequency,
  buildImports,
  effectiveSelection,
  groupImportRows,
  hasWideLastChange,
  instrumentChange,
  isDemoFund,
  lastChangeRef,
  latestDate,
  loadShowDemoFunds,
  looksOffScale,
  matchKey,
  mergeSeries,
  rebaseAtCommonStart,
  removeImports,
  replacesDemo,
  restoreImports,
  risingIsBad,
  samplingFrequency,
  saveShowDemoFunds,
  SHOW_DEMO_FUNDS_KEY,
  slugify,
  stepDecimals,
  trendValues,
  withoutDemoMeta,
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

/** Serie con un punto ogni `step` giorni di calendario. */
const every = (start: string, step: number, values: number[]): PricePoint[] =>
  values.map((value, i) => ({ date: addDays(start, i * step), value }))

/** Serie giornaliera sui soli giorni lavorativi (come i valori quota). */
function businessDays(start: string, values: number[]): PricePoint[] {
  const out: PricePoint[] = []
  let date = start
  for (const value of values) {
    while (isWeekend(date)) date = addDays(date, 1)
    out.push({ date, value })
    date = addDays(date, 1)
  }
  return out
}

/** Valori che salgono e scendono a turno (rendimenti noti, volatilità non nulla). */
const zigzag = (n: number) => Array.from({ length: n }, (_, i) => 100 * (i % 2 === 0 ? 1 : 1.01))

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

  it('tassi: punti base senza colore; spread: punti base con colore invertito', () => {
    const rate = fund('r', { group: 'tasso', unit: 'pct', decimals: 2, series: series('2026-09-28', [3.4, 3.45]) })
    expect(instrumentChange(rate, '1G')).toMatchObject({
      kind: 'abs',
      suffix: ' pb',
      invert: false,
      neutral: true,
      value: expect.closeTo(5, 6),
    })
    const spread = fund('s', { group: 'spread', unit: 'bp', decimals: 0, series: series('2026-09-28', [100, 95]) })
    expect(instrumentChange(spread, '1G')).toMatchObject({ kind: 'abs', invert: true, value: -5 })
    expect(instrumentChange(spread, '1G')?.neutral).toBeFalsy()
    const f = fund('f', { series: series('2026-09-28', [10, 10.5]) })
    expect(instrumentChange(f, '1G')?.neutral).toBeFalsy()
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

  it('risingIsBad vale solo per gli spread (stessa regola dei colori delle variazioni)', () => {
    expect(risingIsBad({ unit: 'bp' })).toBe(true)
    expect(risingIsBad({ unit: 'pct' })).toBe(false)
    expect(risingIsBad({ unit: 'EUR' })).toBe(false)
  })
})

describe('frequenza dei dati', () => {
  it('riconosce dati giornalieri (weekend compresi), settimanali e mensili', () => {
    expect(samplingFrequency(businessDays('2026-06-01', zigzag(80)))).toBe('giornaliera')
    expect(samplingFrequency(every('2025-01-03', 7, zigzag(60)))).toBe('settimanale')
    expect(samplingFrequency(every('2023-01-31', 30, zigzag(36)))).toBe('mensile')
    expect(samplingFrequency([])).toBe('giornaliera')
    expect(samplingFrequency(series('2026-09-28', [1]))).toBe('giornaliera')
  })

  it('guarda solo gli ultimi ~30 punti: storico mensile seguito da valori settimanali recenti', () => {
    const old = every('2022-01-31', 30, zigzag(24))
    const recent = every(addDays(old[old.length - 1].date, 7), 7, zigzag(35))
    expect(samplingFrequency([...old, ...recent])).toBe('settimanale')
  })

  it('volatilità annualizzata con il fattore della frequenza (252, 52, 12)', () => {
    const daily = businessDays('2025-10-01', zigzag(260))
    const d = annualizedVolatilityByFrequency(daily)
    expect(d?.frequency).toBe('giornaliera')
    expect(d?.value).toBeCloseTo(annualizedVolatility(daily) ?? NaN, 8)

    // stessi rendimenti settimanali: la volatilità annua è sqrt(52/252) di quella calcolata come se fossero giornalieri
    const weekly = every('2025-10-03', 7, zigzag(53))
    const w = annualizedVolatilityByFrequency(weekly)
    expect(w?.frequency).toBe('settimanale')
    expect(w?.value).toBeCloseTo((annualizedVolatility(weekly) ?? NaN) * Math.sqrt(52 / 252), 8)

    const monthly = every('2025-09-30', 30, zigzag(13))
    const m = annualizedVolatilityByFrequency(monthly)
    expect(m?.frequency).toBe('mensile')
    expect(m?.value).toBeCloseTo((annualizedVolatility(monthly) ?? NaN) * Math.sqrt(12 / 252), 8)
  })

  it('volatilità: undefined con meno di 3 punti o valori non positivi', () => {
    expect(annualizedVolatilityByFrequency(series('2026-09-28', [1, 2]))).toBeUndefined()
    expect(annualizedVolatilityByFrequency(series('2026-09-28', [1, 0, 2]))).toBeUndefined()
  })

  it('ultima variazione: segnala quando il valore precedente è di più di 4 giorni prima', () => {
    expect(lastChangeRef(series('2026-09-28', [1]))).toBeUndefined()
    // venerdì → lunedì: 3 giorni, ancora "1g"
    expect(lastChangeRef([{ date: '2026-09-25', value: 1 }, { date: '2026-09-28', value: 2 }])).toEqual({
      previous: '2026-09-25',
      last: '2026-09-28',
      gapDays: 3,
      wide: false,
    })
    expect(lastChangeRef(every('2026-09-03', 7, [1, 2, 3]))).toMatchObject({ previous: '2026-09-10', gapDays: 7, wide: true })
    expect(lastChangeRef(every('2026-09-23', 5, [1, 2]))?.wide).toBe(true)
  })

  it('hasWideLastChange ignora la gestione separata (rendimenti annuali)', () => {
    const gs = fund('gs', { group: 'gestione_separata', unit: 'pct', series: every('2023-12-31', 365, [3, 3.1]) })
    const daily = fund('d', { series: series('2026-09-28', [1, 2]) })
    expect(hasWideLastChange([gs, daily])).toBe(false)
    expect(hasWideLastChange([daily, fund('w', { series: every('2026-09-03', 7, [1, 2]) })])).toBe(true)
  })

  it('trend 30 giorni: solo i punti degli ultimi 30 giorni di calendario, almeno 3', () => {
    const daily = businessDays('2026-06-01', zigzag(90))
    const lastDate = daily[daily.length - 1].date
    const values = trendValues(daily)
    const expected = daily.filter((p) => p.date >= addDays(lastDate, -30)).map((p) => p.value)
    expect(values).toEqual(expected)
    expect(values!.length).toBeGreaterThanOrEqual(20)
    expect(values!.length).toBeLessThanOrEqual(23)

    expect(trendValues(every('2026-01-02', 7, zigzag(40)))).toHaveLength(5)
    expect(trendValues(every('2024-01-31', 30, zigzag(30)))).toBeUndefined()
    expect(trendValues(series('2026-09-28', [1, 2]))).toBeUndefined()
    expect(trendValues([])).toBeUndefined()
  })
})

describe('rebaseAtCommonStart', () => {
  it('ribasa tutte le serie a 0% alla stessa data: la più recente tra gli inizi', () => {
    const long = series('2026-09-01', [100, 110, 120, 130, 140])
    const short = [
      { date: '2026-09-03', value: 50 },
      { date: '2026-09-05', value: 55 },
    ]
    const { start, series: out } = rebaseAtCommonStart([long, short])
    expect(start).toBe('2026-09-03')
    expect(out[0][0]).toEqual({ date: '2026-09-03', value: 0 })
    expect(out[0].map((p) => p.date)).toEqual(['2026-09-03', '2026-09-04', '2026-09-05'])
    expect(out[0][2].value).toBeCloseTo((140 / 120 - 1) * 100, 10)
    expect(out[1]).toEqual([
      { date: '2026-09-03', value: 0 },
      { date: '2026-09-05', value: expect.closeTo(10, 10) },
    ])
  })

  it('senza un punto alla data comune usa l’ultimo valore precedente, riportato a quella data', () => {
    const weekly = [
      { date: '2026-09-01', value: 10 },
      { date: '2026-09-08', value: 11 },
    ]
    const daily = series('2026-09-03', [20, 21, 22, 23, 24, 25])
    const { start, series: out } = rebaseAtCommonStart([weekly, daily])
    expect(start).toBe('2026-09-03')
    expect(out[0]).toEqual([
      { date: '2026-09-03', value: 0 },
      { date: '2026-09-08', value: expect.closeTo(10, 10) },
    ])
    expect(out[1][0]).toEqual({ date: '2026-09-03', value: 0 })
  })

  it('serie vuote restano vuote; nessuna serie → nessuna data', () => {
    expect(rebaseAtCommonStart([])).toEqual({ series: [] })
    expect(rebaseAtCommonStart([[], []])).toEqual({ series: [[], []] })
    const { start, series: out } = rebaseAtCommonStart([[], series('2026-09-01', [1, 2])])
    expect(start).toBe('2026-09-01')
    expect(out[0]).toEqual([])
    expect(out[1].map((p) => p.value)).toEqual([0, 100])
  })
})

describe('fondi dimostrativi', () => {
  const g = globalThis as { window?: unknown }
  afterEach(() => {
    delete g.window
  })

  it('isDemoFund vale per fondi e gestione separata dimostrativi, non per indici o import', () => {
    expect(isDemoFund(fund('f'))).toBe(true)
    expect(isDemoFund(fund('gs', { group: 'gestione_separata' }))).toBe(true)
    expect(isDemoFund(fund('i', { group: 'indice' }))).toBe(false)
    expect(isDemoFund(fund('f', { source: 'import' }))).toBe(false)
  })

  it('withoutDemoMeta toglie SRI e descrizione solo alle serie importate', () => {
    const demo = fund('f', { sri: 3, description: 'Inventata', category: 'Bilanciato' })
    expect(withoutDemoMeta(demo)).toBe(demo)
    const imported = withoutDemoMeta({ ...demo, source: 'import' })
    expect(imported).not.toHaveProperty('sri')
    expect(imported).not.toHaveProperty('description')
    expect(imported.category).toBe('Bilanciato')
    const plain = fund('imp-x', { source: 'import' })
    expect(withoutDemoMeta(plain)).toBe(plain)
  })

  it('preferenza "Mostra fondi dimostrativi": attiva di default, salvata, tollerante agli errori', () => {
    expect(loadShowDemoFunds()).toBe(true) // nessun window/localStorage
    const store = new Map<string, string>()
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    }
    expect(loadShowDemoFunds()).toBe(true)
    saveShowDemoFunds(false)
    expect(store.get(SHOW_DEMO_FUNDS_KEY)).toBe('false')
    expect(loadShowDemoFunds()).toBe(false)
    saveShowDemoFunds(true)
    expect(loadShowDemoFunds()).toBe(true)
    g.window = {
      localStorage: {
        getItem: () => {
          throw new Error('bloccato')
        },
        setItem: () => {
          throw new Error('bloccato')
        },
      },
    }
    expect(loadShowDemoFunds()).toBe(true)
    expect(() => saveShowDemoFunds(false)).not.toThrow()
  })
})

describe('latestDate', () => {
  it('ultima data tra gli strumenti, esclusa la gestione separata', () => {
    const list = [
      fund('a', { series: series('2026-09-28', [1, 2]) }),
      fund('b', { series: series('2026-09-30', [1, 2]) }),
      fund('gs', { group: 'gestione_separata', series: [{ date: '2026-12-31', value: 3 }] }),
      fund('vuoto'),
    ]
    expect(latestDate(list)).toBe('2026-10-01')
    expect(latestDate([])).toBeUndefined()
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
      category: 'Bilanciato',
      benchmarkId: 'idx',
      source: 'import',
    })
    // rischio e descrizione del fondo dimostrativo erano inventati: non passano ai valori reali
    expect(prud?.sri).toBeUndefined()
    expect(prud?.description).toBeUndefined()
    expect(prud?.series.map((p) => p.value)).toEqual([11.82, 11.9])
    const beta = list.find((i) => i.id === 'imp-fondo-beta')
    expect(beta).toMatchObject({ name: 'Fondo Beta', group: 'fondo', unit: 'EUR', decimals: 3, source: 'import' })
    expect(beta?.colorIndex).toBeGreaterThanOrEqual(1)
    expect(beta?.colorIndex).toBeLessThanOrEqual(8)
  })

  it('buildImports rinomina il fondo dimostrativo sostituito (nome vuoto = nome attuale)', () => {
    const groups = groupImportRows(
      [
        { key: 'f-bil-prud', date: '2026-09-30', value: 11.82 },
        { key: 'Fondo Beta', date: '2026-09-30', value: 5.5 },
      ],
      instruments,
    )
    expect(groups.map(replacesDemo)).toEqual([true, false])
    const renamed = buildImports(groups, [], { 'f-bil-prud': '  Linea Bilanciata Reale  ' })
    expect(renamed.find((i) => i.id === 'f-bil-prud')?.name).toBe('Linea Bilanciata Reale')
    expect(renamed.find((i) => i.id === 'imp-fondo-beta')?.name).toBe('Fondo Beta')
    const blank = buildImports(groups, [], { 'f-bil-prud': '   ' })
    expect(blank.find((i) => i.id === 'f-bil-prud')?.name).toBe('Bilanciato Prudente')
  })

  it('buildImports non conserva SRI e descrizione copiati da import precedenti', () => {
    const legacy: Instrument[] = [
      { ...instruments[0], description: 'Inventata', source: 'import', series: [{ date: '2026-09-29', value: 11.7 }] },
    ]
    const groups = groupImportRows([{ key: 'f-bil-prud', date: '2026-09-30', value: 11.8 }], instruments)
    const [item] = buildImports(groups, legacy)
    expect(item.sri).toBeUndefined()
    expect(item.description).toBeUndefined()
    expect(item.series).toHaveLength(2)
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

  it('removeImports restituisce le serie tolte con la loro posizione', () => {
    const list = [fund('a'), fund('b'), fund('c')]
    const { next, removed } = removeImports(list, ['b', 'x'])
    expect(next.map((i) => i.id)).toEqual(['a', 'c'])
    expect(removed).toEqual([{ item: list[1], index: 1 }])
  })

  it('restoreImports rimette le serie al loro posto senza perdere quelle arrivate nel frattempo', () => {
    const list = [fund('a'), fund('b'), fund('c')]
    const { next, removed } = removeImports(list, ['b'])
    // nel frattempo un'altra scheda ha importato "d"
    const restored = restoreImports([...next, fund('d')], removed)
    expect(restored.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('restoreImports dopo "Rimuovi tutti": prima le serie ripristinate, poi le nuove', () => {
    const list = [fund('a'), fund('b')]
    const { next, removed } = removeImports(list, ['a', 'b'])
    expect(next).toEqual([])
    expect(restoreImports([fund('z')], removed).map((i) => i.id)).toEqual(['a', 'b', 'z'])
  })

  it('restoreImports non sovrascrive una serie reimportata dopo la rimozione', () => {
    const old = fund('a', { series: series('2026-09-01', [1]) })
    const fresh = fund('a', { series: series('2026-09-01', [1, 2]) })
    const { removed } = removeImports([old], ['a'])
    const restored = restoreImports([fresh], removed)
    expect(restored).toEqual([fresh])
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
