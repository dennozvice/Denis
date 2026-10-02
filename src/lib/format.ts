/** Formattazione numeri, valute, percentuali e date in italiano (it-IT). */
import type { DateKey, InstrumentUnit } from '../domain/types'
import { keyToUtcDate } from './dates'

const LOCALE = 'it-IT'
/** Segno meno tipografico (U+2212), più leggibile del trattino nelle colonne numeriche. */
const MINUS = '−'

const cache = new Map<string, Intl.NumberFormat>()
function nf(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options)
  let f = cache.get(key)
  if (!f) {
    // it-IT di default non raggruppa i numeri a 4 cifre ("3200"): forziamo "3.200".
    f = new Intl.NumberFormat(LOCALE, { useGrouping: 'always', ...options } as Intl.NumberFormatOptions)
    cache.set(key, f)
  }
  return f
}

const fixMinus = (s: string) => s.replace(/-/g, MINUS)

export function formatNumber(value: number, decimals = 0): string {
  return fixMinus(nf({ minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value))
}

/** "48.200 €" (default senza decimali) oppure "10,42 €" con `decimals: 2`. */
export function formatCurrency(value: number, decimals = 0): string {
  return fixMinus(
    nf({ style: 'currency', currency: 'EUR', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(
      value,
    ),
  )
}

/** Valuta compatta per spazi stretti: "168 mila €", "1,2 Mln €". */
export function formatCurrencyCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} Mln €`
  if (abs >= 10_000) return `${formatNumber(Math.round(value / 1000), 0)} mila €`
  return formatCurrency(value)
}

/**
 * Percentuale a partire da un valore già in punti percentuali (2.1 → "2,10%").
 * Con `signed` aggiunge sempre il segno: "+2,10%" / "−1,15%".
 */
export function formatPercent(value: number, decimals = 2, signed = false): string {
  const s = nf({
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(value)
  return `${fixMinus(s)}%`
}

/** Valore di uno strumento finanziario secondo la sua unità di misura. */
export function formatInstrumentValue(value: number, unit: InstrumentUnit, decimals: number): string {
  switch (unit) {
    case 'EUR':
      return formatCurrency(value, decimals)
    case 'pct':
      return formatPercent(value, decimals)
    case 'bp':
      return `${formatNumber(value, decimals)} pb`
    case 'fx':
    case 'pt':
      return formatNumber(value, decimals)
  }
}

/** Variazione assoluta per tassi/spread (in punti base o punti percentuali). */
export function formatSignedNumber(value: number, decimals = 2): string {
  return fixMinus(
    nf({ minimumFractionDigits: decimals, maximumFractionDigits: decimals, signDisplay: 'exceptZero' }).format(value),
  )
}

// ---------------------------------------------------------------- date

const df = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', ...options })
const fmtLong = df({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const fmtDayMonthLong = df({ weekday: 'long', day: 'numeric', month: 'long' })
const fmtShort = df({ day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtDayMonth = df({ day: 'numeric', month: 'short' })
const fmtMonthYear = df({ month: 'long', year: 'numeric' })
const fmtMonthShort = df({ month: 'short' })
const fmtMonthShortYear = df({ month: 'short', year: '2-digit' })
const fmtWeekdayShort = df({ weekday: 'short' })
const fmtWeekdayNarrow = df({ weekday: 'narrow' })

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** "venerdì 2 ottobre 2026" */
export const formatDateLong = (key: DateKey) => fmtLong.format(keyToUtcDate(key))
/** "venerdì 2 ottobre" */
export const formatWeekdayDayMonth = (key: DateKey) => fmtDayMonthLong.format(keyToUtcDate(key))
/** "02/10/2026" */
export const formatDateShort = (key: DateKey) => fmtShort.format(keyToUtcDate(key))
/** "2 ott" */
export const formatDayMonth = (key: DateKey) => fmtDayMonth.format(keyToUtcDate(key))
/** "ottobre 2026" */
export const formatMonthYear = (key: DateKey) => fmtMonthYear.format(keyToUtcDate(key))
/** "ott" */
export const formatMonthShort = (key: DateKey) => fmtMonthShort.format(keyToUtcDate(key))
/** "ott 26" */
export const formatMonthShortYear = (key: DateKey) => fmtMonthShortYear.format(keyToUtcDate(key))
/** "ven" */
export const formatWeekdayShort = (key: DateKey) => fmtWeekdayShort.format(keyToUtcDate(key))
/** "V" */
export const formatWeekdayNarrow = (key: DateKey) => fmtWeekdayNarrow.format(keyToUtcDate(key))

/** Intestazioni dei giorni della settimana a partire dal lunedì: ["lun", "mar", …]. */
export const WEEKDAY_SHORT = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
export const WEEKDAY_MIN = ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do']

/** Distanza relativa in giorni: "oggi", "domani", "ieri", "tra 5 gg", "3 gg fa". */
export function formatRelativeDays(days: number): string {
  if (days === 0) return 'oggi'
  if (days === 1) return 'domani'
  if (days === -1) return 'ieri'
  if (days > 1) return `tra ${days} gg`
  return `${-days} gg fa`
}

/** Saluto in base all'ora (minuti dalla mezzanotte). */
export function greeting(minutes: number): string {
  if (minutes >= 18 * 60) return 'Buonasera'
  if (minutes >= 13 * 60) return 'Buon pomeriggio'
  if (minutes < 5 * 60) return 'Buonasera'
  return 'Buongiorno'
}

/** Iniziali per l'avatar: "Denis Rossi" → "DR". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Plurale semplice: plural(1, 'attività', 'attività'), plural(2, 'cliente', 'clienti'). */
export function plural(n: number, one: string, many: string): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`
}
