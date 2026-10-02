/**
 * Funzioni pure che derivano informazioni dallo stato (nessun effetto collaterale):
 * attività del giorno, agenda, scadenze calcolate dai clienti, KPI, notifiche.
 */
import type {
  AppData,
  Appointment,
  AppointmentType,
  Case,
  Client,
  DateKey,
  Deadline,
  Goal,
  Task,
} from '../domain/types'
import { DEADLINE_TO_TASK_CATEGORY, POLICY_KIND_LABEL, PRIORITY_RANK } from '../domain/labels'
import { addDays, addMonths, diffDays, instantToRome, nextAnniversary, timeToMinutes, type RomeNow } from '../lib/dates'

// ---------------------------------------------------------------- generali

export function indexById<T extends { id: string }>(list: T[]): Map<string, T> {
  return new Map(list.map((item) => [item.id, item]))
}

export function clientFullName(client: Pick<Client, 'firstName' | 'lastName'>): string {
  return `${client.firstName} ${client.lastName}`.trim()
}

/** Nome del cliente collegato, o stringa vuota. */
export function clientNameById(clients: Client[] | Map<string, Client>, id: string | undefined): string {
  if (!id) return ''
  const c = clients instanceof Map ? clients.get(id) : clients.find((x) => x.id === id)
  return c ? clientFullName(c) : ''
}

// ---------------------------------------------------------------- attività

export const isOpen = (t: Task) => t.status !== 'completata'

/** Giorno (Europe/Rome) in cui l'attività è stata completata. */
export function completedOn(task: Task): DateKey | undefined {
  if (!task.completedAt) return undefined
  const instant = new Date(task.completedAt)
  return Number.isNaN(instant.getTime()) ? undefined : instantToRome(instant).date
}

/** Ordine: aperte prima delle completate, poi data, orario (senza orario in fondo), priorità, titolo. */
export function compareTasks(a: Task, b: Task): number {
  if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
  const at = a.dueTime ? timeToMinutes(a.dueTime) : 24 * 60
  const bt = b.dueTime ? timeToMinutes(b.dueTime) : 24 * 60
  if (at !== bt) return at - bt
  if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  return a.title.localeCompare(b.title, 'it')
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(compareTasks)
}

export function overdueTasks(tasks: Task[], today: DateKey): Task[] {
  return sortTasks(tasks.filter((t) => isOpen(t) && t.dueDate < today))
}

/** Giorni di ritardo (0 se non in ritardo). */
export function daysOverdue(task: Task, today: DateKey): number {
  return isOpen(task) && task.dueDate < today ? diffDays(task.dueDate, today) : 0
}

export interface TodayTasks {
  overdue: Task[]
  /** Attività con scadenza oggi ancora aperte. */
  today: Task[]
  /** Completate oggi (qualunque fosse la scadenza) oppure in scadenza oggi e già completate. */
  doneToday: Task[]
  tomorrow: Task[]
  /** Totale del giorno = in ritardo + oggi + completate oggi. */
  total: number
}

export function todayTasks(tasks: Task[], today: DateKey): TodayTasks {
  const tomorrow = addDays(today, 1)
  const overdue = overdueTasks(tasks, today)
  const todayOpen = sortTasks(tasks.filter((t) => isOpen(t) && t.dueDate === today))
  const doneToday = sortTasks(
    tasks.filter(
      (t) => !isOpen(t) && (t.dueDate === today || completedOn(t) === today),
    ),
  )
  const tomorrowTasks = sortTasks(tasks.filter((t) => isOpen(t) && t.dueDate === tomorrow))
  return {
    overdue,
    today: todayOpen,
    doneToday,
    tomorrow: tomorrowTasks,
    total: overdue.length + todayOpen.length + doneToday.length,
  }
}

// ---------------------------------------------------------------- appuntamenti

/** Evento di un'intera giornata (es. importato da .ics con VALUE=DATE): 00:00–23:59. */
export function isAllDay(a: Pick<Appointment, 'start' | 'end'>): boolean {
  return a.start === '00:00' && a.end === '23:59'
}

export function compareAppointments(a: Appointment, b: Appointment): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  return timeToMinutes(a.start) - timeToMinutes(b.start)
}

export function appointmentsOn(appointments: Appointment[], day: DateKey, includeCancelled = false): Appointment[] {
  return appointments
    .filter((a) => a.date === day && (includeCancelled || a.status !== 'annullato'))
    .sort(compareAppointments)
}

export function appointmentsBetween(
  appointments: Appointment[],
  from: DateKey,
  to: DateKey,
  includeCancelled = false,
): Appointment[] {
  return appointments
    .filter((a) => a.date >= from && a.date <= to && (includeCancelled || a.status !== 'annullato'))
    .sort(compareAppointments)
}

/** Per il mini-calendario: tipi di appuntamento per giorno nell'intervallo. */
export function appointmentTypesByDay(
  appointments: Appointment[],
  from: DateKey,
  to: DateKey,
): Map<DateKey, AppointmentType[]> {
  const map = new Map<DateKey, AppointmentType[]>()
  for (const a of appointmentsBetween(appointments, from, to)) {
    const list = map.get(a.date) ?? []
    list.push(a.type)
    map.set(a.date, list)
  }
  return map
}

/** Prossimo appuntamento non ancora finito (oggi dopo l'ora attuale o nei giorni successivi). */
export function nextAppointment(appointments: Appointment[], now: RomeNow): Appointment | undefined {
  return appointments
    .filter(
      (a) =>
        a.status !== 'annullato' &&
        a.status !== 'svolto' &&
        !isAllDay(a) &&
        (a.date > now.date || (a.date === now.date && timeToMinutes(a.end) > now.minutes)),
    )
    .sort(compareAppointments)[0]
}

/** Appuntamento in corso adesso, se c'è. */
export function currentAppointment(appointments: Appointment[], now: RomeNow): Appointment | undefined {
  return appointments.find(
    (a) =>
      a.status !== 'annullato' &&
      a.status !== 'svolto' &&
      !isAllDay(a) &&
      a.date === now.date &&
      timeToMinutes(a.start) <= now.minutes &&
      timeToMinutes(a.end) > now.minutes,
  )
}

// ---------------------------------------------------------------- scadenze

/** Scadenza di una pratica: quella indicata o, per i reclami senza data, 45 giorni dall'apertura. */
export function caseDueDate(k: Pick<Case, 'type' | 'openedOn' | 'dueDate'>): DateKey | undefined {
  if (k.dueDate) return k.dueDate
  return k.type === 'reclamo' ? addDays(k.openedOn, 45) : undefined
}

export interface DeadlineOptions {
  /** Giorni in avanti da considerare (default 30). */
  horizonDays?: number
  /** Includere le scadenze già passate per documenti/AML/adeguatezza (default true: restano un problema aperto). */
  includeExpired?: boolean
}

function severity(daysLeft: number): Deadline['severity'] {
  if (daysLeft < 0) return 'scaduta'
  if (daysLeft <= 7) return 'urgente'
  return 'prossima'
}

/**
 * Scadenze e ricorrenze calcolate dai dati dei clienti e dalle pratiche:
 * documenti, adeguata verifica, questionario di adeguatezza, scadenze e anniversari polizza,
 * compleanni, termini delle pratiche aperte. Ordinate per data.
 */
export function computeDeadlines(data: AppData, today: DateKey, options: DeadlineOptions = {}): Deadline[] {
  const horizon = options.horizonDays ?? 30
  const includeExpired = options.includeExpired ?? true
  const limit = addDays(today, horizon)
  const out: Deadline[] = []
  const push = (d: Omit<Deadline, 'daysLeft' | 'severity'> & { severity?: Deadline['severity'] }) => {
    const daysLeft = diffDays(today, d.date)
    out.push({ ...d, daysLeft, severity: d.severity ?? severity(daysLeft) })
  }
  const inWindow = (date: DateKey, allowPast: boolean) => date <= limit && (allowPast || date >= today)

  for (const c of data.clients) {
    const name = clientFullName(c)
    if (c.docExpiry && inWindow(c.docExpiry, includeExpired)) {
      push({
        id: `doc-${c.id}`,
        kind: 'documento',
        date: c.docExpiry,
        clientId: c.id,
        title: c.docExpiry < today ? `Documento scaduto: ${name}` : `Documento in scadenza: ${name}`,
      })
    }
    if (c.amlReviewDue && inWindow(c.amlReviewDue, includeExpired)) {
      push({ id: `aml-${c.id}`, kind: 'antiriciclaggio', date: c.amlReviewDue, clientId: c.id, title: `Adeguata verifica: ${name}` })
    }
    if (c.iddQuestionnaireDate) {
      const due = addMonths(c.iddQuestionnaireDate, data.settings.iddValidityMonths)
      if (inWindow(due, includeExpired)) {
        push({ id: `idd-${c.id}`, kind: 'adeguatezza', date: due, clientId: c.id, title: `Questionario di adeguatezza: ${name}` })
      }
    }
    if (c.birthDate) {
      const next = nextAnniversary(c.birthDate, today)
      if (next <= limit) {
        // anni compiuti nel giorno della ricorrenza: differenza tra gli anni (vale anche per il 29/02 festeggiato il 28/02)
        const age = Number(next.slice(0, 4)) - Number(c.birthDate.slice(0, 4))
        push({
          id: `bday-${c.id}-${next}`,
          kind: 'compleanno',
          date: next,
          clientId: c.id,
          title: `${name} compie ${age} anni`,
          detail:
            age === 67
              ? 'Possibile requisito per la pensione di vecchiaia: verificare le prestazioni della previdenza complementare'
              : age === 18
                ? 'Maggiore età'
                : undefined,
          severity: 'info',
        })
      }
    }
    for (const p of c.policies) {
      if (p.maturityDate && p.maturityDate <= limit && p.maturityDate >= addDays(today, -30)) {
        push({
          id: `mat-${p.id}`,
          kind: 'scadenza_polizza',
          date: p.maturityDate,
          clientId: c.id,
          title: `Scadenza ${POLICY_KIND_LABEL[p.kind]} ${p.ref}: ${name}`,
          detail: 'Opportunità di reinvestimento',
        })
      }
      if (p.startDate < today) {
        const anniversary = nextAnniversary(p.startDate, today)
        if (anniversary <= limit && anniversary !== p.startDate && (!p.maturityDate || anniversary < p.maturityDate)) {
          push({
            id: `ann-${p.id}-${anniversary}`,
            kind: 'anniversario_polizza',
            date: anniversary,
            clientId: c.id,
            title: `Anniversario ${POLICY_KIND_LABEL[p.kind]} ${p.ref}: ${name}`,
            severity: 'info',
          })
        }
      }
    }
  }

  for (const k of data.cases) {
    const due = caseDueDate(k)
    if (k.status !== 'chiusa' && due && inWindow(due, true)) {
      push({ id: `case-${k.id}`, kind: 'pratica', date: due, clientId: k.clientId, caseId: k.id, title: k.title })
    }
  }

  return out.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title, 'it') : a.date < b.date ? -1 : 1))
}

/** Scadenze che per ogni cliente esistono una sola volta: basta cliente + categoria per riconoscerle. */
const SINGLE_PER_CLIENT = new Set<Deadline['kind']>(['documento', 'antiriciclaggio', 'adeguatezza'])

/**
 * Attività APERTA già collegata a una scadenza, se esiste.
 * Si confronta prima `task.deadlineId` (preciso); per le attività create a mano o prima di questo
 * collegamento, ripiega su cliente + categoria solo per le scadenze uniche per cliente.
 */
export function findTaskForDeadline(tasks: Task[], deadline: Deadline): Task | undefined {
  const open = tasks.filter(isOpen)
  const exact = open.find((t) => t.deadlineId === deadline.id)
  if (exact || !deadline.clientId || !SINGLE_PER_CLIENT.has(deadline.kind)) return exact
  const category = DEADLINE_TO_TASK_CATEGORY[deadline.kind]
  return open.find((t) => !t.deadlineId && t.clientId === deadline.clientId && t.category === category)
}

const COMPLIANCE_KINDS = new Set<Deadline['kind']>(['documento', 'antiriciclaggio', 'adeguatezza', 'scadenza_polizza', 'pratica'])

/** Solo adempimenti e scadenze "operative" (esclude compleanni e anniversari). */
export function complianceDeadlines(deadlines: Deadline[]): Deadline[] {
  return deadlines.filter((d) => COMPLIANCE_KINDS.has(d.kind))
}

/** Solo ricorrenze (compleanni, anniversari di polizza). */
export function recurrenceDeadlines(deadlines: Deadline[]): Deadline[] {
  return deadlines.filter((d) => !COMPLIANCE_KINDS.has(d.kind))
}

// ---------------------------------------------------------------- clienti

export interface RecontactItem {
  client: Client
  /** Giorni dall'ultimo contatto; undefined se mai contattato. */
  daysSince?: number
}

/** Clienti (non prospect) senza contatti da più di `afterDays` giorni, i più "dimenticati" prima. */
export function clientsToRecontact(clients: Client[], today: DateKey, afterDays: number): RecontactItem[] {
  return clients
    .filter((c) => c.policies.length > 0)
    .map((c) => ({ client: c, daysSince: c.lastContact ? diffDays(c.lastContact, today) : undefined }))
    .filter((x) => x.daysSince === undefined || x.daysSince > afterDays)
    .sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity))
}

// ---------------------------------------------------------------- obiettivi e KPI

export function goalProgress(goal: Goal): number {
  return goal.target > 0 ? Math.max(0, goal.current / goal.target) : 0
}

export interface Kpis {
  tasksOpenToday: number
  tasksOverdue: number
  tasksDoneToday: number
  tasksTotalToday: number
  appointmentsToday: number
  nextAppointment?: Appointment
  productionMonth?: Goal
  deadlines30: number
  deadlinesUrgent: number
}

export function computeKpis(data: AppData, now: RomeNow): Kpis {
  const t = todayTasks(data.tasks, now.date)
  const deadlines = complianceDeadlines(computeDeadlines(data, now.date, { horizonDays: 30 }))
  return {
    tasksOpenToday: t.today.length + t.overdue.length,
    tasksOverdue: t.overdue.length,
    tasksDoneToday: t.doneToday.length,
    tasksTotalToday: t.total,
    appointmentsToday: appointmentsOn(data.appointments, now.date).length,
    nextAppointment: nextAppointment(data.appointments, now),
    productionMonth: data.goals.find((g) => g.kind === 'produzione' && g.period === 'mese'),
    deadlines30: deadlines.length,
    deadlinesUrgent: deadlines.filter((d) => d.severity === 'scaduta' || d.severity === 'urgente').length,
  }
}

// ---------------------------------------------------------------- notifiche

export interface NotificationItem {
  id: string
  kind: 'attivita' | 'scadenza' | 'appuntamento'
  title: string
  detail: string
  tone: 'negative' | 'warning' | 'primary'
  /** Hash di destinazione, es. "#/attivita" o "#/clienti?id=c01". */
  href: string
}

/** Elementi che richiedono attenzione: attività in ritardo, scadenze entro 7 giorni o già scadute, prossimo appuntamento entro 60 minuti. */
export function computeNotifications(data: AppData, now: RomeNow): NotificationItem[] {
  const items: NotificationItem[] = []
  const clients = indexById(data.clients)
  for (const t of overdueTasks(data.tasks, now.date)) {
    const who = clientNameById(clients, t.clientId)
    items.push({
      id: `task-${t.id}`,
      kind: 'attivita',
      title: t.title,
      detail: `In ritardo da ${diffDays(t.dueDate, now.date)} gg${who ? ` · ${who}` : ''}`,
      tone: 'negative',
      href: '#/attivita',
    })
  }
  for (const d of complianceDeadlines(computeDeadlines(data, now.date, { horizonDays: 7 }))) {
    items.push({
      id: `dl-${d.id}`,
      kind: 'scadenza',
      title: d.title,
      detail: d.daysLeft < 0 ? `Scaduta da ${-d.daysLeft} gg` : d.daysLeft === 0 ? 'Scade oggi' : `Scade tra ${d.daysLeft} gg`,
      tone: d.daysLeft < 0 ? 'negative' : 'warning',
      href: d.caseId ? `#/pratiche?id=${d.caseId}` : d.clientId ? `#/clienti?id=${d.clientId}` : '#/clienti',
    })
  }
  const next = appointmentsOn(data.appointments, now.date).find(
    (a) => a.status !== 'svolto' && !isAllDay(a) && timeToMinutes(a.start) >= now.minutes,
  )
  if (next) {
    const minutes = timeToMinutes(next.start) - now.minutes
    if (minutes <= 60) {
      items.unshift({
        id: `appt-${next.id}`,
        kind: 'appuntamento',
        title: next.title,
        detail: `Inizia alle ${next.start}${next.clientId ? ` · ${clientNameById(clients, next.clientId)}` : ''}`,
        tone: 'primary',
        href: `#/agenda?giorno=${next.date}`,
      })
    }
  }
  return items
}
