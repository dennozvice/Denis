import { describe, expect, it } from 'vitest'
import type { Task } from '../../domain/types'
import {
  categoryGroupOf,
  completedOn,
  endOfWeek,
  formatDueForMessage,
  groupForPage,
  groupToday,
  matchesCategoryGroup,
  matchesSearch,
  normalizeText,
  postponedDate,
  sortByCompletion,
} from './taskUtils'

// venerdì 2 ottobre 2026
const TODAY = '2026-10-02'

let seq = 0
function task(partial: Partial<Task>): Task {
  seq += 1
  return {
    id: `t${seq}`,
    title: `Attività ${seq}`,
    category: 'altro',
    priority: 'media',
    dueDate: TODAY,
    status: 'da_fare',
    createdAt: '2026-09-28T08:00:00.000Z',
    ...partial,
  }
}

describe('categoryGroupOf / matchesCategoryGroup', () => {
  it('assegna le categorie alle aree del widget', () => {
    expect(categoryGroupOf('ricontatto')).toBe('clienti')
    expect(categoryGroupOf('commerciale')).toBe('clienti')
    expect(categoryGroupOf('ricorrenza')).toBe('clienti')
    expect(categoryGroupOf('compliance')).toBe('compliance')
    expect(categoryGroupOf('adeguatezza')).toBe('compliance')
    expect(categoryGroupOf('documento')).toBe('compliance')
    expect(categoryGroupOf('pratica')).toBe('pratiche')
    expect(categoryGroupOf('versamento')).toBe('pratiche')
    expect(categoryGroupOf('scadenza_polizza')).toBe('pratiche')
    expect(categoryGroupOf('formazione')).toBe('altro')
    expect(categoryGroupOf('amministrativa')).toBe('altro')
    expect(categoryGroupOf('altro')).toBe('altro')
  })

  it('"tutte" accetta qualunque categoria', () => {
    expect(matchesCategoryGroup(task({ category: 'pratica' }), 'tutte')).toBe(true)
    expect(matchesCategoryGroup(task({ category: 'pratica' }), 'clienti')).toBe(false)
  })
})

describe('ricerca', () => {
  it('ignora maiuscole e accenti', () => {
    expect(normalizeText('  Attività È Già ')).toBe('attivita e gia')
  })

  it('cerca in titolo, note e nome cliente, tutte le parole', () => {
    const t = task({ title: 'Richiamare per la revisione', notes: 'Portare il report' })
    expect(matchesSearch(t, 'revisione', '')).toBe(true)
    expect(matchesSearch(t, 'REPORT', '')).toBe(true)
    expect(matchesSearch(t, 'niccolò', 'Niccolo Ferri')).toBe(true)
    expect(matchesSearch(t, 'revisione ferri', 'Niccolo Ferri')).toBe(true)
    expect(matchesSearch(t, 'revisione bianchi', 'Niccolo Ferri')).toBe(false)
    expect(matchesSearch(t, '   ', '')).toBe(true)
  })
})

describe('date', () => {
  it('completedOn usa il fuso di Roma', () => {
    // 22:30 UTC del 1° ottobre = 00:30 del 2 ottobre a Roma (ora legale)
    expect(completedOn(task({ status: 'completata', completedAt: '2026-10-01T22:30:00.000Z' }))).toBe('2026-10-02')
    expect(completedOn(task({ status: 'completata', completedAt: '2026-10-01T21:30:00.000Z' }))).toBe('2026-10-01')
    expect(completedOn(task({}))).toBeUndefined()
  })

  it('rimandare parte da oggi se l’attività è in ritardo', () => {
    expect(postponedDate(task({ dueDate: '2026-09-29' }), 1, TODAY)).toBe('2026-10-03')
    expect(postponedDate(task({ dueDate: '2026-10-05' }), 7, TODAY)).toBe('2026-10-12')
    expect(postponedDate(task({ dueDate: TODAY }), 1, TODAY)).toBe('2026-10-03')
  })

  it('fine settimana = domenica', () => {
    expect(endOfWeek('2026-10-02')).toBe('2026-10-04')
    expect(endOfWeek('2026-10-04')).toBe('2026-10-04')
    expect(endOfWeek('2026-10-05')).toBe('2026-10-11')
  })

  it('messaggi relativi', () => {
    expect(formatDueForMessage('2026-10-03', TODAY)).toBe('domani')
    expect(formatDueForMessage(TODAY, TODAY)).toBe('oggi')
    expect(formatDueForMessage('2026-10-09', TODAY)).toMatch(/9 ott/)
  })
})

describe('groupToday', () => {
  it('divide in ritardo, oggi, completate oggi e domani', () => {
    const late = task({ dueDate: '2026-09-30' })
    const now = task({ dueDate: TODAY })
    const waiting = task({ dueDate: TODAY, status: 'in_attesa' })
    const doneToday = task({ dueDate: TODAY, status: 'completata', completedAt: '2026-10-02T07:00:00.000Z' })
    const doneEarlyFuture = task({ dueDate: '2026-10-06', status: 'completata', completedAt: '2026-10-02T09:00:00.000Z' })
    const doneYesterday = task({ dueDate: '2026-10-01', status: 'completata', completedAt: '2026-10-01T09:00:00.000Z' })
    const tomorrow = task({ dueDate: '2026-10-03' })
    const later = task({ dueDate: '2026-10-10' })
    const g = groupToday([late, now, waiting, doneToday, doneEarlyFuture, doneYesterday, tomorrow, later], TODAY)
    expect(g.overdue.map((t) => t.id)).toEqual([late.id])
    expect(g.today.map((t) => t.id).sort()).toEqual([now.id, waiting.id].sort())
    expect(g.done.map((t) => t.id)).toEqual([doneEarlyFuture.id, doneToday.id])
    expect(g.tomorrow.map((t) => t.id)).toEqual([tomorrow.id])
  })
})

describe('groupForPage', () => {
  it('raggruppa per scadenza e omette i gruppi vuoti', () => {
    const list = [
      task({ dueDate: '2026-09-25' }),
      task({ dueDate: TODAY }),
      task({ dueDate: '2026-10-03' }),
      task({ dueDate: '2026-10-04' }),
      task({ dueDate: '2026-10-05' }),
      task({ dueDate: '2026-10-01', status: 'completata', completedAt: '2026-10-01T10:00:00.000Z' }),
    ]
    const groups = groupForPage(list, TODAY)
    expect(groups.map((g) => [g.id, g.tasks.length])).toEqual([
      ['ritardo', 1],
      ['oggi', 1],
      ['domani', 1],
      ['settimana', 1],
      ['prossime', 1],
      ['completate', 1],
    ])
    expect(groupForPage([task({ dueDate: '2026-10-20' })], TODAY).map((g) => g.id)).toEqual(['prossime'])
  })

  it('di domenica "Questa settimana" resta vuota', () => {
    const sunday = '2026-10-04'
    const groups = groupForPage([task({ dueDate: '2026-10-05' }), task({ dueDate: '2026-10-06' })], sunday)
    expect(groups.map((g) => g.id)).toEqual(['domani', 'prossime'])
  })

  it('le completate sono ordinate dalla più recente', () => {
    const a = task({ status: 'completata', completedAt: '2026-10-01T10:00:00.000Z' })
    const b = task({ status: 'completata', completedAt: '2026-10-02T10:00:00.000Z' })
    expect(sortByCompletion([a, b]).map((t) => t.id)).toEqual([b.id, a.id])
  })
})
