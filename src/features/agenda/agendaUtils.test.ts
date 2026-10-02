import { describe, expect, it } from 'vitest'
import type { Appointment } from '../../domain/types'
import type { RomeNow } from '../../lib/dates'
import {
  appointmentPhase,
  defaultStartFor,
  endAfter,
  formatDuration,
  hourRange,
  isAllDay,
  layoutOverlaps,
  mapsHref,
  needsOutcome,
  nextHalfHour,
  nextWorkday,
  rangeLabel,
  relativeDayLabel,
  stepDay,
  telHref,
  viewRange,
} from './agendaUtils'

const now = (date: string, time: string): RomeNow => {
  const [h, m] = time.split(':').map(Number)
  return { date, time, minutes: h * 60 + m, year: Number(date.slice(0, 4)) }
}

const appt = (id: string, start: string, end: string, extra: Partial<Appointment> = {}): Appointment => ({
  id,
  title: id,
  type: 'altro',
  date: '2026-10-02',
  start,
  end,
  location: 'ufficio',
  status: 'confermato',
  ...extra,
})

describe('orari', () => {
  it('nextHalfHour', () => {
    expect(nextHalfHour(10 * 60 + 12)).toBe('10:30')
    expect(nextHalfHour(10 * 60 + 30)).toBe('11:00')
    expect(nextHalfHour(10 * 60 + 59)).toBe('11:00')
    expect(nextHalfHour(23 * 60 + 40)).toBe('23:00')
  })
  it('endAfter non supera le 23:59', () => {
    expect(endAfter('09:30')).toBe('10:30')
    expect(endAfter('09:30', 45)).toBe('10:15')
    expect(endAfter('23:30')).toBe('23:59')
  })
  it('defaultStartFor: oggi = prossima mezz\'ora, altri giorni = 09:00', () => {
    expect(defaultStartFor('2026-10-02', now('2026-10-02', '10:12'))).toBe('10:30')
    expect(defaultStartFor('2026-10-05', now('2026-10-02', '10:12'))).toBe('09:00')
  })
  it('nextWorkday salta il fine settimana', () => {
    expect(nextWorkday('2026-10-01')).toBe('2026-10-02') // gio → ven
    expect(nextWorkday('2026-10-02')).toBe('2026-10-05') // ven → lun
    expect(nextWorkday('2026-10-03')).toBe('2026-10-05') // sab → lun
  })
  it('formatDuration', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(95)).toBe('1 h 35 min')
  })
})

describe('stato', () => {
  const n = now('2026-10-02', '10:00')
  it('appointmentPhase', () => {
    expect(appointmentPhase(appt('a', '09:00', '09:30'), n)).toBe('passato')
    expect(appointmentPhase(appt('a', '09:30', '10:30'), n)).toBe('in_corso')
    expect(appointmentPhase(appt('a', '10:00', '10:30'), n)).toBe('in_corso')
    expect(appointmentPhase(appt('a', '09:00', '10:00'), n)).toBe('passato')
    expect(appointmentPhase(appt('a', '11:00', '12:00'), n)).toBe('futuro')
    expect(appointmentPhase(appt('a', '11:00', '12:00', { date: '2026-10-01' }), n)).toBe('passato')
  })
  it('needsOutcome solo per appuntamenti con clienti, conclusi e senza esito', () => {
    expect(needsOutcome(appt('a', '09:00', '09:30', { clientId: 'c01' }), n)).toBe(true)
    expect(needsOutcome(appt('a', '09:00', '09:30', { type: 'call' }), n)).toBe(true)
    expect(needsOutcome(appt('a', '09:00', '09:30', { type: 'riunione_agenzia' }), n)).toBe(false)
    expect(needsOutcome(appt('a', '09:00', '09:30', { clientId: 'c01', outcome: 'positivo' }), n)).toBe(false)
    expect(needsOutcome(appt('a', '09:00', '09:30', { clientId: 'c01', status: 'annullato' }), n)).toBe(false)
    expect(needsOutcome(appt('a', '11:00', '12:00', { clientId: 'c01' }), n)).toBe(false)
  })
  it('isAllDay', () => {
    expect(isAllDay(appt('a', '00:00', '23:59'))).toBe(true)
    expect(isAllDay(appt('a', '00:00', '12:00'))).toBe(false)
  })
})

describe('layoutOverlaps', () => {
  it('eventi separati occupano tutta la larghezza', () => {
    const out = layoutOverlaps([appt('a', '09:00', '10:00'), appt('b', '10:00', '11:00')])
    expect(out.map((p) => [p.appointment.id, p.column, p.columns])).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
    ])
  })
  it('eventi sovrapposti vanno affiancati e riusano le colonne libere', () => {
    const out = layoutOverlaps([
      appt('a', '09:00', '11:00'),
      appt('b', '09:30', '10:00'),
      appt('c', '10:00', '10:30'),
      appt('d', '12:00', '13:00'),
    ])
    const byId = Object.fromEntries(out.map((p) => [p.appointment.id, [p.column, p.columns]]))
    expect(byId).toEqual({ a: [0, 2], b: [1, 2], c: [1, 2], d: [0, 1] })
  })
  it('tre eventi contemporanei = tre colonne', () => {
    const out = layoutOverlaps([appt('a', '09:00', '10:00'), appt('b', '09:00', '10:00'), appt('c', '09:15', '09:45')])
    expect(out.map((p) => p.columns)).toEqual([3, 3, 3])
    expect(new Set(out.map((p) => p.column)).size).toBe(3)
  })
  it('l\'ingombro minimo conta come sovrapposizione', () => {
    const out = layoutOverlaps([appt('a', '14:30', '14:40'), appt('b', '14:45', '15:30')], 30)
    expect(out.map((p) => p.columns)).toEqual([2, 2])
  })
})

describe('hourRange', () => {
  it('almeno 08–20, esteso agli appuntamenti fuori fascia', () => {
    expect(hourRange([])).toEqual({ startHour: 8, endHour: 20 })
    expect(hourRange([appt('a', '07:15', '08:00'), appt('b', '20:00', '21:30')])).toEqual({ startHour: 7, endHour: 22 })
    expect(hourRange([appt('a', '00:00', '23:59')])).toEqual({ startHour: 8, endHour: 20 })
  })
})

describe('etichette e navigazione', () => {
  it('rangeLabel', () => {
    expect(rangeLabel('giorno', '2026-10-02')).toBe('Venerdì 2 ottobre 2026')
    expect(rangeLabel('mese', '2026-10-02')).toBe('Ottobre 2026')
    expect(rangeLabel('settimana', '2026-10-02')).toBe('28 set – 4 ott 2026')
    expect(rangeLabel('settimana', '2026-10-07')).toBe('5 – 11 ott 2026')
    expect(rangeLabel('settimana', '2026-12-30')).toBe('28 dic 2026 – 3 gen 2027')
  })
  it('viewRange', () => {
    expect(viewRange('giorno', '2026-10-02')).toEqual({ from: '2026-10-02', to: '2026-10-02' })
    expect(viewRange('settimana', '2026-10-02')).toEqual({ from: '2026-09-28', to: '2026-10-04' })
    expect(viewRange('mese', '2026-10-15')).toEqual({ from: '2026-09-28', to: '2026-11-08' })
  })
  it('stepDay', () => {
    expect(stepDay('giorno', '2026-10-02', 1)).toBe('2026-10-03')
    expect(stepDay('settimana', '2026-10-02', -1)).toBe('2026-09-25')
    expect(stepDay('mese', '2026-01-31', 1)).toBe('2026-02-28')
  })
  it('relativeDayLabel', () => {
    expect(relativeDayLabel('2026-10-02', '2026-10-02')).toBe('Oggi · venerdì 2 ottobre')
    expect(relativeDayLabel('2026-10-03', '2026-10-02')).toBe('Domani · sabato 3 ottobre')
    expect(relativeDayLabel('2026-10-01', '2026-10-02')).toBe('Ieri · giovedì 1 ottobre')
    expect(relativeDayLabel('2026-10-07', '2026-10-02')).toBe('Mercoledì 7 ottobre')
    expect(relativeDayLabel('2027-01-07', '2026-10-02')).toBe('Giovedì 7 gennaio 2027')
  })
})

describe('link', () => {
  it('telHref', () => {
    expect(telHref('+39 000 000 0106')).toBe('tel:+390000000106')
    expect(telHref('Link nella mail')).toBeUndefined()
  })
  it('mapsHref codifica l\'indirizzo', () => {
    expect(mapsHref('Via dei Tigli 12, Milano')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Via%20dei%20Tigli%2012%2C%20Milano',
    )
  })
})
