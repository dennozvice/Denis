import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  ageOn,
  diffDays,
  durationMinutes,
  instantToRome,
  isDateKey,
  monthMatrix,
  nextAnniversary,
  nowInRome,
  startOfWeek,
  weekdayIndex,
} from './dates'

describe('dates', () => {
  it('somma giorni attraversando mesi, anni e cambio ora', () => {
    expect(addDays('2026-10-02', 30)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    // 25/10/2026: ritorno all'ora solare, giornata di 25 ore
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2)
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
  })

  it('aggiunge mesi con clamp a fine mese', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-10-02', -24)).toBe('2024-10-02')
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15')
  })

  it('settimana con inizio lunedì', () => {
    expect(weekdayIndex('2026-10-02')).toBe(4) // venerdì
    expect(weekdayIndex('2026-10-04')).toBe(6) // domenica
    expect(startOfWeek('2026-10-02')).toBe('2026-09-28')
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28')
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05')
  })

  it('griglia del mese 6x7 a partire da lunedì', () => {
    const m = monthMatrix('2026-10-15')
    expect(m).toHaveLength(6)
    expect(m[0][0]).toBe('2026-09-28')
    expect(m[0][3]).toBe('2026-10-01')
    expect(m[5][6]).toBe('2026-11-08')
  })

  it('età e ricorrenze, incluso il 29 febbraio', () => {
    expect(ageOn('1959-10-05', '2026-10-02')).toBe(66)
    expect(ageOn('1959-10-02', '2026-10-02')).toBe(67)
    expect(nextAnniversary('1980-10-02', '2026-10-02')).toBe('2026-10-02')
    expect(nextAnniversary('1980-09-30', '2026-10-02')).toBe('2027-09-30')
    expect(nextAnniversary('1984-02-29', '2026-10-02')).toBe('2027-02-28')
    expect(nextAnniversary('1984-02-29', '2027-10-02')).toBe('2028-02-29')
  })

  it('valida le date', () => {
    expect(isDateKey('2026-02-29')).toBe(false)
    expect(isDateKey('2028-02-29')).toBe(true)
    expect(isDateKey('2026-13-01')).toBe(false)
    expect(isDateKey('02/10/2026')).toBe(false)
  })

  it('legge ora e data nel fuso di Roma', () => {
    // 22:30 UTC del 2 ottobre = 00:30 del 3 ottobre a Roma (ora legale, UTC+2)
    expect(nowInRome(new Date(Date.UTC(2026, 9, 2, 22, 30)))).toMatchObject({ date: '2026-10-03', time: '00:30' })
    // a dicembre Roma è UTC+1
    expect(instantToRome(new Date(Date.UTC(2026, 11, 1, 8, 0)))).toEqual({ date: '2026-12-01', time: '09:00' })
  })

  it('durata in minuti', () => {
    expect(durationMinutes('09:30', '10:45')).toBe(75)
  })
})
