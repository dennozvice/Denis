/** Funzioni pure condivise dal widget "Attività di oggi" e dalla pagina Attività. */
import type { Client, DateKey, Task, TaskCategory } from '../../domain/types'
import { addDays, weekdayIndex } from '../../lib/dates'
import { formatDayMonth, formatWeekdayShort } from '../../lib/format'
import { isOpen, sortTasks, todayTasks } from '../../store/selectors'

// ---------------------------------------------------------------- filtri per area (widget)

export type CategoryGroup = 'tutte' | 'clienti' | 'compliance' | 'pratiche' | 'altro'

const GROUP_CATEGORIES: Record<Exclude<CategoryGroup, 'tutte' | 'altro'>, TaskCategory[]> = {
  clienti: ['ricontatto', 'commerciale', 'ricorrenza'],
  compliance: ['compliance', 'adeguatezza', 'documento'],
  pratiche: ['pratica', 'versamento', 'scadenza_polizza'],
}

export const CATEGORY_GROUP_OPTIONS: { value: CategoryGroup; label: string }[] = [
  { value: 'tutte', label: 'Tutte' },
  { value: 'clienti', label: 'Clienti' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'pratiche', label: 'Pratiche' },
  { value: 'altro', label: 'Altro' },
]

/** Area di appartenenza di una categoria (formazione, amministrativa e altro → "altro"). */
export function categoryGroupOf(category: TaskCategory): Exclude<CategoryGroup, 'tutte'> {
  for (const [group, list] of Object.entries(GROUP_CATEGORIES)) {
    if (list.includes(category)) return group as Exclude<CategoryGroup, 'tutte'>
  }
  return 'altro'
}

export function matchesCategoryGroup(task: Task, group: CategoryGroup): boolean {
  return group === 'tutte' || categoryGroupOf(task.category) === group
}

// ---------------------------------------------------------------- testo

/** Minuscolo e senza accenti: "Attività" → "attivita". */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Ricerca su titolo, note e nome del cliente, senza distinzione di maiuscole e accenti. */
export function matchesSearch(task: Task, query: string, clientName: string): boolean {
  const q = normalizeText(query)
  if (!q) return true
  const haystack = normalizeText(`${task.title} ${task.notes ?? ''} ${clientName}`)
  return q.split(/\s+/).every((word) => haystack.includes(word))
}

// ---------------------------------------------------------------- date

/** Nuova scadenza quando si rimanda: si parte da oggi se l'attività è già in ritardo. */
export function postponedDate(task: Task, days: number, today: DateKey): DateKey {
  const base = task.dueDate < today ? today : task.dueDate
  return addDays(base, days)
}

/** "ven 2 ott" */
export function formatDueShort(key: DateKey): string {
  return `${formatWeekdayShort(key)} ${formatDayMonth(key)}`
}

/** "domani", "oggi", "ven 9 ott": per i messaggi dei toast. */
export function formatDueForMessage(key: DateKey, today: DateKey): string {
  if (key === today) return 'oggi'
  if (key === addDays(today, 1)) return 'domani'
  return formatDueShort(key)
}

/** Ultimo giorno (domenica) della settimana che contiene `today`. */
export function endOfWeek(today: DateKey): DateKey {
  return addDays(today, 6 - weekdayIndex(today))
}

// ---------------------------------------------------------------- attività di oggi

export interface TodayGroups {
  overdue: Task[]
  today: Task[]
  /** Completate oggi (qualunque fosse la scadenza) o con scadenza oggi già completate. */
  done: Task[]
  tomorrow: Task[]
}

/**
 * `todayTasks` dei selettori (stessi conteggi dei KPI e della pagina Attività),
 * con le completate ordinate dalla più recente.
 */
export function groupToday(tasks: Task[], today: DateKey): TodayGroups {
  const t = todayTasks(tasks, today)
  return { overdue: t.overdue, today: t.today, done: sortByCompletion(t.doneToday), tomorrow: t.tomorrow }
}

export interface TaskCounts {
  /** Tutte le attività aperte. */
  open: number
  /** Aperte con scadenza passata. */
  late: number
  /** Aperte con scadenza oggi. */
  dueToday: number
  /** Completate oggi (giorno di Roma) o in scadenza oggi e già completate: come il KPI della Panoramica. */
  doneToday: number
}

/** Conteggi del sottotitolo della pagina Attività, calcolati con gli stessi selettori della Panoramica. */
export function countTasks(tasks: Task[], today: DateKey): TaskCounts {
  const t = todayTasks(tasks, today)
  return {
    open: tasks.filter(isOpen).length,
    late: t.overdue.length,
    dueToday: t.today.length,
    doneToday: t.doneToday.length,
  }
}

/** Completate, le più recenti prima. */
export function sortByCompletion(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const ac = a.completedAt ?? ''
    const bc = b.completedAt ?? ''
    if (ac !== bc) return ac < bc ? 1 : -1
    return a.title.localeCompare(b.title, 'it')
  })
}

// ---------------------------------------------------------------- pagina Attività

export type PageGroupId = 'ritardo' | 'oggi' | 'domani' | 'settimana' | 'prossime' | 'completate'

export interface PageGroup {
  id: PageGroupId
  label: string
  tasks: Task[]
}

const PAGE_GROUP_LABEL: Record<PageGroupId, string> = {
  ritardo: 'In ritardo',
  oggi: 'Oggi',
  domani: 'Domani',
  settimana: 'Questa settimana',
  prossime: 'Prossime settimane',
  completate: 'Completate',
}

/** Raggruppa per scadenza (aperte) e mette in fondo le completate, dalla più recente. Omette i gruppi vuoti. */
export function groupForPage(tasks: Task[], today: DateKey): PageGroup[] {
  const tomorrow = addDays(today, 1)
  const sunday = endOfWeek(today)
  const buckets: Record<PageGroupId, Task[]> = {
    ritardo: [],
    oggi: [],
    domani: [],
    settimana: [],
    prossime: [],
    completate: [],
  }
  for (const t of tasks) {
    if (!isOpen(t)) buckets.completate.push(t)
    else if (t.dueDate < today) buckets.ritardo.push(t)
    else if (t.dueDate === today) buckets.oggi.push(t)
    else if (t.dueDate === tomorrow) buckets.domani.push(t)
    else if (t.dueDate <= sunday) buckets.settimana.push(t)
    else buckets.prossime.push(t)
  }
  return (Object.keys(buckets) as PageGroupId[])
    .map((id) => ({
      id,
      label: PAGE_GROUP_LABEL[id],
      tasks: id === 'completate' ? sortByCompletion(buckets[id]) : sortTasks(buckets[id]),
    }))
    .filter((g) => g.tasks.length > 0)
}

// ---------------------------------------------------------------- clienti

/** Clienti ordinati per cognome e nome. */
export function sortClientsByLastName(clients: Client[]): Client[] {
  return [...clients].sort(
    (a, b) => a.lastName.localeCompare(b.lastName, 'it') || a.firstName.localeCompare(b.firstName, 'it'),
  )
}

/** "Rossi Mario": per le liste ordinate per cognome. */
export function clientSortName(client: Client): string {
  return `${client.lastName} ${client.firstName}`.trim()
}
