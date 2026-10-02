/**
 * Import ed export di calendari iCalendar (.ics, RFC 5545): Outlook, Google Calendar, Apple Calendario.
 *
 * Import: `parseIcs(text, { today })` → eventi "piatti" (data, orario di inizio/fine nel fuso Europe/Rome) +
 * avvisi in italiano; `icsEventsToAppointments(events, clients)` li trasforma in appuntamenti dell'app
 * (tipo, luogo e cliente indovinati dal testo).
 * Export: `appointmentsToIcs(appointments, clients, options)` produce un VCALENDAR valido con VTIMEZONE
 * Europe/Rome; nomi dei clienti, dettagli del luogo e note si includono solo se richiesto.
 *
 * Semplificazioni volute (l'agenda dell'app è "un giorno, un orario"):
 * - eventi ricorrenti: si importa una sola occorrenza (con avviso): la prima oppure, se la serie è già
 *   iniziata e la regola è semplice (vedi `parseRrule`), la prossima da oggi in poi;
 * - eventi su più giorni: si tiene solo il primo giorno (con avviso);
 * - eventi "tutto il giorno": 00:00–23:59 nell'app, di nuovo VALUE=DATE nell'export.
 */
import type { Appointment, AppointmentType, Client, DateKey, LocationMode, TimeKey } from '../domain/types'
import {
  addDays,
  dayNumber,
  daysInMonth,
  fromDayNumber,
  instantToRome,
  isDateKey,
  minutesToTime,
  parseKey,
  timeToMinutes,
  toKey,
  weekdayIndex,
} from './dates'

export interface IcsEvent {
  uid?: string
  summary: string
  description?: string
  location?: string
  date: DateKey
  start: TimeKey
  end: TimeKey
  allDay: boolean
  recurring: boolean
  /**
   * Serie ricorrente iniziata prima di oggi: data (prevista dalla regola, prima di eventuali spostamenti)
   * dell'occorrenza importata al posto della prima. Distingue le occorrenze della stessa serie tra un
   * import e l'altro (vedi `eventExternalId`).
   */
  occurrence?: DateKey
  /** Serie ricorrente iniziata prima di oggi con una regola non gestita: resta la prima occorrenza, già passata. */
  recurrenceUnsupported?: boolean
  /** CATEGORIES (es. "Revisione portafoglio" nei file esportati da questa app). */
  categories?: string[]
}

export interface IcsParseResult {
  events: IcsEvent[]
  warnings: string[]
}

export interface IcsParseOptions {
  /**
   * Oggi (Europe/Rome). Se indicato, le serie ricorrenti iniziate prima di oggi vengono importate con la
   * prossima occorrenza da oggi in poi invece che con la prima (già passata).
   */
  today?: DateKey
}

/** Appuntamento pronto per l'import (manca solo l'id, assegnato al momento dell'import). */
export type ImportedAppointment = Omit<Appointment, 'id'>

const MINUTES_PER_DAY = 24 * 60
const LAST_MINUTE = MINUTES_PER_DAY - 1
/** Durata usata quando l'evento non indica né fine né durata. */
const DEFAULT_DURATION = 60
/** Note troppo lunghe (es. inviti Teams) vengono accorciate. */
const MAX_NOTES = 2000

// ================================================================ lettura del file

/**
 * Decodifica i byte di un file .ics. Le righe "piegate" vengono ricongiunte già a livello di byte,
 * così un carattere multibyte spezzato a metà da una piegatura (succede con alcuni generatori)
 * torna intero. Se il file non è UTF-8 valido si ripiega su Windows-1252 (vecchi Outlook).
 */
export function decodeIcsBytes(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const out = new Uint8Array(bytes.length)
  let n = 0
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    // CRLF + (spazio | tab) oppure LF + (spazio | tab) = piegatura: si salta
    if (b === 0x0d && bytes[i + 1] === 0x0a && (bytes[i + 2] === 0x20 || bytes[i + 2] === 0x09)) {
      i += 2
      continue
    }
    if (b === 0x0a && (bytes[i + 1] === 0x20 || bytes[i + 1] === 0x09)) {
      i += 1
      continue
    }
    out[n++] = b
  }
  const data = out.subarray(0, n)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    text = new TextDecoder('windows-1252').decode(data)
  }
  return text.replace(/^\uFEFF/, '')
}

/** Divide il testo in righe logiche: gestisce CRLF/LF/CR e ricongiunge le righe piegate. */
export function unfoldLines(text: string): string[] {
  const out: string[] = []
  for (const line of text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)) {
    if (line === '') continue
    if ((line[0] === ' ' || line[0] === '\t') && out.length > 0) out[out.length - 1] += line.slice(1)
    else out.push(line)
  }
  return out
}

interface ContentLine {
  name: string
  params: Record<string, string>
  value: string
}

/** Divide `s` sul separatore ignorando quelli racchiusi tra virgolette. */
function splitOutsideQuotes(s: string, separator: string): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  for (const ch of s) {
    if (ch === '"') quoted = !quoted
    if (ch === separator && !quoted) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts
}

/** "DTSTART;TZID="W. Europe Standard Time":20261005T100000" → { name, params, value }. */
function parseContentLine(line: string): ContentLine | null {
  let quoted = false
  let colon = -1
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') quoted = !quoted
    else if (ch === ':' && !quoted) {
      colon = i
      break
    }
  }
  if (colon <= 0) return null
  const [rawName, ...rawParams] = splitOutsideQuotes(line.slice(0, colon), ';')
  const name = rawName.trim().toUpperCase()
  if (!/^[A-Z0-9-]+$/.test(name)) return null
  const params: Record<string, string> = {}
  for (const p of rawParams) {
    const eq = p.indexOf('=')
    if (eq <= 0) continue
    params[p.slice(0, eq).trim().toUpperCase()] = p
      .slice(eq + 1)
      .trim()
      .replace(/^"(.*)"$/, '$1')
  }
  return { name, params, value: line.slice(colon + 1) }
}

/** Divide un valore multiplo ("a,b\\,c") sulle virgole non precedute da barra rovesciata. */
function splitEscaped(value: string): string[] {
  const parts: string[] = []
  let current = ''
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '\\' && i + 1 < value.length) {
      current += ch + value[i + 1]
      i++
    } else if (ch === ',') {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts
}

/** Testo iCalendar → testo normale: \n \N \, \; \\ (e il non standard \:). */
export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,:nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}

/** Testo normale → testo iCalendar. */
export function escapeText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/** Durata ISO 8601 / RFC 5545 ("PT1H30M", "P1D", "P1W", "-PT15M") in minuti; null se non valida. */
export function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim().toUpperCase())
  if (!m || value.trim().toUpperCase().replace(/^[+-]/, '') === 'P' || /T$/i.test(value.trim())) return null
  const [, sign, w, d, h, min, s] = m
  const total =
    Number(w ?? 0) * 7 * MINUTES_PER_DAY +
    Number(d ?? 0) * MINUTES_PER_DAY +
    Number(h ?? 0) * 60 +
    Number(min ?? 0) +
    Math.floor(Number(s ?? 0) / 60)
  return sign === '-' ? -total : total
}

// ================================================================ fusi orari

/** Fusi equivalenti a Europe/Rome (stesse regole CET/CEST): l'orario si prende così com'è. */
const ROME_EQUIVALENT = new Set([
  'europe/rome',
  'europe/vatican',
  'europe/san_marino',
  'w. europe standard time',
  'central europe standard time',
  'central european standard time',
  'romance standard time',
])

/** Nomi Windows (Outlook) più comuni → fuso IANA. */
const WINDOWS_ZONES: Record<string, string> = {
  utc: 'UTC',
  gmt: 'UTC',
  'coordinated universal time': 'UTC',
  'gmt standard time': 'Europe/London',
  'greenwich standard time': 'Atlantic/Reykjavik',
  'e. europe standard time': 'Europe/Chisinau',
  'fle standard time': 'Europe/Kyiv',
  'gtb standard time': 'Europe/Bucharest',
  'eastern standard time': 'America/New_York',
  'central standard time': 'America/Chicago',
  'mountain standard time': 'America/Denver',
  'pacific standard time': 'America/Los_Angeles',
}

type Zone = { kind: 'rome' } | { kind: 'iana'; id: string } | { kind: 'offset'; minutes: number } | { kind: 'unknown' }

interface VTimezoneInfo {
  standard?: number
  daylight?: number
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat | null>()

function zoneFormatter(timeZone: string): Intl.DateTimeFormat | null {
  if (!zoneFormatters.has(timeZone)) {
    let f: Intl.DateTimeFormat | null
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
    } catch {
      f = null
    }
    zoneFormatters.set(timeZone, f)
  }
  return zoneFormatters.get(timeZone) ?? null
}

/** Scostamento (minuti) del fuso rispetto a UTC nell'istante dato. */
function zoneOffsetMinutes(instantMs: number, formatter: Intl.DateTimeFormat): number {
  const parts: Record<string, number> = {}
  for (const p of formatter.formatToParts(new Date(instantMs))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second)
  return Math.round((asUtc - instantMs) / 60_000)
}

/** "+0100" / "-0530" → minuti. */
function parseUtcOffset(value: string): number | undefined {
  const m = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(value.trim())
  if (!m) return undefined
  const minutes = Number(m[2]) * 60 + Number(m[3])
  return m[1] === '-' ? -minutes : minutes
}

function resolveZone(tzid: string, timezones: Map<string, VTimezoneInfo>): Zone {
  const clean = tzid.trim()
  const key = clean.toLowerCase()
  // "/mozilla.org/20050126_1/Europe/Rome", "(UTC+01:00) Amsterdam, Berlino, Berna, Roma…"
  if (ROME_EQUIVALENT.has(key) || /(^|[^a-z])(rome|roma)([^a-z]|$)/.test(key)) return { kind: 'rome' }
  const windows = WINDOWS_ZONES[key]
  if (windows) return { kind: 'iana', id: windows }
  const ianaCandidate = clean.replace(/^\/(?:[^/]+\/\d[^/]*\/)?/, '')
  if (/^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+$|^UTC$/.test(ianaCandidate) && zoneFormatter(ianaCandidate)) {
    return { kind: 'iana', id: ianaCandidate }
  }
  // Fuso personalizzato descritto nel file: se ha le regole CET/CEST equivale a Roma.
  const vtz = timezones.get(clean)
  if (vtz && vtz.standard !== undefined) {
    if (vtz.standard === 60 && vtz.daylight === 120) return { kind: 'rome' }
    if (vtz.daylight === undefined || vtz.daylight === vtz.standard) return { kind: 'offset', minutes: vtz.standard }
  }
  return { kind: 'unknown' }
}

// ================================================================ date e orari

/** Istante "da parete" di Roma espresso in minuti dall'epoca (giorno × 1440 + minuti). */
type WallMinutes = number

const toWall = (date: DateKey, minutes: number): WallMinutes => dayNumber(date) * MINUTES_PER_DAY + minutes
const wallDate = (w: WallMinutes): DateKey => fromDayNumber(Math.floor(w / MINUTES_PER_DAY))
const wallMinutes = (w: WallMinutes): number => ((w % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY

function instantToWall(ms: number): WallMinutes {
  const { date, time } = instantToRome(new Date(ms))
  return toWall(date, timeToMinutes(time))
}

interface ParsedDate {
  wall: WallMinutes
  allDay: boolean
}

interface ParseContext {
  timezones: Map<string, VTimezoneInfo>
  unknownZones: Set<string>
}

function parseDateValue(prop: ContentLine, ctx: ParseContext): ParsedDate | null {
  const value = prop.value.split(',')[0].trim()
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value)
  if (dateOnly || prop.params.VALUE?.toUpperCase() === 'DATE') {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(value)
    if (!m) return null
    const date = toKey(Number(m[1]), Number(m[2]), Number(m[3]))
    return isDateKey(date) ? { wall: toWall(date, 0), allDay: true } : null
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(value)
  if (!m) return null
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number)
  const s = Number(m[6] ?? 0)
  const date = toKey(y, mo, d)
  if (!isDateKey(date) || h > 23 || mi > 59) return null
  if (m[7]) return { wall: instantToWall(Date.UTC(y, mo - 1, d, h, mi, s)), allDay: false }

  const tzid = prop.params.TZID
  const local = toWall(date, h * 60 + mi)
  if (!tzid) return { wall: local, allDay: false } // orario "fluttuante": lo si prende così com'è
  const zone = resolveZone(tzid, ctx.timezones)
  switch (zone.kind) {
    case 'rome':
      return { wall: local, allDay: false }
    case 'offset':
      return { wall: instantToWall(Date.UTC(y, mo - 1, d, h, mi) - zone.minutes * 60_000), allDay: false }
    case 'iana': {
      const formatter = zoneFormatter(zone.id)
      if (!formatter) break
      const wallUtc = Date.UTC(y, mo - 1, d, h, mi)
      let guess = wallUtc
      for (let i = 0; i < 2; i++) guess = wallUtc - zoneOffsetMinutes(guess, formatter) * 60_000
      return { wall: instantToWall(guess), allDay: false }
    }
    case 'unknown':
      break
  }
  ctx.unknownZones.add(tzid)
  return { wall: local, allDay: false }
}

// ================================================================ ricorrenze

const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
const RRULE_PARTS = new Set([
  'FREQ',
  'INTERVAL',
  'COUNT',
  'UNTIL',
  'WKST',
  'BYDAY',
  'BYMONTHDAY',
  'BYMONTH',
  'BYSETPOS',
])
/** Limite di sicurezza ai periodi esaminati per una serie. */
const MAX_PERIODS = 20_000

/** Regola di ripetizione (RRULE) in una delle forme semplici che l'import sa espandere. */
export interface RecurrenceRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  count?: number
  /** Valore di UNTIL: data (inclusa) o data-ora. */
  until?: string
  /** Primo giorno della settimana (WKST, lunedì = 0). */
  weekStart: number
  /** DAILY/WEEKLY: giorni della settimana ammessi (lunedì = 0). */
  weekdays?: number[]
  /** MONTHLY/YEARLY: n-esimo giorno della settimana del mese (n < 0 = dalla fine: -1 = ultimo). */
  nthWeekday?: { n: number; weekday: number }
  /** MONTHLY/YEARLY: giorno del mese (negativo = dalla fine: -1 = ultimo giorno). */
  monthDay?: number
  /** YEARLY: mese (1-12). */
  month?: number
}

/**
 * Legge una RRULE. Gestisce FREQ=DAILY/WEEKLY/MONTHLY/YEARLY con INTERVAL, COUNT, UNTIL e WKST, più:
 * BYDAY (giorni della settimana) per DAILY/WEEKLY; un solo BYMONTHDAY oppure un solo "n-esimo giorno"
 * (BYDAY=2TU, BYDAY=-1FR o BYDAY=TU;BYSETPOS=2) per MONTHLY/YEARLY; un solo BYMONTH per YEARLY.
 * Tutto il resto (BYHOUR, BYWEEKNO, liste di BYMONTHDAY…) restituisce null: regola non gestita.
 */
export function parseRrule(value: string): RecurrenceRule | null {
  const parts = new Map<string, string>()
  for (const part of value.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0) parts.set(part.slice(0, eq).trim().toUpperCase(), part.slice(eq + 1).trim().toUpperCase())
  }
  const freq = parts.get('FREQ')
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null
  for (const key of parts.keys()) if (!RRULE_PARTS.has(key)) return null

  /** Intero singolo tra min e max (zero escluso); undefined se assente, null se non valido o se è una lista. */
  const single = (key: string, min: number, max: number): number | null | undefined => {
    const v = parts.get(key)
    if (v === undefined) return undefined
    const n = /^[+-]?\d{1,5}$/.test(v) ? Number(v) : NaN
    return n >= min && n <= max && n !== 0 ? n : null
  }
  const interval = single('INTERVAL', 1, 9999)
  const count = single('COUNT', 1, 99999)
  const monthDay = single('BYMONTHDAY', -31, 31)
  const month = single('BYMONTH', 1, 12)
  const setPos = single('BYSETPOS', -5, 5)
  const weekStart = WEEKDAY_CODES.indexOf(parts.get('WKST') ?? 'MO')
  const until = parts.get('UNTIL')
  if (interval === null || count === null || monthDay === null || month === null || setPos === null) return null
  if (weekStart < 0 || (until !== undefined && !/^\d{8}(T\d{6}Z?)?$/.test(until))) return null

  let byDay: { n: number; weekday: number }[] | undefined
  if (parts.has('BYDAY')) {
    byDay = []
    for (const item of parts.get('BYDAY')!.split(',')) {
      const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(item.trim())
      if (!m) return null
      byDay.push({ n: m[1] ? Number(m[1]) : 0, weekday: WEEKDAY_CODES.indexOf(m[2]) })
    }
  }

  const rule: RecurrenceRule = { freq, interval: interval ?? 1, weekStart }
  if (count !== undefined) rule.count = count
  if (until !== undefined) rule.until = until

  if (freq === 'DAILY' || freq === 'WEEKLY') {
    if (monthDay !== undefined || month !== undefined || setPos !== undefined) return null
    if (byDay) {
      if (byDay.some((d) => d.n !== 0)) return null
      rule.weekdays = [...new Set(byDay.map((d) => d.weekday))].sort((a, b) => a - b)
    }
    return rule
  }

  // MONTHLY / YEARLY
  if (month !== undefined) {
    if (freq === 'MONTHLY') return null
    rule.month = month
  }
  if (byDay) {
    if (byDay.length !== 1 || monthDay !== undefined || (byDay[0].n !== 0 && setPos !== undefined)) return null
    const n = byDay[0].n || setPos
    if (n === undefined || n < -5 || n > 5 || (freq === 'YEARLY' && month === undefined)) return null
    rule.nthWeekday = { n, weekday: byDay[0].weekday }
    return rule
  }
  if (setPos !== undefined) return null
  if (monthDay !== undefined) rule.monthDay = monthDay
  return rule
}

/** Giorno del mese dell'n-esimo `weekday` (n < 0 = dalla fine); null se quel mese non ce l'ha (es. il 5° lunedì). */
function nthWeekdayOfMonth(year: number, month: number, n: number, weekday: number): number | null {
  const days = daysInMonth(year, month)
  if (n > 0) {
    const day = 1 + ((weekday - weekdayIndex(toKey(year, month, 1)) + 7) % 7) + (n - 1) * 7
    return day <= days ? day : null
  }
  const day = days - ((weekdayIndex(toKey(year, month, days)) - weekday + 7) % 7) + (n + 1) * 7
  return day >= 1 ? day : null
}

/** Date generate dalla regola nel periodo `p` (0 = quello di `start`), in ordine, nel calendario di DTSTART. */
function periodDates(rule: RecurrenceRule, start: DateKey, p: number): DateKey[] {
  const { year, month, day } = parseKey(start)
  switch (rule.freq) {
    case 'DAILY': {
      const d = addDays(start, p * rule.interval)
      return !rule.weekdays || rule.weekdays.includes(weekdayIndex(d)) ? [d] : []
    }
    case 'WEEKLY': {
      const weekBegin = addDays(start, p * rule.interval * 7 - ((weekdayIndex(start) - rule.weekStart + 7) % 7))
      return (rule.weekdays ?? [weekdayIndex(start)])
        .map((wd) => (wd - rule.weekStart + 7) % 7)
        .sort((a, b) => a - b)
        .map((offset) => addDays(weekBegin, offset))
    }
    case 'MONTHLY':
    case 'YEARLY': {
      const total =
        rule.freq === 'MONTHLY'
          ? year * 12 + month - 1 + p * rule.interval
          : (year + p * rule.interval) * 12 + (rule.month ?? month) - 1
      const y = Math.floor(total / 12)
      const m = (total % 12) + 1
      const days = daysInMonth(y, m)
      const wanted = rule.monthDay ?? day
      const d = rule.nthWeekday
        ? nthWeekdayOfMonth(y, m, rule.nthWeekday.n, rule.nthWeekday.weekday)
        : wanted > 0
          ? wanted
          : days + wanted + 1
      // i giorni che non esistono (31 aprile, 29 febbraio negli anni non bisestili) si saltano
      return d !== null && d >= 1 && d <= days ? [toKey(y, m, d)] : []
    }
  }
}

/** Primo periodo che può contenere `target` (per saltare gli anni già passati di una serie senza COUNT). */
function periodNear(rule: RecurrenceRule, start: DateKey, target: DateKey): number {
  const s = parseKey(start)
  const t = parseKey(target)
  const days = dayNumber(target) - dayNumber(start)
  const p =
    rule.freq === 'DAILY'
      ? Math.floor(days / rule.interval)
      : rule.freq === 'WEEKLY'
        ? Math.floor(days / (7 * rule.interval)) - 1
        : rule.freq === 'MONTHLY'
          ? Math.floor((t.year * 12 + t.month - (s.year * 12 + s.month)) / rule.interval) - 1
          : Math.floor((t.year - s.year) / rule.interval) - 1
  return Math.max(0, p)
}

/** Sposta di `days` giorni la data di una proprietà data/ora (orario, "Z" e parametri restano invariati). */
function shiftDateValue(line: ContentLine, days: number): ContentLine {
  const m = /^(\d{4})(\d{2})(\d{2})(.*)$/.exec(line.value.split(',')[0].trim())
  if (!m) return line
  const date = addDays(toKey(Number(m[1]), Number(m[2]), Number(m[3])), days)
  return { ...line, value: `${date.replace(/-/g, '')}${m[4]}` }
}

interface Occurrence {
  props: Map<string, ContentLine>
  start: ParsedDate
  /** Data prevista dalla regola (per un'occorrenza spostata: quella del suo RECURRENCE-ID). */
  occurrence: DateKey
  fromOverride: boolean
}

/**
 * Prossima occorrenza, da `today` in poi, di una serie iniziata prima di oggi: date generate dalla RRULE
 * (rispettando COUNT e UNTIL) meno EXDATE e occorrenze modificate a parte, più le modifiche
 * (RECURRENCE-ID) non annullate. 'ended' = la serie è finita; 'unsupported' = RRULE complessa o RDATE.
 */
function nextOccurrence(
  raw: RawEvent,
  overrides: RawEvent[],
  today: DateKey,
  ctx: ParseContext,
): Occurrence | 'ended' | 'unsupported' {
  const dtstart = raw.props.get('DTSTART')
  const rrule = raw.props.get('RRULE')
  const rule = rrule && !raw.props.has('RDATE') ? parseRrule(rrule.value) : null
  // le date della regola si calcolano nel calendario di DTSTART (il suo fuso, o UTC se finisce con Z)
  const m = dtstart ? /^(\d{4})(\d{2})(\d{2})/.exec(dtstart.value.trim()) : null
  const localStart = m ? toKey(Number(m[1]), Number(m[2]), Number(m[3])) : ''
  if (!dtstart || !rule || !isDateKey(localStart)) return 'unsupported'

  let untilDate: DateKey | undefined
  let untilWall: WallMinutes | undefined
  if (rule.until) {
    // UNTIL: data inclusa, oppure data-ora in UTC (Z) o nel fuso di DTSTART
    const dateOnly = /^\d{8}$/.test(rule.until)
    const params: Record<string, string> =
      dateOnly || rule.until.endsWith('Z') || !dtstart.params.TZID ? {} : { TZID: dtstart.params.TZID }
    const parsed = parseDateValue({ name: 'UNTIL', params, value: rule.until }, ctx)
    if (!parsed) return 'unsupported'
    if (dateOnly) untilDate = wallDate(parsed.wall)
    else untilWall = parsed.wall
  }

  // occorrenze escluse (EXDATE) o modificate a parte (RECURRENCE-ID): per orario esatto, o per giorno se è una data
  const excludedWalls = new Set<WallMinutes>()
  const excludedDays = new Set<DateKey>()
  const exclude = (line: ContentLine) => {
    for (const value of line.value.split(',')) {
      const parsed = parseDateValue({ ...line, value }, ctx)
      if (parsed?.allDay) excludedDays.add(wallDate(parsed.wall))
      else if (parsed) excludedWalls.add(parsed.wall)
    }
  }
  const isExcluded = (wall: WallMinutes) => excludedWalls.has(wall) || excludedDays.has(wallDate(wall))
  for (const line of raw.exdates) exclude(line)

  // le occorrenze spostate (non annullate) da oggi in poi sono candidate anch'esse
  let moved: Occurrence | undefined
  for (const o of overrides) {
    const rid = o.props.get('RECURRENCE-ID')!
    exclude(rid)
    const startLine = o.props.get('DTSTART')
    const start = startLine ? parseDateValue(startLine, ctx) : null
    if (!start || wallDate(start.wall) < today || o.props.get('STATUS')?.value.trim().toUpperCase() === 'CANCELLED')
      continue
    if (moved && moved.start.wall <= start.wall) continue
    const props = new Map(raw.props)
    props.delete('DTEND')
    props.delete('DURATION')
    for (const [name, line] of o.props) props.set(name, line)
    const original = parseDateValue(rid, ctx)
    moved = { props, start, occurrence: wallDate((original ?? start).wall), fromOverride: true }
  }

  const earliestLocal = addDays(today, -1) // la data nel fuso di origine può precedere di un giorno quella di Roma
  const first = rule.count ? 0 : periodNear(rule, localStart, addDays(today, -2))
  let n = 1 // DTSTART è sempre la prima occorrenza e conta per COUNT
  for (let p = first; p < first + MAX_PERIODS; p++) {
    for (const d of periodDates(rule, localStart, p)) {
      if (d <= localStart) continue
      n++
      if ((rule.count && n > rule.count) || (untilDate && d > untilDate)) return moved ?? 'ended'
      if (d < earliestLocal && untilWall === undefined) continue
      const shift = dayNumber(d) - dayNumber(localStart)
      const startLine = shiftDateValue(dtstart, shift)
      const start = parseDateValue(startLine, ctx)
      if (!start) continue
      if (untilWall !== undefined && start.wall > untilWall) return moved ?? 'ended'
      if (wallDate(start.wall) < today || isExcluded(start.wall)) continue
      if (moved && moved.start.wall <= start.wall) return moved
      const props = new Map(raw.props)
      props.set('DTSTART', startLine)
      const dtend = raw.props.get('DTEND')
      if (dtend) props.set('DTEND', shiftDateValue(dtend, shift))
      return { props, start, occurrence: wallDate(start.wall), fromOverride: false }
    }
  }
  return moved ?? 'ended'
}

// ================================================================ parser

interface RawEvent {
  /** Proprietà del VEVENT (per nome, la prima se ripetuta). */
  props: Map<string, ContentLine>
  /** EXDATE può comparire più volte: tutte le righe. */
  exdates: ContentLine[]
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Legge un file iCalendar. Non lancia eccezioni: ciò che non si riesce a interpretare
 * viene saltato e segnalato in `warnings`.
 */
export function parseIcs(text: string, options: IcsParseOptions = {}): IcsParseResult {
  const { today } = options
  const lines = unfoldLines(text)
  const ctx: ParseContext = { timezones: new Map(), unknownZones: new Set() }
  const rawEvents: RawEvent[] = []

  // Primo passaggio: componenti VEVENT e VTIMEZONE (che può trovarsi anche dopo gli eventi).
  const stack: string[] = []
  let currentEvent: RawEvent | null = null
  let currentTz: { id?: string; info: VTimezoneInfo } | null = null
  for (const line of lines) {
    const prop = parseContentLine(line)
    if (!prop) continue
    if (prop.name === 'BEGIN') {
      const component = prop.value.trim().toUpperCase()
      stack.push(component)
      if (component === 'VEVENT') currentEvent = { props: new Map(), exdates: [] }
      if (component === 'VTIMEZONE') currentTz = { info: {} }
      continue
    }
    if (prop.name === 'END') {
      const component = prop.value.trim().toUpperCase()
      // chiude fino al componente corrispondente (tollera END mancanti)
      const idx = stack.lastIndexOf(component)
      if (idx >= 0) stack.length = idx
      if (component === 'VEVENT' && currentEvent) {
        rawEvents.push(currentEvent)
        currentEvent = null
      }
      if (component === 'VTIMEZONE' && currentTz) {
        if (currentTz.id) ctx.timezones.set(currentTz.id, currentTz.info)
        currentTz = null
      }
      continue
    }
    const top = stack[stack.length - 1]
    if (top === 'VEVENT' && currentEvent) {
      if (prop.name === 'EXDATE') currentEvent.exdates.push(prop)
      else if (!currentEvent.props.has(prop.name)) currentEvent.props.set(prop.name, prop)
    } else if (top === 'VTIMEZONE' && currentTz && prop.name === 'TZID') {
      currentTz.id = prop.value.trim()
    } else if ((top === 'STANDARD' || top === 'DAYLIGHT') && currentTz && prop.name === 'TZOFFSETTO') {
      const offset = parseUtcOffset(prop.value)
      if (offset !== undefined) currentTz.info[top === 'STANDARD' ? 'standard' : 'daylight'] = offset
    }
  }

  // Modifiche a singole occorrenze, per UID della serie.
  const overridesByUid = new Map<string, RawEvent[]>()
  for (const raw of rawEvents) {
    const uid = raw.props.get('UID')?.value.trim()
    if (uid && raw.props.has('RECURRENCE-ID')) overridesByUid.set(uid, [...(overridesByUid.get(uid) ?? []), raw])
  }

  const events: IcsEvent[] = []
  const seenUids = new Set<string>()
  let missingStart = 0
  let firstOnly = 0
  let rolled = 0
  let unsupportedPast = 0
  let multiDay = 0
  let cancelled = 0
  let overrides = 0
  let overridesUsed = 0
  let duplicates = 0

  for (const raw of rawEvents) {
    const dtstart = raw.props.get('DTSTART')
    let startParsed = dtstart ? parseDateValue(dtstart, ctx) : null
    if (!startParsed) {
      missingStart++
      continue
    }
    if (raw.props.get('STATUS')?.value.trim().toUpperCase() === 'CANCELLED') {
      cancelled++
      continue
    }
    // Modifica di una singola occorrenza: conta solo per la prossima occorrenza della sua serie (sotto).
    if (raw.props.has('RECURRENCE-ID')) {
      overrides++
      continue
    }
    const uid = raw.props.get('UID')?.value.trim() || undefined
    if (uid) {
      if (seenUids.has(uid)) {
        duplicates++
        continue
      }
      seenUids.add(uid)
    }

    let props = raw.props
    let occurrence: DateKey | undefined
    let unsupported = false
    const isRecurring = props.has('RRULE') || props.has('RDATE')
    if (isRecurring && today && wallDate(startParsed.wall) < today) {
      // serie già iniziata: si importa la prossima occorrenza al posto della prima, ormai passata
      const seriesOverrides = (uid && overridesByUid.get(uid)) || []
      const next = nextOccurrence(raw, seriesOverrides, today, ctx)
      if (next === 'unsupported') unsupported = true
      else overridesUsed += seriesOverrides.length
      if (typeof next === 'object') {
        props = next.props
        startParsed = next.start
        occurrence = next.occurrence
      }
    }
    if (occurrence) rolled++
    else if (unsupported) unsupportedPast++
    else if (isRecurring) firstOnly++

    const startDate = wallDate(startParsed.wall)
    const startMin = wallMinutes(startParsed.wall)
    let start: TimeKey
    let end: TimeKey
    let spansDays = false

    const dtend = props.get('DTEND')
    const endParsed = dtend ? parseDateValue(dtend, ctx) : null
    const durationProp = props.get('DURATION')
    const duration = durationProp ? parseDuration(durationProp.value) : null

    if (startParsed.allDay) {
      start = '00:00'
      end = minutesToTime(LAST_MINUTE)
      // DTEND di un evento "tutto il giorno" è esclusivo: 5→6 ottobre = solo il 5.
      const days = endParsed
        ? Math.round((endParsed.wall - startParsed.wall) / MINUTES_PER_DAY)
        : duration !== null
          ? Math.ceil(duration / MINUTES_PER_DAY)
          : 1
      spansDays = days > 1
    } else {
      let endWall = endParsed
        ? endParsed.wall
        : duration !== null
          ? startParsed.wall + duration
          : startParsed.wall + DEFAULT_DURATION
      if (endWall <= startParsed.wall) endWall = startParsed.wall + DEFAULT_DURATION
      start = minutesToTime(startMin)
      const endDate = wallDate(endWall)
      if (endDate === startDate) {
        end = minutesToTime(wallMinutes(endWall))
      } else {
        // termina a mezzanotte del giorno dopo = finisce a fine giornata, non è "su più giorni"
        const endsAtMidnight = wallMinutes(endWall) === 0 && dayNumber(endDate) - dayNumber(startDate) === 1
        spansDays = !endsAtMidnight && (endParsed !== null || duration !== null)
        end = minutesToTime(LAST_MINUTE)
      }
      if (end <= start) end = minutesToTime(Math.min(startMin + DEFAULT_DURATION, LAST_MINUTE))
    }
    if (spansDays) multiDay++

    const text = (name: string) => {
      const v = props.get(name)?.value
      if (v === undefined) return undefined
      const t = unescapeText(v).trim()
      return t || undefined
    }

    const event: IcsEvent = {
      uid,
      summary: text('SUMMARY') ?? '',
      description: text('DESCRIPTION'),
      location: text('LOCATION'),
      date: startDate,
      start,
      end,
      allDay: startParsed.allDay,
      recurring: isRecurring,
    }
    if (occurrence) event.occurrence = occurrence
    if (unsupported) event.recurrenceUnsupported = true
    const categories = props.get('CATEGORIES')?.value
    if (categories) {
      const list = splitEscaped(categories)
        .map((c) => unescapeText(c).trim())
        .filter(Boolean)
      if (list.length) event.categories = list
    }
    events.push(event)
  }

  const warnings: string[] = []
  if (rolled) {
    warnings.push(
      `${count(rolled, 'serie ricorrente iniziata', 'serie ricorrenti iniziate')} in passato: viene importata solo la prossima occorrenza, non l'intera serie.`,
    )
  }
  if (firstOnly) {
    warnings.push(
      `${count(firstOnly, 'evento ricorrente', 'eventi ricorrenti')}: viene importata solo la prima occorrenza.`,
    )
  }
  if (unsupportedPast) {
    warnings.push(
      `${count(unsupportedPast, 'serie ricorrente', 'serie ricorrenti')} con una ripetizione non gestita: si può importare solo la prima occorrenza, già passata.`,
    )
  }
  if (multiDay) {
    warnings.push(
      `${count(multiDay, 'evento su più giorni', 'eventi su più giorni')}: viene importato solo il primo giorno.`,
    )
  }
  if (missingStart) {
    warnings.push(
      `${count(missingStart, 'evento senza data di inizio valida è stato ignorato', 'eventi senza data di inizio valida sono stati ignorati')}.`,
    )
  }
  if (cancelled) {
    warnings.push(`${count(cancelled, 'evento annullato è stato ignorato', 'eventi annullati sono stati ignorati')}.`)
  }
  const ignoredOverrides = overrides - overridesUsed
  if (ignoredOverrides > 0) {
    warnings.push(
      `${count(ignoredOverrides, 'modifica a una singola occorrenza è stata ignorata', 'modifiche a singole occorrenze sono state ignorate')}.`,
    )
  }
  if (duplicates) {
    warnings.push(`${count(duplicates, 'evento duplicato è stato ignorato', 'eventi duplicati sono stati ignorati')}.`)
  }
  for (const tz of ctx.unknownZones) {
    warnings.push(`Fuso orario non riconosciuto ("${tz}"): gli orari sono stati importati così come sono.`)
  }

  events.sort((a, b) =>
    a.date === b.date ? (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) : a.date < b.date ? -1 : 1,
  )
  return { events, warnings }
}

// ================================================================ eventi → appuntamenti

/** Minuscolo, senza accenti e con la sola punteggiatura ridotta a spazi: "Révision, Rossi!" → "revision rossi". */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const TYPE_RULES: [RegExp, AppointmentType][] = [
  [/\bfirm[ae]/, 'firma_contratto'],
  [/\bconsegna/, 'consegna_polizza'],
  [/\brevisione|\bportafoglio/, 'revisione_portafoglio'],
  [/\bcall\b|\btelefon|\bchiamata/, 'call'],
  [/\bformazione|\bcorso|\bwebinar/, 'formazione'],
  [/\briunione|\bmeeting/, 'riunione_agenzia'],
  [/\bprimo incontro|\bconoscenza/, 'primo_incontro'],
  [/\bpersonale\b/, 'personale'],
]

/**
 * Tipo di appuntamento: prima dalle CATEGORIES se coincidono con un nostro tipo (file esportati da qui),
 * altrimenti dalle parole chiave del titolo.
 */
export function guessAppointmentType(summary: string, categories?: string[]): AppointmentType {
  for (const category of categories ?? []) {
    const key = normalize(category)
    const found = (Object.keys(TYPE_TEXT) as AppointmentType[]).find((t) => normalize(TYPE_TEXT[t]) === key)
    if (found) return found
  }
  const s = normalize(summary)
  for (const [re, type] of TYPE_RULES) if (re.test(s)) return type
  return 'altro'
}

const URL_RE = /https?:\/\/[^\s<>"]+/i
const VIDEO_WORDS = /\b(teams|zoom|meet|webex|skype|videochiamata|videoconferenza|video call)\b/i
const PHONE_RE = /^\+?[\d\s().\-/]{6,}$/
/** Etichette generiche (anche quelle prodotte dal nostro export) che non sono un vero dettaglio. */
const GENERIC_LOCATIONS = new Set(['in ufficio', 'ufficio', 'dal cliente', 'videochiamata', 'telefono', 'online'])

/** Modalità e dettaglio del luogo dedotti da LOCATION e DESCRIPTION. */
export function guessLocation(
  location: string | undefined,
  description: string | undefined,
): { mode: LocationMode; detail?: string } {
  const loc = (location ?? '').trim()
  const desc = description ?? ''
  const detail = GENERIC_LOCATIONS.has(loc.toLowerCase()) ? undefined : loc || undefined
  const urlInLocation = URL_RE.exec(loc)?.[0]
  if (urlInLocation || VIDEO_WORDS.test(loc) || VIDEO_WORDS.test(desc)) {
    const videoUrl = urlInLocation ?? desc.match(new RegExp(URL_RE.source, 'gi'))?.find((u) => VIDEO_WORDS.test(u))
    return { mode: 'video', detail: videoUrl ?? detail }
  }
  if (!loc) return { mode: 'ufficio' }
  if (PHONE_RE.test(loc) && /\d{6,}/.test(loc.replace(/\D/g, ''))) return { mode: 'telefono', detail: loc }
  if (/^telefono$/i.test(loc)) return { mode: 'telefono' }
  if (/\b(ufficio|agenzia|sede)\b/i.test(loc)) return { mode: 'ufficio', detail }
  return { mode: 'domicilio', detail }
}

/** Cliente citato nel titolo come "Nome Cognome" o "Cognome Nome" (senza distinzione di maiuscole e accenti). */
export function matchClient(summary: string, clients: Client[]): Client | undefined {
  const haystack = ` ${normalize(summary)} `
  let best: { client: Client; length: number } | undefined
  for (const c of clients) {
    const first = normalize(c.firstName)
    const last = normalize(c.lastName)
    if (!first || !last) continue
    for (const name of [`${first} ${last}`, `${last} ${first}`]) {
      if (haystack.includes(` ${name} `) && (!best || name.length > best.length))
        best = { client: c, length: name.length }
    }
  }
  return best?.client
}

/** Hash FNV-1a a 32 bit in esadecimale: ID stabile per gli eventi senza UID. */
export function hashString(value: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Identificativo esterno usato per riconoscere lo stesso evento a un nuovo import. Per la prossima
 * occorrenza di una serie già iniziata è "UID#data": ogni occorrenza diventa un appuntamento a sé, così
 * un import successivo aggiunge la nuova occorrenza invece di spostare (e cancellare dal passato) quella vecchia.
 */
export function eventExternalId(event: Pick<IcsEvent, 'uid' | 'summary' | 'date' | 'start' | 'occurrence'>): string {
  if (event.uid) return event.occurrence ? `${event.uid}#${event.occurrence}` : event.uid
  return `ics-${hashString(`${event.summary}|${event.date}|${event.start}`)}`
}

/** Converte gli eventi letti dal file in appuntamenti (stato "confermato", origine "ics"). */
export function icsEventsToAppointments(events: IcsEvent[], clients: Client[]): ImportedAppointment[] {
  return events.map((event) => {
    const summary = event.summary.trim()
    const client = matchClient(summary, clients)
    let title = summary || '(senza titolo)'
    // "Revisione portafoglio – Mario Rossi" (formato del nostro export): il nome del cliente non serve nel titolo.
    if (client) {
      const m = /^(.*\S)\s+[–—-]\s+([^–—-]+)$/.exec(title)
      const first = normalize(client.firstName)
      const last = normalize(client.lastName)
      const suffix = m ? normalize(m[2]) : ''
      if (m && (suffix === `${first} ${last}` || suffix === `${last} ${first}`)) title = m[1]
    }
    const { mode, detail } = guessLocation(event.location, event.description)
    const notes = event.description ? event.description.slice(0, MAX_NOTES) : undefined
    const appointment: ImportedAppointment = {
      title,
      type: guessAppointmentType(summary, event.categories),
      date: event.date,
      start: event.start,
      end: event.end,
      location: mode,
      status: 'confermato',
      source: 'ics',
      externalId: eventExternalId(event),
    }
    if (detail) appointment.locationDetail = detail
    if (client) appointment.clientId = client.id
    if (notes) appointment.notes = notes
    return appointment
  })
}

// ================================================================ export

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Lunghezza in byte UTF-8 di un singolo code point. */
function utf8Length(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
}

/** Piega una riga a 75 ottetti (RFC 5545 §3.1) senza spezzare i caratteri multibyte. */
export function foldLine(line: string): string {
  let out = ''
  let bytes = 0
  for (const ch of line) {
    const len = utf8Length(ch)
    if (bytes + len > 75) {
      out += '\r\n '
      bytes = 1
    }
    out += ch
    bytes += len
  }
  return out
}

const icsDate = (date: DateKey) => date.replace(/-/g, '')
const icsDateTime = (date: DateKey, time: TimeKey) => `${icsDate(date)}T${time.replace(':', '')}00`

/** Appuntamento "tutto il giorno" (00:00–23:59, come lo crea l'import di un evento VALUE=DATE). */
const isAllDayAppointment = (a: Pick<Appointment, 'start' | 'end'>) => a.start === '00:00' && a.end === '23:59'

/** Titolo dell'evento esportato: "Titolo – Nome Cognome", senza ripetere il nome se il titolo lo contiene già. */
export function exportSummary(title: string, client: Pick<Client, 'firstName' | 'lastName'> | undefined): string {
  if (!client) return title
  const name = `${client.firstName} ${client.lastName}`.trim()
  const first = normalize(client.firstName)
  const last = normalize(client.lastName)
  const haystack = ` ${normalize(title)} `
  const named = [`${first} ${last}`, `${last} ${first}`].some((n) => n.trim() && haystack.includes(` ${n.trim()} `))
  return name && !named ? `${title} – ${name}` : title
}

function icsUtcStamp(instant: Date): string {
  return (
    `${instant.getUTCFullYear()}${pad2(instant.getUTCMonth() + 1)}${pad2(instant.getUTCDate())}` +
    `T${pad2(instant.getUTCHours())}${pad2(instant.getUTCMinutes())}${pad2(instant.getUTCSeconds())}Z`
  )
}

const VTIMEZONE_ROME = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Rome',
  'X-LIC-LOCATION:Europe/Rome',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

const LOCATION_TEXT: Record<LocationMode, string> = {
  ufficio: 'In ufficio',
  domicilio: 'Dal cliente',
  video: 'Videochiamata',
  telefono: 'Telefono',
}

const TYPE_TEXT: Record<AppointmentType, string> = {
  primo_incontro: 'Primo incontro',
  revisione_portafoglio: 'Revisione portafoglio',
  firma_contratto: 'Firma contratto',
  consegna_polizza: 'Consegna polizza',
  call: 'Telefonata',
  formazione: 'Formazione',
  riunione_agenzia: 'Riunione di agenzia',
  personale: 'Personale',
  altro: 'Altro',
}

export interface IcsExportOptions {
  /** Istante usato per DTSTAMP (default: adesso). */
  now?: Date
  calendarName?: string
  /** Aggiunge "– Nome Cognome" del cliente al titolo (default: sì). */
  includeClientNames?: boolean
  /** Indirizzo, numero o link scritti nel luogo; senza, solo "Dal cliente", "Telefono"… (default: sì). */
  includeLocationDetails?: boolean
  /** Note dell'appuntamento in DESCRIPTION (default: no: possono contenere dati personali o patrimoniali). */
  includeNotes?: boolean
}

/**
 * Calendario iCalendar (righe CRLF, piegate a 75 ottetti) con gli appuntamenti indicati.
 * Il file è pensato per calendari in cloud (Outlook, Google): dei clienti si esporta al massimo il nome,
 * mai il numero di telefono o altri dati della scheda.
 */
export function appointmentsToIcs(
  appointments: Appointment[],
  clients: Client[],
  options: IcsExportOptions = {},
): string {
  const { includeClientNames = true, includeLocationDetails = true, includeNotes = false } = options
  const stamp = icsUtcStamp(options.now ?? new Date())
  const byId = new Map(includeClientNames ? clients.map((c) => [c.id, c]) : [])
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Advisor Desk//Agenda consulente//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.calendarName ?? 'Agenda')}`,
    'X-WR-TIMEZONE:Europe/Rome',
    ...VTIMEZONE_ROME,
  ]
  for (const a of appointments) {
    const client = a.clientId ? byId.get(a.clientId) : undefined
    const allDay = isAllDayAppointment(a)
    const status = a.status === 'annullato' ? 'CANCELLED' : a.status === 'pianificato' ? 'TENTATIVE' : 'CONFIRMED'
    lines.push('BEGIN:VEVENT', `UID:${a.id}@advisor-desk`, `DTSTAMP:${stamp}`)
    if (allDay) {
      // DTEND di un evento "tutto il giorno" è esclusivo: il giorno dopo
      lines.push(
        `DTSTART;VALUE=DATE:${icsDate(a.date)}`,
        `DTEND;VALUE=DATE:${icsDate(fromDayNumber(dayNumber(a.date) + 1))}`,
      )
    } else {
      const startMin = timeToMinutes(a.start)
      const end =
        timeToMinutes(a.end) > startMin ? a.end : minutesToTime(Math.min(startMin + DEFAULT_DURATION, LAST_MINUTE))
      lines.push(
        `DTSTART;TZID=Europe/Rome:${icsDateTime(a.date, a.start)}`,
        `DTEND;TZID=Europe/Rome:${icsDateTime(a.date, end)}`,
      )
    }
    lines.push(`SUMMARY:${escapeText(exportSummary(a.title, client))}`)
    // per gli eventi "tutto il giorno" (ferie, festività) il luogo generico predefinito non si esporta
    const location =
      (includeLocationDetails && a.locationDetail?.trim()) || (allDay ? undefined : LOCATION_TEXT[a.location])
    if (location) lines.push(`LOCATION:${escapeText(location)}`)
    if (includeNotes && a.notes?.trim()) lines.push(`DESCRIPTION:${escapeText(a.notes.trim())}`)
    lines.push(`CATEGORIES:${escapeText(TYPE_TEXT[a.type])}`, `STATUS:${status}`, 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}
