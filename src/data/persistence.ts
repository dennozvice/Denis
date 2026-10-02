/**
 * Salvataggio nel browser (localStorage) con schema versionato.
 * I dati restano SOLO su questo dispositivo/browser: nessun server, nessun invio in rete.
 */
import {
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_TYPE_LABEL,
  CASE_STATUS_LABEL,
  CASE_TYPE_LABEL,
  LOCATION_LABEL,
  POLICY_KIND_LABEL,
  PRIORITY_LABEL,
  TASK_CATEGORY_LABEL,
  TASK_STATUS_LABEL,
} from '../domain/labels'
import type { AppData, Instrument, Settings } from '../domain/types'
import { isDateKey, isTimeKey, minutesToTime, nowInRome, timeToMinutes } from '../lib/dates'
import { DEFAULT_SETTINGS } from './demoSeed'

export const STORAGE_PREFIX = 'advisor-desk:'
export const DATA_KEY = `${STORAGE_PREFIX}data`
export const IMPORTS_KEY = `${STORAGE_PREFIX}market-imports`
export const BACKUP_KEY = `${STORAGE_PREFIX}data.bak`

/** Sottoinsieme di Storage usato qui: permette test con un finto storage in memoria. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null // es. cookie bloccati o modalità privata restrittiva
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'

function arrayOf<T>(value: unknown, valid: (item: Record<string, unknown>) => boolean): T[] {
  return Array.isArray(value) ? (value.filter((x) => isObject(x) && valid(x)) as T[]) : []
}

/** Valore ammesso di un'enumerazione, altrimenti il default. */
function oneOf<T extends string>(labels: Record<T, string>, value: unknown, fallback: T): T {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(labels, value) ? (value as T) : fallback
}

const optDate = (v: unknown) => (isDateKey(v) ? v : undefined)

function normalizeSettings(raw: unknown): Settings {
  const s = isObject(raw) ? raw : {}
  const theme = s.theme === 'chiaro' || s.theme === 'scuro' || s.theme === 'sistema' ? s.theme : DEFAULT_SETTINGS.theme
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback)
  return {
    advisorName: isString(s.advisorName) ? s.advisorName : DEFAULT_SETTINGS.advisorName,
    brandName: isString(s.brandName) && s.brandName.trim() ? s.brandName : DEFAULT_SETTINGS.brandName,
    agencyName: isString(s.agencyName) ? s.agencyName : '',
    theme,
    iddValidityMonths: num(s.iddValidityMonths, DEFAULT_SETTINGS.iddValidityMonths),
    recontactAfterDays: num(s.recontactAfterDays, DEFAULT_SETTINGS.recontactAfterDays),
    privacyNoticeDismissed: s.privacyNoticeDismissed === true,
  }
}

/**
 * Valida e completa dati provenienti da localStorage o da un file di backup.
 * Restituisce null se il contenuto non è riconoscibile. I record malformati vengono scartati.
 */
export function normalizeAppData(raw: unknown): AppData | null {
  if (!isObject(raw) || raw.schemaVersion !== 1) return null
  const hasId = (x: Record<string, unknown>) => isString(x.id)
  const training = isObject(raw.training) ? raw.training : {}
  return {
    schemaVersion: 1,
    isDemo: raw.isDemo === true,
    demoGeneratedOn: isDateKey(raw.demoGeneratedOn) ? raw.demoGeneratedOn : undefined,
    settings: normalizeSettings(raw.settings),
    tasks: arrayOf<Record<string, unknown>>(raw.tasks, (t) => hasId(t) && isString(t.title) && isDateKey(t.dueDate)).map(
      (t) => ({
        ...t,
        category: oneOf(TASK_CATEGORY_LABEL, t.category, 'altro'),
        priority: oneOf(PRIORITY_LABEL, t.priority, 'media'),
        status: oneOf(TASK_STATUS_LABEL, t.status, 'da_fare'),
        dueTime: isTimeKey(t.dueTime) ? t.dueTime : undefined,
        createdAt: isString(t.createdAt) ? t.createdAt : new Date(0).toISOString(),
      }),
    ) as unknown as AppData['tasks'],
    appointments: arrayOf<Record<string, unknown>>(
      raw.appointments,
      (a) => hasId(a) && isString(a.title) && isDateKey(a.date),
    ).map((a) => {
      const start = isTimeKey(a.start) ? a.start : '09:00'
      const end = isTimeKey(a.end) && timeToMinutes(a.end) > timeToMinutes(start) ? a.end : minutesToTime(timeToMinutes(start) + 60)
      return {
        ...a,
        start,
        end,
        type: oneOf(APPOINTMENT_TYPE_LABEL, a.type, 'altro'),
        location: oneOf(LOCATION_LABEL, a.location, 'ufficio'),
        status: oneOf(APPOINTMENT_STATUS_LABEL, a.status, 'confermato'),
      }
    }) as unknown as AppData['appointments'],
    clients: arrayOf<Record<string, unknown>>(raw.clients, (c) => hasId(c) && isString(c.lastName)).map((c) => ({
      ...c,
      firstName: isString(c.firstName) ? c.firstName : '',
      birthDate: optDate(c.birthDate),
      docExpiry: optDate(c.docExpiry),
      amlReviewDue: optDate(c.amlReviewDue),
      iddQuestionnaireDate: optDate(c.iddQuestionnaireDate),
      lastContact: optDate(c.lastContact),
      policies: arrayOf<Record<string, unknown>>(c.policies, (p) => hasId(p) && isDateKey(p.startDate)).map((p) => ({
        ...p,
        kind: oneOf(POLICY_KIND_LABEL, p.kind, 'altro'),
        ref: isString(p.ref) ? p.ref : '',
        maturityDate: optDate(p.maturityDate),
      })),
    })) as unknown as AppData['clients'],
    cases: arrayOf<Record<string, unknown>>(raw.cases, (k) => hasId(k) && isString(k.title) && isDateKey(k.openedOn)).map(
      (k) => ({
        ...k,
        type: oneOf(CASE_TYPE_LABEL, k.type, 'riscatto'),
        status: oneOf(CASE_STATUS_LABEL, k.status, 'aperta'),
        dueDate: optDate(k.dueDate),
      }),
    ) as unknown as AppData['cases'],
    goals: arrayOf(raw.goals, (g) => hasId(g) && typeof g.target === 'number' && typeof g.current === 'number'),
    training: {
      year: typeof training.year === 'number' ? training.year : nowInRome().year,
      hoursRequired: typeof training.hoursRequired === 'number' ? training.hoursRequired : 30,
      courses: arrayOf(training.courses, (c) => hasId(c) && isString(c.title) && typeof c.hours === 'number'),
    },
    quickNote: isString(raw.quickNote) ? raw.quickNote : '',
  }
}

export function loadAppData(storage: KeyValueStorage | null = browserStorage()): AppData | null {
  if (!storage) return null
  let text: string | null = null
  try {
    text = storage.getItem(DATA_KEY)
    if (!text) return null
    const data = normalizeAppData(JSON.parse(text))
    if (!data) throw new Error('schema non riconosciuto')
    return data
  } catch {
    // Dati illeggibili: se ne conserva una copia per sicurezza e si riparte.
    try {
      if (text) storage.setItem(BACKUP_KEY, text)
    } catch {
      /* ignora */
    }
    return null
  }
}

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' | 'error' }

export function saveAppData(data: AppData, storage: KeyValueStorage | null = browserStorage()): SaveResult {
  if (!storage) return { ok: false, reason: 'unavailable' }
  try {
    storage.setItem(DATA_KEY, JSON.stringify(data))
    return { ok: true }
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)
    return { ok: false, reason: quota ? 'quota' : 'error' }
  }
}

export function loadMarketImports(storage: KeyValueStorage | null = browserStorage()): Instrument[] {
  if (!storage) return []
  try {
    const raw = JSON.parse(storage.getItem(IMPORTS_KEY) ?? '[]')
    return Array.isArray(raw)
      ? raw.filter((i) => isObject(i) && isString(i.id) && isString(i.name) && Array.isArray(i.series))
      : []
  } catch {
    return []
  }
}

export function saveMarketImports(list: Instrument[], storage: KeyValueStorage | null = browserStorage()): SaveResult {
  if (!storage) return { ok: false, reason: 'unavailable' }
  try {
    if (list.length === 0) storage.removeItem(IMPORTS_KEY)
    else storage.setItem(IMPORTS_KEY, JSON.stringify(list))
    return { ok: true }
  } catch (e) {
    const quota = e instanceof DOMException && e.name === 'QuotaExceededError'
    return { ok: false, reason: quota ? 'quota' : 'error' }
  }
}

/** Cancella tutti i dati dell'app da questo browser (ogni chiave con il prefisso dell'app). */
export function clearAllStorage(storage: KeyValueStorage | null = browserStorage()): void {
  if (!storage) return
  const keys = new Set([DATA_KEY, IMPORTS_KEY, BACKUP_KEY])
  try {
    const ls = storage as Partial<Storage>
    if (typeof ls.length === 'number' && typeof ls.key === 'function') {
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i)
        if (k?.startsWith(STORAGE_PREFIX)) keys.add(k)
      }
    }
  } catch {
    /* ignora */
  }
  for (const key of keys) {
    try {
      storage.removeItem(key)
    } catch {
      /* ignora */
    }
  }
}

/** Contenuto del file di backup (JSON leggibile) da scaricare. */
export function serializeBackup(data: AppData, imports: Instrument[]): string {
  return JSON.stringify({ app: 'advisor-desk', exportedAt: new Date().toISOString(), data, marketImports: imports }, null, 2)
}

/** Legge un file di backup. Accetta anche un AppData "nudo". */
export function parseBackup(text: string): { data: AppData; imports: Instrument[] } | null {
  try {
    const raw: unknown = JSON.parse(text)
    if (isObject(raw) && raw.app === 'advisor-desk') {
      const data = normalizeAppData(raw.data)
      if (!data) return null
      const imports = Array.isArray(raw.marketImports)
        ? (raw.marketImports.filter((i) => isObject(i) && isString(i.id) && Array.isArray(i.series)) as Instrument[])
        : []
      return { data, imports }
    }
    const data = normalizeAppData(raw)
    return data ? { data, imports: [] } : null
  } catch {
    return null
  }
}
