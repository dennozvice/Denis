import { describe, expect, it } from 'vitest'
import type { Goal, PricePoint, Training } from '../../domain/types'
import {
  formatGoalValue,
  goalStatus,
  marketChange,
  parseItalianNumber,
  periodElapsed,
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
  })

  it('tassi: variazione assoluta in punti base', () => {
    const c = marketChange({ unit: 'pct', series: series(3.45, 3.48) })
    expect(c?.kind).toBe('abs')
    expect(c?.suffix).toBe(' pb')
    expect(c?.value).toBeCloseTo(3)
    expect(c?.decimals).toBe(0)
  })

  it('spread: punti base con colore invertito', () => {
    const c = marketChange({ unit: 'bp', series: series(110, 104) })
    expect(c?.value).toBeCloseTo(-6)
    expect(c?.invert).toBe(true)
  })

  it('serie troppo corta', () => {
    expect(marketChange({ unit: 'pt', series: [] })).toBeUndefined()
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
