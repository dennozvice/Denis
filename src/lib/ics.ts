/**
 * Import ed export di calendari iCalendar (.ics, RFC 5545): Outlook, Google Calendar, Apple Calendario.
 *
 * Import: `parseIcs(text)` → eventi "piatti" (data, orario di inizio/fine nel fuso Europe/Rome) + avvisi
 * in italiano; `icsEventsToAppointments(events, clients)` li trasforma in appuntamenti dell'app
 * (tipo, luogo e cliente indovinati dal testo).
 * Export: `appointmentsToIcs(appointments, clients)` produce un VCALENDAR valido con VTIMEZONE Europe/Rome.
 *
 * Semplificazioni volute (l'agenda dell'app è "un giorno, un orario"):
 * - eventi ricorrenti: si importa solo la prima occorrenza (con avviso);
 * - eventi su più giorni: si tiene solo il primo giorno (con avviso);
 * - eventi "tutto il giorno": 00:00–23:59.
 */
import type { Appointment, AppointmentType, Client, DateKey, LocationMode, TimeKey } from '../domain/types'
import { dayNumber, fromDayNumber, instantToRome, isDateKey, minutesToTime, timeToMinutes, toKey } from './dates'

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
  /** CATEGORIES (es. "Revisione portafoglio" nei file esportati da questa app). */
  categories?: string[]
}

export interface IcsParseResult {
  events: IcsEvent[]
  warnings: string[]
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
    let f: Intl.DateTimeFormat | null = null
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

// ================================================================ parser

type RawEvent = Map<string, ContentLine>

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Legge un file iCalendar. Non lancia eccezioni: ciò che non si riesce a interpretare
 * viene saltato e segnalato in `warnings`.
 */
export function parseIcs(text: string): IcsParseResult {
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
      if (component === 'VEVENT') currentEvent = new Map()
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
      if (!currentEvent.has(prop.name)) currentEvent.set(prop.name, prop)
    } else if (top === 'VTIMEZONE' && currentTz && prop.name === 'TZID') {
      currentTz.id = prop.value.trim()
    } else if ((top === 'STANDARD' || top === 'DAYLIGHT') && currentTz && prop.name === 'TZOFFSETTO') {
      const offset = parseUtcOffset(prop.value)
      if (offset !== undefined) currentTz.info[top === 'STANDARD' ? 'standard' : 'daylight'] = offset
    }
  }

  const events: IcsEvent[] = []
  const seenUids = new Set<string>()
  let missingStart = 0
  let recurring = 0
  let multiDay = 0
  let cancelled = 0
  let overrides = 0
  let duplicates = 0

  for (const raw of rawEvents) {
    const dtstart = raw.get('DTSTART')
    const startParsed = dtstart ? parseDateValue(dtstart, ctx) : null
    if (!startParsed) {
      missingStart++
      continue
    }
    if (raw.get('STATUS')?.value.trim().toUpperCase() === 'CANCELLED') {
      cancelled++
      continue
    }
    // Modifica di una singola occorrenza di un evento ricorrente: si tiene solo l'evento principale.
    if (raw.has('RECURRENCE-ID')) {
      overrides++
      continue
    }
    const uid = raw.get('UID')?.value.trim() || undefined
    if (uid) {
      if (seenUids.has(uid)) {
        duplicates++
        continue
      }
      seenUids.add(uid)
    }

    const isRecurring = raw.has('RRULE') || raw.has('RDATE')
    if (isRecurring) recurring++

    const startDate = wallDate(startParsed.wall)
    const startMin = wallMinutes(startParsed.wall)
    let start: TimeKey
    let end: TimeKey
    let spansDays = false

    const dtend = raw.get('DTEND')
    const endParsed = dtend ? parseDateValue(dtend, ctx) : null
    const durationProp = raw.get('DURATION')
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
      let endWall = endParsed ? endParsed.wall : duration !== null ? startParsed.wall + duration : startParsed.wall + DEFAULT_DURATION
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
      const v = raw.get(name)?.value
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
    const categories = raw.get('CATEGORIES')?.value
    if (categories) {
      const list = splitEscaped(categories).map((c) => unescapeText(c).trim()).filter(Boolean)
      if (list.length) event.categories = list
    }
    events.push(event)
  }

  const warnings: string[] = []
  if (recurring) {
    warnings.push(
      `${count(recurring, 'evento ricorrente', 'eventi ricorrenti')}: viene importata solo la prima occorrenza.`,
    )
  }
  if (multiDay) {
    warnings.push(`${count(multiDay, 'evento su più giorni', 'eventi su più giorni')}: viene importato solo il primo giorno.`)
  }
  if (missingStart) {
    warnings.push(
      `${count(missingStart, 'evento senza data di inizio valida è stato ignorato', 'eventi senza data di inizio valida sono stati ignorati')}.`,
    )
  }
  if (cancelled) {
    warnings.push(`${count(cancelled, 'evento annullato è stato ignorato', 'eventi annullati sono stati ignorati')}.`)
  }
  if (overrides) {
    warnings.push(
      `${count(overrides, 'modifica a una singola occorrenza è stata ignorata', 'modifiche a singole occorrenze sono state ignorate')}.`,
    )
  }
  if (duplicates) {
    warnings.push(`${count(duplicates, 'evento duplicato è stato ignorato', 'eventi duplicati sono stati ignorati')}.`)
  }
  for (const tz of ctx.unknownZones) {
    warnings.push(`Fuso orario non riconosciuto ("${tz}"): gli orari sono stati importati così come sono.`)
  }

  events.sort((a, b) => (a.date === b.date ? (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) : a.date < b.date ? -1 : 1))
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
export function guessLocation(location: string | undefined, description: string | undefined): { mode: LocationMode; detail?: string } {
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
      if (haystack.includes(` ${name} `) && (!best || name.length > best.length)) best = { client: c, length: name.length }
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

/** Identificativo esterno usato per riconoscere lo stesso evento a un nuovo import. */
export function eventExternalId(event: Pick<IcsEvent, 'uid' | 'summary' | 'date' | 'start'>): string {
  return event.uid ?? `ics-${hashString(`${event.summary}|${event.date}|${event.start}`)}`
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

const icsDateTime = (date: DateKey, time: TimeKey) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`

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
}

/** Calendario iCalendar (righe CRLF, piegate a 75 ottetti) con gli appuntamenti indicati. */
export function appointmentsToIcs(appointments: Appointment[], clients: Client[], options: IcsExportOptions = {}): string {
  const stamp = icsUtcStamp(options.now ?? new Date())
  const byId = new Map(clients.map((c) => [c.id, c]))
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
    const clientName = client ? `${client.firstName} ${client.lastName}`.trim() : ''
    const summary = clientName ? `${a.title} – ${clientName}` : a.title
    const startMin = timeToMinutes(a.start)
    const end = timeToMinutes(a.end) > startMin ? a.end : minutesToTime(Math.min(startMin + DEFAULT_DURATION, LAST_MINUTE))
    const location = a.locationDetail?.trim() || (a.location === 'telefono' && client?.phone) || LOCATION_TEXT[a.location]
    const status = a.status === 'annullato' ? 'CANCELLED' : a.status === 'pianificato' ? 'TENTATIVE' : 'CONFIRMED'
    lines.push(
      'BEGIN:VEVENT',
      `UID:${a.id}@advisor-desk`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Rome:${icsDateTime(a.date, a.start)}`,
      `DTEND;TZID=Europe/Rome:${icsDateTime(a.date, end)}`,
      `SUMMARY:${escapeText(summary)}`,
      `LOCATION:${escapeText(location)}`,
    )
    if (a.notes?.trim()) lines.push(`DESCRIPTION:${escapeText(a.notes.trim())}`)
    lines.push(`CATEGORIES:${escapeText(TYPE_TEXT[a.type])}`, `STATUS:${status}`, 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}
