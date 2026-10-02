/** Funzioni pure per il widget "Scadenze e adempimenti" e per lo Scadenzario della pagina Pratiche. */
import type { CSSProperties } from 'react'
import { DEADLINE_TO_TASK_CATEGORY, TONE_BG, TONE_COLOR, type Tone } from '../../domain/labels'
import type { DateKey, Deadline, DeadlineKind, Task } from '../../domain/types'
import { parseKey } from '../../lib/dates'
import { capitalize, formatDateShort, formatDayMonth, formatMonthYear, formatNumber } from '../../lib/format'
import { buildHref } from '../../router/router'
import type { NewTask } from '../../store/StoreContext'
import { isOpen } from '../../store/selectors'

// ---------------------------------------------------------------- colori

/** Variabili CSS locali (--cs-tone, --cs-tone-bg) per icone e pallini colorati in base al tono. */
export function toneVars(tone: Tone): CSSProperties {
  return { '--cs-tone': TONE_COLOR[tone], '--cs-tone-bg': TONE_BG[tone] } as CSSProperties
}

// ---------------------------------------------------------------- giorni mancanti

/** "Scaduta da 4 gg", "Scaduta ieri", "Oggi", "Domani", "Tra 12 gg". */
export function deadlineDaysLabel(daysLeft: number): string {
  if (daysLeft < -1) return `Scaduta da ${formatNumber(-daysLeft)} gg`
  if (daysLeft === -1) return 'Scaduta ieri'
  if (daysLeft === 0) return 'Oggi'
  if (daysLeft === 1) return 'Domani'
  return `Tra ${formatNumber(daysLeft)} gg`
}

/** Scaduta = rosso; entro 7 giorni = arancio (blu per le ricorrenze); oltre = neutro. */
export function deadlineDaysTone(d: Pick<Deadline, 'daysLeft' | 'severity'>): Tone {
  if (d.daysLeft < 0) return 'negative'
  if (d.daysLeft <= 7) return d.severity === 'info' ? 'primary' : 'warning'
  return 'neutral'
}

/** "28 set" se nell'anno corrente, altrimenti "28/09/2025" (per documenti scaduti da molto). */
export function formatDeadlineDate(date: DateKey, today: DateKey): string {
  return parseKey(date).year === parseKey(today).year ? formatDayMonth(date) : formatDateShort(date)
}

// ---------------------------------------------------------------- riepilogo (widget)

export type DeadlineBucket = 'scadute' | 'settimana' | 'mese'

/** Fasce disgiunte: già scadute, entro 7 giorni (oggi compreso), oltre 7 giorni. */
export function deadlineBucket(d: Pick<Deadline, 'daysLeft'>): DeadlineBucket {
  if (d.daysLeft < 0) return 'scadute'
  if (d.daysLeft <= 7) return 'settimana'
  return 'mese'
}

export function countByBucket(list: Deadline[]): Record<DeadlineBucket, number> {
  const counts: Record<DeadlineBucket, number> = { scadute: 0, settimana: 0, mese: 0 }
  for (const d of list) counts[deadlineBucket(d)]++
  return counts
}

// ---------------------------------------------------------------- filtri per tipo (scadenzario)

export type DeadlineFilter = 'tutte' | 'adempimenti' | 'polizze' | 'compleanni' | 'pratiche'

const FILTER_KINDS: Record<Exclude<DeadlineFilter, 'tutte'>, DeadlineKind[]> = {
  adempimenti: ['documento', 'antiriciclaggio', 'adeguatezza'],
  polizze: ['scadenza_polizza', 'anniversario_polizza'],
  compleanni: ['compleanno'],
  pratiche: ['pratica'],
}

export const DEADLINE_FILTER_OPTIONS: { value: DeadlineFilter; label: string; title?: string }[] = [
  { value: 'tutte', label: 'Tutte' },
  { value: 'adempimenti', label: 'Adempimenti', title: "Documento d'identità, adeguata verifica, questionario di adeguatezza" },
  { value: 'polizze', label: 'Polizze', title: 'Scadenze e anniversari di polizza' },
  { value: 'compleanni', label: 'Compleanni' },
  { value: 'pratiche', label: 'Pratiche', title: 'Termini delle pratiche aperte' },
]

export function matchesDeadlineFilter(d: Pick<Deadline, 'kind'>, filter: DeadlineFilter): boolean {
  return filter === 'tutte' || FILTER_KINDS[filter].includes(d.kind)
}

export function countByFilter(list: Deadline[]): Record<DeadlineFilter, number> {
  const counts: Record<DeadlineFilter, number> = { tutte: list.length, adempimenti: 0, polizze: 0, compleanni: 0, pratiche: 0 }
  for (const d of list) {
    for (const key of Object.keys(FILTER_KINDS) as Exclude<DeadlineFilter, 'tutte'>[]) {
      if (FILTER_KINDS[key].includes(d.kind)) counts[key]++
    }
  }
  return counts
}

// ---------------------------------------------------------------- raggruppamento per mese

export interface DeadlineGroup {
  /** 'scadute' oppure "YYYY-MM". */
  id: string
  label: string
  items: Deadline[]
}

/** Gruppo "Scadute" in testa, poi un gruppo per mese ("Ottobre 2026"). Mantiene l'ordine della lista. */
export function groupDeadlinesByMonth(list: Deadline[]): DeadlineGroup[] {
  const expired: Deadline[] = []
  const months = new Map<string, DeadlineGroup>()
  for (const d of list) {
    if (d.daysLeft < 0) {
      expired.push(d)
      continue
    }
    const id = d.date.slice(0, 7)
    let group = months.get(id)
    if (!group) {
      group = { id, label: capitalize(formatMonthYear(d.date)), items: [] }
      months.set(id, group)
    }
    group.items.push(d)
  }
  const sorted = [...months.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return expired.length > 0 ? [{ id: 'scadute', label: 'Scadute', items: expired }, ...sorted] : sorted
}

// ---------------------------------------------------------------- collegamenti e attività

/** Destinazione del clic su una scadenza: la pratica, altrimenti la scheda cliente. */
export function deadlineHref(d: Pick<Deadline, 'caseId' | 'clientId'>, caseParams: Record<string, string | undefined> = {}): string {
  if (d.caseId) return buildHref('pratiche', { ...caseParams, id: d.caseId })
  if (d.clientId) return buildHref('clienti', { id: d.clientId })
  return buildHref('clienti')
}

/** Valori iniziali del form "Nuova attività" creata a partire da una scadenza. */
export function taskDefaultsForDeadline(d: Deadline, today: DateKey): Partial<NewTask> {
  return {
    title: d.title,
    category: DEADLINE_TO_TASK_CATEGORY[d.kind],
    clientId: d.clientId,
    dueDate: d.date > today ? d.date : today,
    priority: d.severity === 'scaduta' || d.severity === 'urgente' ? 'alta' : 'media',
    notes: d.detail,
  }
}

const normalizeTitle = (s: string) => s.trim().toLowerCase()

/** Chiave "cliente + categoria" (o "titolo + categoria" senza cliente) per riconoscere un'attività già presente. */
function taskKey(clientId: string | undefined, title: string, category: string): string {
  return clientId ? `c:${clientId}|${category}` : `t:${normalizeTitle(title)}|${category}`
}

/** Chiavi delle attività aperte, da confrontare con `deadlineTaskKey`. */
export function openTaskKeys(tasks: Task[]): Set<string> {
  const keys = new Set<string>()
  for (const t of tasks) if (isOpen(t)) keys.add(taskKey(t.clientId, t.title, t.category))
  return keys
}

export function deadlineTaskKey(d: Pick<Deadline, 'clientId' | 'title' | 'kind'>): string {
  return taskKey(d.clientId, d.title, DEADLINE_TO_TASK_CATEGORY[d.kind])
}
