/**
 * Salvataggio nel browser (localStorage) con schema versionato.
 * I dati restano SOLO su questo dispositivo/browser: nessun server, nessun invio in rete.
 */
import type { AppData, Instrument, Settings } from '../domain/types'
import { isDateKey } from '../lib/dates'
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
    tasks: arrayOf(raw.tasks, (t) => hasId(t) && isString(t.title) && isDateKey(t.dueDate)),
    appointments: arrayOf(raw.appointments, (a) => hasId(a) && isString(a.title) && isDateKey(a.date) && isString(a.start) && isString(a.end)),
    clients: arrayOf<Record<string, unknown>>(raw.clients, (c) => hasId(c) && isString(c.lastName)).map((c) => ({
      ...c,
      firstName: isString(c.firstName) ? c.firstName : '',
      policies: Array.isArray(c.policies) ? c.policies : [],
    })) as unknown as AppData['clients'],
    cases: arrayOf(raw.cases, (k) => hasId(k) && isString(k.title) && isDateKey(k.openedOn)),
    goals: arrayOf(raw.goals, (g) => hasId(g) && typeof g.target === 'number' && typeof g.current === 'number'),
    training: {
      year: typeof training.year === 'number' ? training.year : new Date().getFullYear(),
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

/** Cancella tutti i dati dell'app da questo browser. */
export function clearAllStorage(storage: KeyValueStorage | null = browserStorage()): void {
  if (!storage) return
  for (const key of [DATA_KEY, IMPORTS_KEY, BACKUP_KEY]) {
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
