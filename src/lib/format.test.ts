import { describe, expect, it } from 'vitest'
import {
  formatCurrency,
  formatDateLong,
  formatDateShort,
  formatInstrumentValue,
  formatPercent,
  formatRelativeDays,
  greeting,
  initials,
} from './format'

describe('format', () => {
  it('valuta in euro con separatore delle migliaia anche a 4 cifre', () => {
    expect(formatCurrency(3200)).toBe('3.200 €')
    expect(formatCurrency(48200)).toBe('48.200 €')
    expect(formatCurrency(10.42, 2)).toBe('10,42 €')
    expect(formatCurrency(-1500)).toBe('−1.500 €')
  })

  it('percentuali con segno tipografico', () => {
    expect(formatPercent(2.1, 2, true)).toBe('+2,10%')
    expect(formatPercent(-1.153, 2, true)).toBe('−1,15%')
    expect(formatPercent(0, 2, true)).toBe('0,00%')
    expect(formatPercent(3.45)).toBe('3,45%')
  })

  it('valori di strumenti per unità', () => {
    expect(formatInstrumentValue(43250, 'pt', 0)).toBe('43.250')
    expect(formatInstrumentValue(95, 'bp', 0)).toBe('95 pb')
    expect(formatInstrumentValue(1.172, 'fx', 4)).toBe('1,1720')
  })

  it('date in italiano', () => {
    expect(formatDateLong('2026-10-02')).toBe('venerdì 2 ottobre 2026')
    expect(formatDateShort('2026-10-02')).toBe('02/10/2026')
  })

  it('testi relativi e saluti', () => {
    expect(formatRelativeDays(0)).toBe('oggi')
    expect(formatRelativeDays(5)).toBe('tra 5 gg')
    expect(formatRelativeDays(-3)).toBe('3 gg fa')
    expect(greeting(9 * 60)).toBe('Buongiorno')
    expect(greeting(14 * 60)).toBe('Buon pomeriggio')
    expect(greeting(19 * 60)).toBe('Buonasera')
    expect(initials('Denis Bianchi')).toBe('DB')
  })
})
