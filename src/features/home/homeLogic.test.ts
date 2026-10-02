import { describe, expect, it } from 'vitest'
import type { Goal, PricePoint, Training } from '../../domain/types'
import {
  formatGoalPeriod,
  formatGoalValue,
  goalRollover,
  goalStatus,
  isGoalStale,
  latestDate,
  marketChange,
  monthName,
  parseItalianNumber,
  periodElapsed,
  scrollEdges,
  toInputValue,
  trainingSummary,
} from './homeLogic'

const goal = (patch: Partial<Goal>): Goal => ({
  id: 'g',
  kind: 'produzione',
  label: 'Produzione',
  period: 'mese',
  unit: 'EUR',
  target: 1000,
  current: 0,
  ...patch,
})

describe('periodElapsed', () => {
  it('mese: giorno corrente / giorni del mese', () => {
    expect(periodElapsed('mese', '2026-10-01')).toBeCloseTo(1 / 31)
    expect(periodElapsed('mese', '2026-02-14')).toBeCloseTo(14 / 28)
    expect(periodElapsed('mese', '2028-02-29')).toBe(1)
  })

  it('anno: giorno dell’anno / giorni dell’anno (bisestile incluso)', () => {
    expect(periodElapsed('anno', '2026-01-01')).toBeCloseTo(1 / 365)
    expect(periodElapsed('anno', '2026-12-31')).toBe(1)
    expect(periodElapsed('anno', '2028-12-31')).toBe(1)
    expect(periodElapsed('anno', '2028-07-01')).toBeCloseTo(183 / 366)
  })
})

describe('goalStatus', () => {
  it('raggiunto quando current >= target', () => {
    expect(goalStatus(goal({ current: 1000 }), '2026-10-02').pace).toBe('raggiunto')
    expect(goalStatus(goal({ current: 1500 }), '2026-10-02').progress).toBe(1.5)
  })

  it('in linea se avanti rispetto al ritmo atteso, altrimenti sotto il ritmo', () => {
    // 15 ottobre: atteso 15/31 ≈ 48%
    expect(goalStatus(goal({ current: 500 }), '2026-10-15').pace).toBe('in_linea')
    expect(goalStatus(goal({ current: 400 }), '2026-10-15').pace).toBe('sotto_ritmo')
  })

  it('obiettivo senza target', () => {
    expect(goalStatus(goal({ target: 0, current: 10 }), '2026-10-15').pace).toBe('non_impostato')
  })
})

describe('cambio di periodo degli obiettivi', () => {
  const TODAY = '2026-10-02'

  it('un obiettivo è da azzerare se il suo periodo non è quello in corso', () => {
    expect(isGoalStale(goal({ periodKey: '2026-10' }), TODAY)).toBe(false)
    expect(isGoalStale(goal({ periodKey: '2026-09' }), TODAY)).toBe(true)
    expect(isGoalStale(goal({ period: 'anno', periodKey: '2026' }), TODAY)).toBe(false)
    expect(isGoalStale(goal({ period: 'anno', periodKey: '2025' }), '2026-01-01')).toBe(true)
    // dati salvati prima del campo periodKey: periodo sconosciuto, nessun avviso
    expect(isGoalStale(goal({}), TODAY)).toBe(false)
  })

  it('periodo leggibile', () => {
    expect(monthName(TODAY)).toBe('ottobre')
    expect(formatGoalPeriod('mese', '2026-09')).toBe('settembre 2026')
    expect(formatGoalPeriod('anno', '2025')).toBe('2025')
    expect(formatGoalPeriod('mese', '2026-13')).toBeUndefined()
    expect(formatGoalPeriod('anno', '2026-09')).toBeUndefined()
  })

  it('avviso e azione per gli obiettivi mensili del mese scorso', () => {
    const goals = [
      goal({ id: 'a', periodKey: '2026-09', current: 18000 }),
      goal({ id: 'b', periodKey: '2026-10', current: 2 }),
      goal({ id: 'c', period: 'anno', periodKey: '2026' }),
    ]
    const r = goalRollover(goals, 'mese', TODAY)
    expect(r?.goals.map((g) => g.id)).toEqual(['a'])
    expect(r?.periodKey).toBe('2026-10')
    expect(r?.notice).toBe('I valori si riferiscono a settembre 2026')
    expect(r?.action).toBe('Azzera e inizia ottobre')
    expect(r?.periodLabel).toBe('settembre 2026')
    expect(goalRollover(goals, 'anno', TODAY)).toBeUndefined()
  })

  it('obiettivi annuali e periodi misti', () => {
    const r = goalRollover([goal({ period: 'anno', periodKey: '2025' })], 'anno', '2026-01-02')
    expect(r?.notice).toBe('I valori si riferiscono al 2025')
    expect(r?.action).toBe('Azzera e inizia il 2026')
    expect(r?.editHint).toBe('I valori attuali si riferiscono al 2025: salvando si riferiranno al 2026.')
    const mixed = goalRollover([goal({ periodKey: '2026-08' }), goal({ periodKey: '2026-09' })], 'mese', TODAY)
    expect(mixed?.notice).toBe('I valori si riferiscono a un periodo precedente')
    expect(mixed?.goals).toHaveLength(2)
  })
})

describe('formatGoalValue', () => {
  it('valuta o numero semplice', () => {
    expect(formatGoalValue(16200, 'EUR').replace(/\s/g, ' ')).toBe('16.200 €')
    expect(formatGoalValue(8, 'numero')).toBe('8')
  })
})

describe('parseItalianNumber', () => {
  it('accetta i formati italiani più comuni', () => {
    expect(parseItalianNumber('16200')).toBe(16200)
    expect(parseItalianNumber('16.200')).toBe(16200)
    expect(parseItalianNumber('1.234.567')).toBe(1234567)
    expect(parseItalianNumber('1.234,50')).toBe(1234.5)
    expect(parseItalianNumber('2,5')).toBe(2.5)
    expect(parseItalianNumber('2.5')).toBe(2.5)
    expect(parseItalianNumber(' € 3.000 ')).toBe(3000)
  })

  it('rifiuta testo non numerico', () => {
    expect(parseItalianNumber('')).toBeUndefined()
    expect(parseItalianNumber('abc')).toBeUndefined()
    expect(parseItalianNumber('12a')).toBeUndefined()
    expect(parseItalianNumber('1,2,3')).toBeUndefined()
  })

  it('toInputValue è reversibile', () => {
    expect(parseItalianNumber(toInputValue(16200))).toBe(16200)
    expect(parseItalianNumber(toInputValue(2.5))).toBe(2.5)
  })
})

describe('marketChange', () => {
  const series = (a: number, b: number): PricePoint[] => [
    { date: '2026-09-30', value: a },
    { date: '2026-10-01', value: b },
  ]

  it('indici e cambi: variazione percentuale', () => {
    const c = marketChange({ unit: 'pt', series: series(100, 101) })
    expect(c?.kind).toBe('pct')
    expect(c?.value).toBeCloseTo(1)
    expect(c?.invert).toBe(false)
    expect(c?.neutral).toBe(false)
  })

  it('tassi: variazione assoluta in punti base', () => {
    const c = marketChange({ unit: 'pct', series: series(3.45, 3.48) })
    expect(c?.kind).toBe('abs')
    expect(c?.suffix).toBe(' pb')
    expect(c?.value).toBeCloseTo(3)
    expect(c?.decimals).toBe(0)
    // un rialzo dei tassi non è né buono né cattivo: nessun colore
    expect(c?.neutral).toBe(true)
    expect(c?.invert).toBe(false)
  })

  it('spread: punti base con colore invertito', () => {
    const c = marketChange({ unit: 'bp', series: series(110, 104) })
    expect(c?.value).toBeCloseTo(-6)
    expect(c?.invert).toBe(true)
    expect(c?.neutral).toBe(false)
  })

  it('serie troppo corta', () => {
    expect(marketChange({ unit: 'pt', series: [] })).toBeUndefined()
  })
})

describe('latestDate', () => {
  it('data più recente tra gli strumenti indicati, ignorando le serie vuote', () => {
    const s = (date: string): PricePoint[] => [{ date, value: 1 }]
    expect(latestDate([{ series: s('2026-09-30') }, { series: s('2026-10-01') }, { series: [] }])).toBe('2026-10-01')
    expect(latestDate([])).toBeUndefined()
  })
})

describe('trainingSummary', () => {
  const training: Training = {
    year: 2026,
    hoursRequired: 30,
    courses: [
      { id: 'a', title: 'A', hours: 6, done: true },
      { id: 'b', title: 'B', hours: 8, done: true },
      { id: 'c', title: 'C', hours: 4, done: false },
    ],
  }

  it('somma ore completate e pianificate', () => {
    expect(trainingSummary(training)).toEqual({ done: 14, planned: 4, remaining: 16, progress: 14 / 30 })
  })

  it('ore mancanti mai negative', () => {
    const s = trainingSummary({ ...training, hoursRequired: 10 })
    expect(s.remaining).toBe(0)
    expect(s.progress).toBe(1)
  })
})

describe('scrollEdges', () => {
  it('nessuna dissolvenza se il contenuto sta nel riquadro', () => {
    expect(scrollEdges({ scrollLeft: 0, scrollWidth: 778, clientWidth: 778 })).toEqual({ start: false, end: false })
  })

  it('altro a destra all\'inizio, a sinistra alla fine, su entrambi i lati a metà', () => {
    expect(scrollEdges({ scrollLeft: 0, scrollWidth: 695, clientWidth: 356 })).toEqual({ start: false, end: true })
    expect(scrollEdges({ scrollLeft: 150, scrollWidth: 695, clientWidth: 356 })).toEqual({ start: true, end: true })
    expect(scrollEdges({ scrollLeft: 339, scrollWidth: 695, clientWidth: 356 })).toEqual({ start: true, end: false })
  })

  it('ignora le differenze sotto il pixel', () => {
    expect(scrollEdges({ scrollLeft: 0.5, scrollWidth: 701, clientWidth: 700 })).toEqual({ start: false, end: false })
    expect(scrollEdges({ scrollLeft: 338.5, scrollWidth: 695, clientWidth: 356 })).toEqual({ start: true, end: false })
  })
})
