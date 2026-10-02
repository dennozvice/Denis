/** Funzioni pure condivise da widget e pagina Agenda (orari, sovrapposizioni, link, etichette). */
import { APPOINTMENT_TYPE_LABEL } from '../../domain/labels'
import type {
  Appointment,
  AppointmentOutcome,
  AppointmentStatus,
  AppointmentType,
  Client,
  DateKey,
  TimeKey,
} from '../../domain/types'
import {
  addDays,
  addMonths,
  isDateKey,
  isWeekend,
  minutesToTime,
  parseKey,
  startOfMonth,
  startOfWeek,
  timeToMinutes,
  type RomeNow,
} from '../../lib/dates'
import {
  capitalize,
  formatDateLong,
  formatDayMonth,
  formatMonthShort,
  formatMonthYear,
  formatWeekdayDayMonth,
  plural,
} from '../../lib/format'
import { clientFullName, isAllDay } from '../../store/selectors'
import type { NewTask } from '../../store/StoreContext'

export type AgendaView = 'giorno' | 'settimana' | 'mese'

export const AGENDA_VIEWS: { value: AgendaView; label: string }[] = [
  { value: 'giorno', label: 'Giorno' },
  { value: 'settimana', label: 'Settimana' },
  { value: 'mese', label: 'Mese' },
]

export const isAgendaView = (v: unknown): v is AgendaView => v === 'giorno' || v === 'settimana' || v === 'mese'

/** Durata predefinita di un nuovo appuntamento (minuti). */
export const DEFAULT_DURATION = 60
const LAST_MINUTE = 24 * 60 - 1

// ---------------------------------------------------------------- orari

/** Prossima mezz'ora "tonda" dopo `minutes` (10:12 → 10:30, 10:30 → 11:00), limitata alle 23:00. */
export function nextHalfHour(minutes: number): TimeKey {
  const next = Math.floor(minutes / 30) * 30 + 30
  return minutesToTime(Math.min(next, 23 * 60))
}

/** Orario di fine dato l'inizio e una durata, senza superare le 23:59. */
export function endAfter(start: TimeKey, duration = DEFAULT_DURATION): TimeKey {
  return minutesToTime(Math.min(timeToMinutes(start) + Math.max(duration, 1), LAST_MINUTE))
}

/** Orario di inizio proposto per un nuovo appuntamento in `day`: oggi = prossima mezz'ora, altrimenti 09:00. */
export function defaultStartFor(day: DateKey, now: RomeNow): TimeKey {
  if (day === now.date) return nextHalfHour(now.minutes)
  return '09:00'
}

/** Primo giorno lavorativo (lun–ven) dopo `day`. */
export function nextWorkday(day: DateKey): DateKey {
  let d = addDays(day, 1)
  while (isWeekend(d)) d = addDays(d, 1)
  return d
}

/** "1 h 30 min", "45 min", "2 h". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

// ---------------------------------------------------------------- stato di un appuntamento

export type Phase = 'passato' | 'in_corso' | 'futuro'

/**
 * Passato / in corso / futuro rispetto all'ora attuale di Roma.
 * Un evento "tutto il giorno" non è mai "in corso": oggi resta da svolgere, dal giorno dopo è passato.
 */
export function appointmentPhase(a: Pick<Appointment, 'date' | 'start' | 'end'>, now: RomeNow): Phase {
  if (a.date < now.date) return 'passato'
  if (a.date > now.date || isAllDay(a)) return 'futuro'
  if (timeToMinutes(a.end) <= now.minutes) return 'passato'
  if (timeToMinutes(a.start) <= now.minutes) return 'in_corso'
  return 'futuro'
}

/** Tipi di appuntamento con un cliente, per i quali ha senso registrare un esito. */
const CLIENT_FACING: AppointmentType[] = [
  'primo_incontro',
  'revisione_portafoglio',
  'firma_contratto',
  'consegna_polizza',
  'call',
]

/** Appuntamento concluso con un cliente ma senza esito registrato. */
export function needsOutcome(a: Appointment, now: RomeNow): boolean {
  if (a.status === 'annullato' || a.outcome) return false
  if (!a.clientId && !CLIENT_FACING.includes(a.type)) return false
  return appointmentPhase(a, now) === 'passato'
}

/**
 * Minuti occupati in agenda: durata dell'UNIONE degli intervalli (le sovrapposizioni contano una volta sola),
 * esclusi gli eventi "tutto il giorno" (ferie, festività…). Con più giorni l'unione si calcola giorno per giorno.
 */
export function busyMinutes(appointments: (Pick<Appointment, 'start' | 'end'> & { date?: DateKey })[]): number {
  const intervals = appointments
    .filter((a) => !isAllDay(a))
    .map((a) => ({ date: a.date ?? '', start: timeToMinutes(a.start), end: timeToMinutes(a.end) }))
    .filter((i) => i.end > i.start)
    .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.start - y.start))
  let total = 0
  let date: string | undefined
  let runStart = 0
  let runEnd = -1
  for (const i of intervals) {
    if (i.date === date && i.start <= runEnd) {
      runEnd = Math.max(runEnd, i.end)
      continue
    }
    if (runEnd > runStart) total += runEnd - runStart
    date = i.date
    runStart = i.start
    runEnd = i.end
  }
  if (runEnd > runStart) total += runEnd - runStart
  return total
}

// ---------------------------------------------------------------- form: stato ed esito

/** Campi del form coinvolti dalla regola "registrare un esito implica che l'incontro si è svolto". */
export interface OutcomeFields {
  date: string
  status: AppointmentStatus
  outcome: AppointmentOutcome | ''
  /** Stato precedente, se "Svolto" è stato impostato in automatico scegliendo l'esito. */
  statusBeforeOutcome?: AppointmentStatus
}

/** Sceglie l'esito: un esito porta lo stato a "Svolto"; togliendolo si torna allo stato precedente. */
export function withOutcome<T extends OutcomeFields>(f: T, outcome: AppointmentOutcome | ''): T {
  if (outcome && (f.status === 'pianificato' || f.status === 'confermato')) {
    return { ...f, outcome, status: 'svolto', statusBeforeOutcome: f.status }
  }
  if (!outcome && f.statusBeforeOutcome) {
    return { ...f, outcome, status: f.statusBeforeOutcome, statusBeforeOutcome: undefined }
  }
  return { ...f, outcome }
}

/** Cambia la data: spostando l'appuntamento nel futuro l'esito non vale più e lo "Svolto" automatico si annulla. */
export function withDate<T extends OutcomeFields>(f: T, date: string, today: DateKey): T {
  if (f.statusBeforeOutcome && isDateKey(date) && date > today) {
    return { ...f, date, outcome: '', status: f.statusBeforeOutcome, statusBeforeOutcome: undefined }
  }
  return { ...f, date }
}

/** Attività di follow-up dopo un esito "Da ricontattare": scade il primo giorno lavorativo successivo. */
export function followUpTask(appointmentTitle: string, clientId: string | undefined, today: DateKey): NewTask {
  const task: NewTask = {
    title: `Ricontattare dopo: ${appointmentTitle}`,
    category: 'ricontatto',
    priority: 'media',
    dueDate: nextWorkday(today),
  }
  if (clientId) task.clientId = clientId
  return task
}

// ---------------------------------------------------------------- griglia oraria

export interface PositionedAppointment {
  appointment: Appointment
  /** Colonna (0…columns-1) nel gruppo di eventi sovrapposti. */
  column: number
  columns: number
  startMin: number
  endMin: number
  /** Fine dell'ingombro visivo (almeno la durata minima): serve a raggruppare gli eventi nascosti. */
  visualEnd: number
}

/**
 * Disposizione affiancata degli eventi che si sovrappongono (come nei calendari classici):
 * gli eventi vengono raggruppati in "cluster" di sovrapposizione e ognuno occupa la prima colonna libera.
 */
export function layoutOverlaps(appointments: Appointment[], minDuration = 0): PositionedAppointment[] {
  const items = appointments
    .map((appointment) => {
      const startMin = timeToMinutes(appointment.start)
      const endMin = Math.max(timeToMinutes(appointment.end), startMin + 1)
      // l'ingombro visivo minimo conta come durata per le sovrapposizioni
      return {
        appointment,
        startMin,
        endMin,
        visualEnd: Math.max(endMin, startMin + minDuration),
        column: 0,
        columns: 1,
      }
    })
    .sort((a, b) => a.startMin - b.startMin || b.visualEnd - a.visualEnd)

  let cluster: typeof items = []
  let columnEnds: number[] = []
  let clusterEnd = -1
  const flush = () => {
    for (const it of cluster) it.columns = columnEnds.length
    cluster = []
    columnEnds = []
  }
  for (const it of items) {
    if (it.startMin >= clusterEnd) flush()
    let col = columnEnds.findIndex((end) => end <= it.startMin)
    if (col === -1) {
      col = columnEnds.length
      columnEnds.push(it.visualEnd)
    } else {
      columnEnds[col] = it.visualEnd
    }
    it.column = col
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.visualEnd)
  }
  flush()
  return items
}

/** Eventi nascosti contigui, mostrati nella griglia come un unico pulsante "+N". */
export interface HiddenGroup {
  startMin: number
  /** Fine dell'ingombro visivo del gruppo. */
  endMin: number
  /** Appuntamenti nascosti, in ordine di orario. */
  appointments: Appointment[]
}

export interface CappedLayout {
  /** Eventi da disegnare; `crowded` = il loro gruppo ha eventi nascosti (a destra resta lo spazio per il "+N"). */
  visible: (PositionedAppointment & { crowded: boolean })[]
  hidden: HiddenGroup[]
}

/**
 * Limita gli eventi affiancati a `maxColumns` per gruppo di sovrapposizione: oltre, i blocchi diventano
 * troppo stretti (titoli a 0px, blocchi che sconfinano nel giorno accanto). Gli eventi delle colonne in eccesso
 * vengono raccolti in gruppi contigui, da mostrare come "+N".
 */
export function capOverlaps(items: PositionedAppointment[], maxColumns: number): CappedLayout {
  const max = Math.max(1, Math.floor(maxColumns))
  const visible: CappedLayout['visible'] = []
  const extra: PositionedAppointment[] = []
  for (const it of items) {
    if (it.columns <= max) visible.push({ ...it, crowded: false })
    else if (it.column < max) visible.push({ ...it, columns: max, crowded: true })
    else extra.push(it)
  }
  extra.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  const hidden: HiddenGroup[] = []
  for (const it of extra) {
    const last = hidden.at(-1)
    if (last && it.startMin < last.endMin) {
      last.appointments.push(it.appointment)
      last.endMin = Math.max(last.endMin, it.visualEnd)
    } else {
      hidden.push({ startMin: it.startMin, endMin: it.visualEnd, appointments: [it.appointment] })
    }
  }
  return { visible, hidden }
}

/** Fascia oraria da mostrare: almeno 08–20, estesa per includere tutti gli appuntamenti (esclusi quelli "tutto il giorno"). */
export function hourRange(appointments: Appointment[], from = 8, to = 20): { startHour: number; endHour: number } {
  let startHour = from
  let endHour = to
  for (const a of appointments) {
    if (isAllDay(a)) continue
    startHour = Math.min(startHour, Math.floor(timeToMinutes(a.start) / 60))
    endHour = Math.max(endHour, Math.ceil(timeToMinutes(a.end) / 60))
  }
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, endHour) }
}

// ---------------------------------------------------------------- etichette

/** Etichetta dell'intervallo visibile: "Venerdì 2 ottobre 2026", "28 set – 4 ott 2026", "Ottobre 2026". */
export function rangeLabel(view: AgendaView, day: DateKey): string {
  if (view === 'giorno') return capitalize(formatDateLong(day))
  if (view === 'mese') return capitalize(formatMonthYear(day))
  const start = startOfWeek(day)
  const end = addDays(start, 6)
  const s = parseKey(start)
  const e = parseKey(end)
  if (s.year !== e.year) return `${formatDayMonth(start)} ${s.year} – ${formatDayMonth(end)} ${e.year}`
  if (s.month === e.month) return `${s.day} – ${e.day} ${formatMonthShort(end)} ${e.year}`
  return `${formatDayMonth(start)} – ${formatDayMonth(end)} ${e.year}`
}

/** Intervallo di date coperto dalla vista (per conteggi e filtri). */
export function viewRange(view: AgendaView, day: DateKey): { from: DateKey; to: DateKey } {
  if (view === 'giorno') return { from: day, to: day }
  if (view === 'settimana') {
    const from = startOfWeek(day)
    return { from, to: addDays(from, 6) }
  }
  const from = startOfWeek(startOfMonth(day))
  return { from, to: addDays(from, 41) }
}

/** Sposta la data di riferimento di un passo della vista (giorno, settimana, mese). */
export function stepDay(view: AgendaView, day: DateKey, direction: 1 | -1): DateKey {
  if (view === 'giorno') return addDays(day, direction)
  if (view === 'settimana') return addDays(day, 7 * direction)
  return addMonths(day, direction)
}

/** "Oggi · venerdì 2 ottobre", "Domani · sabato 3 ottobre", "Lunedì 5 ottobre". */
export function relativeDayLabel(day: DateKey, today: DateKey): string {
  const base = formatWeekdayDayMonth(day)
  const withYear = parseKey(day).year !== parseKey(today).year ? `${base} ${parseKey(day).year}` : base
  if (day === today) return `Oggi · ${withYear}`
  if (day === addDays(today, 1)) return `Domani · ${withYear}`
  if (day === addDays(today, -1)) return `Ieri · ${withYear}`
  return capitalize(withYear)
}

// ---------------------------------------------------------------- testi accessibili

/**
 * Titolo, cliente e tipo: "Firma – Mario Rossi (Firma contratto)". Nelle griglie il tipo è solo un colore,
 * quindi va scritto; si omette solo se il titolo lo contiene già ("Revisione portafoglio – Mario Rossi").
 */
export function appointmentHeadline(a: Pick<Appointment, 'title' | 'type'>, client: Client | undefined): string {
  const typeLabel = APPOINTMENT_TYPE_LABEL[a.type]
  const withClient = client ? `${a.title} – ${clientFullName(client)}` : a.title
  return a.title.toLowerCase().includes(typeLabel.toLowerCase()) ? withClient : `${withClient} (${typeLabel})`
}

/**
 * Giorno per lettori di schermo, con i tipi di appuntamento (a schermo sono solo pallini o colori):
 * "venerdì 2 ottobre 2026, oggi, 4 appuntamenti: Revisione portafoglio (2), Primo incontro, Telefonata".
 */
export function dayAriaLabel(day: DateKey, types: readonly AppointmentType[], today: DateKey): string {
  let label = formatDateLong(day)
  if (day === today) label += ', oggi'
  if (types.length > 0) {
    const counts = new Map<AppointmentType, number>()
    for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1)
    const list = [...counts].map(([t, n]) => `${APPOINTMENT_TYPE_LABEL[t]}${n > 1 ? ` (${n})` : ''}`)
    label += `, ${plural(types.length, 'appuntamento', 'appuntamenti')}: ${list.join(', ')}`
  }
  return label
}

// ---------------------------------------------------------------- link

/** Numero per un link tel: (solo cifre e +). */
export function telHref(phone: string): string | undefined {
  const digits = phone.replace(/[^\d+]/g, '')
  return digits.replace(/\D/g, '').length >= 5 ? `tel:${digits}` : undefined
}

/** Link a Google Maps per le indicazioni stradali. */
export function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

/** URL http(s) contenuto nel dettaglio del luogo (link della videochiamata). */
export function videoHref(detail: string | undefined): string | undefined {
  const m = detail?.match(/https?:\/\/[^\s<>"]+/i)
  return m?.[0]
}

/** Numero da chiamare: dettaglio del luogo (se è un numero) oppure telefono del cliente. */
export function phoneFor(a: Appointment, client: Client | undefined): string | undefined {
  if (a.location === 'telefono' && a.locationDetail && telHref(a.locationDetail)) return a.locationDetail
  return client?.phone
}
