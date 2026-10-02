import { describe, expect, it } from 'vitest'
import { createDemoData } from '../data/demoSeed'
import { nowInRome } from '../lib/dates'
import {
  appointmentsOn,
  clientsToRecontact,
  computeDeadlines,
  computeKpis,
  computeNotifications,
  findTaskForDeadline,
  nextAppointment,
  todayTasks,
} from './selectors'

const TODAY = '2026-10-02'
const data = createDemoData(TODAY)
// 08:00 di Roma = 06:00 UTC (ora legale)
const morning = nowInRome(new Date(Date.UTC(2026, 9, 2, 6, 0)))

describe('selettori', () => {
  it('attività di oggi, in ritardo e completate', () => {
    const t = todayTasks(data.tasks, TODAY)
    expect(t.overdue.map((x) => x.id)).toEqual(['t02', 't05'])
    expect(t.today[0].id).toBe('t01') // ha orario 09:00
    expect(t.doneToday.map((x) => x.id).sort()).toEqual(['t09', 't10'])
    expect(t.total).toBe(t.overdue.length + t.today.length + t.doneToday.length)
  })

  it('le completate si contano nel giorno di Roma, non in UTC', () => {
    // 22:30 UTC del 1° ottobre = 00:30 del 2 ottobre a Roma
    const late = { ...data.tasks[0], id: 'x', dueDate: '2026-09-30', status: 'completata' as const, completedAt: '2026-10-01T22:30:00.000Z' }
    expect(todayTasks([late], TODAY).doneToday).toHaveLength(1)
    expect(todayTasks([late], '2026-10-01').doneToday).toHaveLength(0)
  })

  it('agenda di oggi ordinata e prossimo appuntamento', () => {
    expect(appointmentsOn(data.appointments, TODAY).map((a) => a.start)).toEqual(['09:30', '11:30', '14:30', '16:00'])
    expect(nextAppointment(data.appointments, morning)?.id).toBe('a01')
  })

  it('scadenze calcolate dai clienti', () => {
    const list = computeDeadlines(data, TODAY, { horizonDays: 30 })
    const kinds = new Set(list.map((d) => d.kind))
    expect(kinds).toContain('documento')
    expect(kinds).toContain('antiriciclaggio')
    expect(kinds).toContain('adeguatezza')
    expect(kinds).toContain('compleanno')
    const doc = list.find((d) => d.id === 'doc-c02')!
    expect(doc.daysLeft).toBe(-4)
    expect(doc.severity).toBe('scaduta')
    const idd = list.find((d) => d.id === 'idd-c04')!
    expect(idd.daysLeft).toBe(-5)
    const bday = list.find((d) => d.kind === 'compleanno' && d.clientId === 'c07')!
    expect(bday.daysLeft).toBe(0)
    expect(bday.title).toContain('67 anni')
    expect(list.every((d, i) => i === 0 || list[i - 1].date <= d.date)).toBe(true)
  })

  it('collega le attività alle scadenze', () => {
    const list = computeDeadlines(data, TODAY, { horizonDays: 30 })
    const doc = list.find((d) => d.id === 'doc-c02')!
    expect(findTaskForDeadline(data.tasks, doc)?.id).toBe('t02') // stessa cliente e categoria
    const bday = list.find((d) => d.kind === 'compleanno' && d.clientId === 'c07')!
    expect(findTaskForDeadline(data.tasks, bday)).toBeUndefined() // ricorrenze: solo collegamento esplicito
    const linked = [{ ...data.tasks[0], id: 'z', deadlineId: bday.id }]
    expect(findTaskForDeadline(linked, bday)?.id).toBe('z')
  })

  it('reclamo senza scadenza: termine di 45 giorni dall\'apertura', () => {
    const d2 = { ...data, cases: [{ id: 'r', type: 'reclamo' as const, title: 'R', openedOn: '2026-09-20', status: 'aperta' as const }] }
    const dl = computeDeadlines(d2, TODAY, { horizonDays: 60 }).find((d) => d.caseId === 'r')
    expect(dl?.date).toBe('2026-11-04')
  })

  it('nati il 29 febbraio: età corretta nel promemoria del 28 febbraio', () => {
    const d2 = { ...data, clients: [{ id: 'x', firstName: 'A', lastName: 'B', birthDate: '1960-02-29', policies: [] }] }
    const b = computeDeadlines(d2, '2027-02-20', { horizonDays: 30 }).find((d) => d.kind === 'compleanno')
    expect(b?.date).toBe('2027-02-28')
    expect(b?.title).toContain('67 anni')
  })

  it('clienti da ricontattare', () => {
    const list = clientsToRecontact(data.clients, TODAY, 180)
    expect(list[0].client.id).toBe('c11')
    expect(list.some((x) => x.client.id === 'c08')).toBe(false) // prospect senza polizze
  })

  it('KPI e notifiche', () => {
    const k = computeKpis(data, morning)
    expect(k.appointmentsToday).toBe(4)
    expect(k.tasksOverdue).toBe(2)
    expect(k.productionMonth?.current).toBe(16200)
    const n = computeNotifications(data, morning)
    expect(n.some((x) => x.kind === 'attivita')).toBe(true)
    expect(n.some((x) => x.kind === 'scadenza')).toBe(true)
  })
})
