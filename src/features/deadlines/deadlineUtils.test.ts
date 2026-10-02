import { describe, expect, it } from 'vitest'
import { createDemoData } from '../../data/demoSeed'
import type { Deadline, Task } from '../../domain/types'
import { complianceDeadlines, computeDeadlines } from '../../store/selectors'
import {
  countByBucket,
  countByFilter,
  deadlineBucket,
  deadlineDaysLabel,
  deadlineDaysTone,
  deadlineHref,
  formatDeadlineDate,
  groupDeadlinesByMonth,
  linkedTasksByDeadline,
  matchesDeadlineFilter,
  taskDefaultsForDeadline,
} from './deadlineUtils'

const TODAY = '2026-10-02'
const dl = (patch: Partial<Deadline>): Deadline => ({
  id: 'x',
  kind: 'documento',
  date: TODAY,
  daysLeft: 0,
  title: 'Documento in scadenza: Mario Rossi',
  severity: 'urgente',
  ...patch,
})

describe('etichette dei giorni', () => {
  it('testo', () => {
    expect(deadlineDaysLabel(-4)).toBe('Scaduta da 4 gg')
    expect(deadlineDaysLabel(-1)).toBe('Scaduta ieri')
    expect(deadlineDaysLabel(0)).toBe('Oggi')
    expect(deadlineDaysLabel(1)).toBe('Domani')
    expect(deadlineDaysLabel(12)).toBe('Tra 12 gg')
    expect(deadlineDaysLabel(5)).toBe('Tra 5 gg')
  })
  it('tono', () => {
    expect(deadlineDaysTone({ daysLeft: -2, severity: 'scaduta' })).toBe('negative')
    expect(deadlineDaysTone({ daysLeft: 7, severity: 'urgente' })).toBe('warning')
    expect(deadlineDaysTone({ daysLeft: 3, severity: 'info' })).toBe('primary')
    expect(deadlineDaysTone({ daysLeft: 8, severity: 'prossima' })).toBe('neutral')
  })
  it('data con anno solo se diverso da quello corrente', () => {
    expect(formatDeadlineDate('2026-10-12', TODAY)).toBe('12 ott')
    expect(formatDeadlineDate('2025-09-28', TODAY)).toBe('28/09/2025')
  })
})

describe('fasce del widget', () => {
  it('disgiunte: scadute, entro 7 giorni, oltre', () => {
    expect(deadlineBucket({ daysLeft: -1 })).toBe('scadute')
    expect(deadlineBucket({ daysLeft: 0 })).toBe('settimana')
    expect(deadlineBucket({ daysLeft: 7 })).toBe('settimana')
    expect(deadlineBucket({ daysLeft: 8 })).toBe('mese')
    const counts = countByBucket([dl({ daysLeft: -3 }), dl({ daysLeft: 2 }), dl({ daysLeft: 20 }), dl({ daysLeft: 30 })])
    expect(counts).toEqual({ scadute: 1, settimana: 1, mese: 2 })
  })
})

describe('filtri per tipo', () => {
  it('raggruppa i tipi', () => {
    expect(matchesDeadlineFilter({ kind: 'antiriciclaggio' }, 'adempimenti')).toBe(true)
    expect(matchesDeadlineFilter({ kind: 'anniversario_polizza' }, 'polizze')).toBe(true)
    expect(matchesDeadlineFilter({ kind: 'compleanno' }, 'adempimenti')).toBe(false)
    expect(matchesDeadlineFilter({ kind: 'pratica' }, 'tutte')).toBe(true)
    const counts = countByFilter([dl({ kind: 'documento' }), dl({ kind: 'compleanno' }), dl({ kind: 'pratica' })])
    expect(counts).toEqual({ tutte: 3, adempimenti: 1, polizze: 0, compleanni: 1, pratiche: 1 })
  })
})

describe('raggruppamento per mese', () => {
  it('"Scadute" in testa, poi i mesi in ordine', () => {
    const groups = groupDeadlinesByMonth([
      dl({ id: 'a', date: '2025-09-28', daysLeft: -369 }),
      dl({ id: 'b', date: '2026-09-28', daysLeft: -4 }),
      dl({ id: 'c', date: '2026-10-05', daysLeft: 3 }),
      dl({ id: 'd', date: '2026-11-01', daysLeft: 30 }),
      dl({ id: 'e', date: '2026-10-30', daysLeft: 28 }),
    ])
    expect(groups.map((g) => [g.id, g.label, g.items.map((d) => d.id)])).toEqual([
      ['scadute', 'Scadute', ['a', 'b']],
      ['2026-10', 'Ottobre 2026', ['c', 'e']],
      ['2026-11', 'Novembre 2026', ['d']],
    ])
  })
  it('lista vuota → nessun gruppo', () => {
    expect(groupDeadlinesByMonth([])).toEqual([])
  })
})

describe('collegamenti e attività', () => {
  it('link alla pratica (con parametri) o al cliente', () => {
    expect(deadlineHref({ caseId: 'k02', clientId: 'c12' })).toBe('#/pratiche?id=k02')
    expect(deadlineHref({ caseId: 'k02' }, { vista: 'scadenze' })).toBe('#/pratiche?vista=scadenze&id=k02')
    expect(deadlineHref({ clientId: 'c02' })).toBe('#/clienti?id=c02')
  })
  it('valori iniziali dell’attività', () => {
    const expired = taskDefaultsForDeadline(dl({ kind: 'antiriciclaggio', date: '2026-09-28', daysLeft: -4, severity: 'scaduta', clientId: 'c03' }), TODAY)
    expect(expired).toMatchObject({ category: 'compliance', clientId: 'c03', deadlineId: 'x', dueDate: TODAY, priority: 'alta' })
    const later = taskDefaultsForDeadline(dl({ kind: 'scadenza_polizza', date: '2026-10-25', daysLeft: 23, severity: 'prossima', detail: 'Opportunità di reinvestimento' }), TODAY)
    expect(later).toMatchObject({ category: 'scadenza_polizza', dueDate: '2026-10-25', priority: 'media', notes: 'Opportunità di reinvestimento' })
  })
  const task = (patch: Partial<Task>): Task => ({
    id: 't',
    title: 'Richiedere documento',
    category: 'documento',
    priority: 'alta',
    dueDate: TODAY,
    status: 'da_fare',
    createdAt: '2026-10-01T08:00:00.000Z',
    clientId: 'c02',
    ...patch,
  })
  it('adempimenti unici per cliente: basta un’attività aperta con stesso cliente e categoria', () => {
    const doc = dl({ id: 'doc-c02', kind: 'documento', clientId: 'c02' })
    const aml = dl({ id: 'aml-c02', kind: 'antiriciclaggio', clientId: 'c02' })
    const amlDone = dl({ id: 'aml-c05', kind: 'antiriciclaggio', clientId: 'c05' })
    const linked = linkedTasksByDeadline([task({}), task({ id: 't2', clientId: 'c05', status: 'completata', category: 'compliance' })], [doc, aml, amlDone])
    expect(linked.get('doc-c02')?.id).toBe('t')
    expect(linked.has('aml-c02')).toBe(false)
    expect(linked.has('aml-c05')).toBe(false)
  })
  it('ricorrenze: una sola attività "ricorrenza" non copre compleanno e anniversari dello stesso cliente', () => {
    const bday = dl({ id: 'bday-c01-2026-10-05', kind: 'compleanno', clientId: 'c01', severity: 'info' })
    const ann = dl({ id: 'ann-p01-2026-11-11', kind: 'anniversario_polizza', clientId: 'c01', severity: 'info' })
    const generic = task({ id: 'r1', category: 'ricorrenza', clientId: 'c01' })
    expect(linkedTasksByDeadline([generic], [bday, ann]).size).toBe(0)
    const fromBday = task({ id: 'r2', category: 'ricorrenza', clientId: 'c01', deadlineId: bday.id })
    const linked = linkedTasksByDeadline([generic, fromBday], [bday, ann])
    expect(linked.get(bday.id)?.id).toBe('r2')
    expect(linked.has(ann.id)).toBe(false)
  })
  it('l’attività creata da una scadenza vi resta collegata (deadlineId), finché è aperta', () => {
    const ann = dl({ id: 'ann-p01-2026-11-11', kind: 'anniversario_polizza', clientId: 'c01', severity: 'info' })
    const defaults = taskDefaultsForDeadline(ann, TODAY)
    const created = task({ ...defaults, id: 'n1' })
    expect(linkedTasksByDeadline([created], [ann]).get(ann.id)?.id).toBe('n1')
    expect(linkedTasksByDeadline([{ ...created, status: 'completata' }], [ann]).size).toBe(0)
  })
})

describe('dati dimostrativi', () => {
  it('il widget ha scadute, urgenti e attività già presenti', () => {
    const data = createDemoData(TODAY)
    const list = complianceDeadlines(computeDeadlines(data, TODAY, { horizonDays: 30 }))
    const counts = countByBucket(list)
    expect(counts.scadute).toBeGreaterThan(0)
    expect(counts.settimana).toBeGreaterThan(0)
    const linked = linkedTasksByDeadline(data.tasks, list)
    const withTask = list.filter((d) => linked.has(d.id))
    expect(withTask.length).toBeGreaterThan(0)
    expect(withTask.length).toBeLessThan(list.length)
  })
})
