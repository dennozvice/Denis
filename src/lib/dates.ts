/**
 * Utility per date di calendario ("YYYY-MM-DD") e orari ("HH:mm").
 *
 * Tutta l'aritmetica lavora su date "pure" convertite in giorni interi tramite Date.UTC,
 * quindi è immune da fusi orari e cambi d'ora legale. L'unico punto in cui si guarda
 * l'orologio reale è `nowInRome()`, che legge l'ora corrente nel fuso Europe/Rome.
 */
import type { DateKey, TimeKey } from '../domain/types'

export const APP_TIME_ZONE = 'Europe/Rome'
const DAY_MS = 86_400_000

const pad2 = (n: number) => String(n).padStart(2, '0')

export function toKey(year: number, month: number, day: number): DateKey {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`
}

export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const { year, month, day } = parseKey(value)
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

export function isTimeKey(value: unknown): value is TimeKey {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** Scompone una DateKey. `month` è 1-12. */
export function parseKey(key: DateKey): { year: number; month: number; day: number } {
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)), day: Number(key.slice(8, 10)) }
}

/** Numero di giorni dall'epoca Unix (intero), utile per differenze esatte. */
export function dayNumber(key: DateKey): number {
  const { year, month, day } = parseKey(key)
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS)
}

export function fromDayNumber(n: number): DateKey {
  const d = new Date(n * DAY_MS)
  return toKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** Oggetto Date a mezzogiorno UTC della data indicata: sicuro per Intl.DateTimeFormat con timeZone 'UTC'. */
export function keyToUtcDate(key: DateKey): Date {
  const { year, month, day } = parseKey(key)
  return new Date(Date.UTC(year, month - 1, day, 12))
}

export function addDays(key: DateKey, days: number): DateKey {
  return fromDayNumber(dayNumber(key) + days)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Aggiunge mesi mantenendo il giorno, con clamp a fine mese (31/01 + 1 mese = 28/02 o 29/02). */
export function addMonths(key: DateKey, months: number): DateKey {
  const { year, month, day } = parseKey(key)
  const total = year * 12 + (month - 1) + months
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return toKey(y, m, Math.min(day, daysInMonth(y, m)))
}

export function addYears(key: DateKey, years: number): DateKey {
  return addMonths(key, years * 12)
}

/** Giorni da `from` a `to` (positivo se `to` è dopo `from`). */
export function diffDays(from: DateKey, to: DateKey): number {
  return dayNumber(to) - dayNumber(from)
}

export function compareKeys(a: DateKey, b: DateKey): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function isBetween(key: DateKey, from: DateKey, to: DateKey): boolean {
  return key >= from && key <= to
}

/** Giorno della settimana con lunedì = 0 … domenica = 6. */
export function weekdayIndex(key: DateKey): number {
  const { year, month, day } = parseKey(key)
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay() // 0 = domenica
  return (js + 6) % 7
}

export function isWeekend(key: DateKey): boolean {
  return weekdayIndex(key) >= 5
}

export function startOfWeek(key: DateKey): DateKey {
  return addDays(key, -weekdayIndex(key))
}

export function startOfMonth(key: DateKey): DateKey {
  const { year, month } = parseKey(key)
  return toKey(year, month, 1)
}

export function endOfMonth(key: DateKey): DateKey {
  const { year, month } = parseKey(key)
  return toKey(year, month, daysInMonth(year, month))
}

export function startOfYear(key: DateKey): DateKey {
  return toKey(parseKey(key).year, 1, 1)
}

export function isSameMonth(a: DateKey, b: DateKey): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

/** I 7 giorni (lun→dom) della settimana che contiene `key`. */
export function weekDays(key: DateKey): DateKey[] {
  const start = startOfWeek(key)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/**
 * Griglia del mese per un calendario: 6 settimane × 7 giorni, a partire dal lunedì
 * della settimana che contiene il primo del mese.
 */
export function monthMatrix(key: DateKey): DateKey[][] {
  const first = startOfWeek(startOfMonth(key))
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)))
}

/** Età compiuta alla data `on`. */
export function ageOn(birth: DateKey, on: DateKey): number {
  const b = parseKey(birth)
  const o = parseKey(on)
  let age = o.year - b.year
  if (o.month < b.month || (o.month === b.month && o.day < b.day)) age -= 1
  return age
}

/**
 * Prossima ricorrenza annuale (compleanno, anniversario) a partire da `from` incluso.
 * Il 29 febbraio negli anni non bisestili cade il 28 febbraio.
 */
export function nextAnniversary(original: DateKey, from: DateKey): DateKey {
  const o = parseKey(original)
  const f = parseKey(from)
  const inYear = (y: number) => toKey(y, o.month, Math.min(o.day, daysInMonth(y, o.month)))
  const candidate = inYear(f.year)
  return candidate >= from ? candidate : inYear(f.year + 1)
}

// ---------------------------------------------------------------- orari

export function timeToMinutes(time: TimeKey): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes: number): TimeKey {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`
}

/** Durata in minuti tra due orari dello stesso giorno (wall-clock, quindi corretta anche al cambio d'ora). */
export function durationMinutes(start: TimeKey, end: TimeKey): number {
  return timeToMinutes(end) - timeToMinutes(start)
}

// ---------------------------------------------------------------- orologio

export interface RomeNow {
  date: DateKey
  time: TimeKey
  /** Minuti trascorsi dalla mezzanotte (ora di Roma). */
  minutes: number
  year: number
}

const romeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Data e ora correnti nel fuso Europe/Rome, indipendentemente dal fuso del computer. */
export function nowInRome(instant: Date = new Date()): RomeNow {
  const parts: Record<string, string> = {}
  for (const p of romeFormatter.formatToParts(instant)) parts[p.type] = p.value
  const date = `${parts.year}-${parts.month}-${parts.day}`
  const time = `${parts.hour}:${parts.minute}`
  return { date, time, minutes: timeToMinutes(time), year: Number(parts.year) }
}

/** Converte un istante UTC (es. da un file .ics con suffisso Z) in data e ora di Roma. */
export function instantToRome(instant: Date): { date: DateKey; time: TimeKey } {
  const { date, time } = nowInRome(instant)
  return { date, time }
}

/** Istante ISO corrente, da usare per createdAt/completedAt. */
export function nowIso(): string {
  return new Date().toISOString()
}
