/** Logica pura dei widget della Panoramica (obiettivi, mercati, formazione): testabile senza React. */
import { goalPeriodKey } from '../../data/demoSeed'
import type { DateKey, Goal, Instrument, Training } from '../../domain/types'
import { addYears, daysInMonth, diffDays, parseKey, startOfYear } from '../../lib/dates'
import { dailyChange, lastPoint } from '../../lib/finance'
import { formatCurrency, formatMonthYear, formatNumber } from '../../lib/format'
import { goalProgress } from '../../store/selectors'

// ---------------------------------------------------------------- obiettivi

export type GoalPace = 'raggiunto' | 'in_linea' | 'sotto_ritmo' | 'non_impostato'

/** Frazione del periodo (mese o anno solare) trascorsa, giorno corrente incluso: 0…1. */
export function periodElapsed(period: Goal['period'], today: DateKey): number {
  const { year, month, day } = parseKey(today)
  if (period === 'mese') return day / daysInMonth(year, month)
  const start = startOfYear(today)
  const total = diffDays(start, addYears(start, 1))
  return (diffDays(start, today) + 1) / total
}

export interface GoalStatus {
  /** current / target (può superare 1). */
  progress: number
  /** Avanzamento atteso a oggi se il ritmo fosse costante. */
  expected: number
  pace: GoalPace
}

/** Confronta l'avanzamento dell'obiettivo con il ritmo atteso a oggi. */
export function goalStatus(goal: Goal, today: DateKey): GoalStatus {
  const expected = periodElapsed(goal.period, today)
  if (!(goal.target > 0)) return { progress: 0, expected, pace: 'non_impostato' }
  const progress = goalProgress(goal)
  const pace: GoalPace = progress >= 1 ? 'raggiunto' : progress >= expected ? 'in_linea' : 'sotto_ritmo'
  return { progress, expected, pace }
}

// ---------------------------------------------------------------- cambio di periodo degli obiettivi

/**
 * true se il valore attuale dell'obiettivo si riferisce a un periodo diverso da quello in corso
 * (es. a ottobre i valori sono ancora quelli di settembre). Senza periodKey (dati salvati prima
 * dell'introduzione del campo) il periodo non è noto e l'obiettivo si considera aggiornato.
 */
export function isGoalStale(goal: Pick<Goal, 'period' | 'periodKey'>, today: DateKey): boolean {
  return goal.periodKey !== undefined && goal.periodKey !== goalPeriodKey(goal.period, today)
}

/** Nome del mese: "ottobre". */
export function monthName(key: DateKey): string {
  return formatMonthYear(key).replace(/\s*\d{4}$/, '')
}

/** Periodo di un obiettivo leggibile: "settembre 2026" (mese) o "2025" (anno); undefined se la chiave non è valida. */
export function formatGoalPeriod(period: Goal['period'], key: string): string | undefined {
  if (period === 'mese' && /^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return formatMonthYear(`${key}-01`)
  if (period === 'anno' && /^\d{4}$/.test(key)) return key
  return undefined
}

export interface GoalRollover {
  /** Obiettivi del gruppo con valori di un altro periodo (da azzerare). */
  goals: Goal[]
  /** Periodo in corso: "2026-10" o "2026". */
  periodKey: string
  /** "I valori si riferiscono a settembre 2026" */
  notice: string
  /** "Azzera e inizia ottobre" */
  action: string
  /** Avviso nel modulo di modifica: salvando, i valori diventano quelli del periodo in corso. */
  editHint: string
  /** Testo breve per il KPI: "settembre 2026" (o "un periodo precedente"). */
  periodLabel: string
}

/** Obiettivi di un periodo (mese o anno) rimasti al periodo precedente, con i testi dell'avviso. */
export function goalRollover(goals: Goal[], period: Goal['period'], today: DateKey): GoalRollover | undefined {
  const stale = goals.filter((g) => g.period === period && isGoalStale(g, today))
  if (stale.length === 0) return undefined
  const keys = new Set(stale.map((g) => g.periodKey ?? ''))
  const label = keys.size === 1 ? formatGoalPeriod(period, [...keys][0]) : undefined
  const periodLabel = label ?? 'un periodo precedente'
  const ofPeriod = label ? (period === 'anno' ? `al ${label}` : `a ${label}`) : 'a un periodo precedente'
  const current = goalPeriodKey(period, today)
  const next = period === 'anno' ? `il ${current}` : monthName(today)
  const nextShort = period === 'anno' ? `al ${current}` : `a ${monthName(today)}`
  return {
    goals: stale,
    periodKey: current,
    notice: `I valori si riferiscono ${ofPeriod}`,
    action: `Azzera e inizia ${next}`,
    editHint: `I valori attuali si riferiscono ${ofPeriod}: salvando si riferiranno ${nextShort}.`,
    periodLabel,
  }
}

/** Valore di un obiettivo secondo la sua unità: "16.200 €" oppure "8". */
export function formatGoalValue(value: number, unit: Goal['unit']): string {
  if (unit === 'EUR') return formatCurrency(value)
  return formatNumber(value, Number.isInteger(value) ? 0 : 1)
}

// ---------------------------------------------------------------- numeri inseriti dall'utente

/**
 * Interpreta un numero scritto all'italiana: "16.200", "16200", "2,5", "1.234,50", "€ 3.000".
 * Restituisce undefined se il testo non è un numero valido.
 */
export function parseItalianNumber(input: string): number | undefined {
  let s = input.replace(/[\s\u00a0€]/g, '')
  if (s === '') return undefined
  if (s.includes(',')) {
    // virgola = decimali, punti = migliaia
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // "16.200" o "1.234.567": punti come separatori delle migliaia
    s = s.replace(/\./g, '')
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

/** Valore numerico da mostrare in un campo modificabile: 16200 → "16200", 2.5 → "2,5". */
export function toInputValue(value: number): string {
  return String(value).replace('.', ',')
}

// ---------------------------------------------------------------- mercati

export interface MarketChange {
  value: number
  kind: 'pct' | 'abs'
  decimals: number
  suffix: string
  /** true se un aumento è negativo (spread). */
  invert: boolean
  /** true se la variazione non è né buona né cattiva (tassi d'interesse): nessun colore. */
  neutral: boolean
}

/**
 * Variazione giornaliera da mostrare nella striscia dei mercati:
 * indici e cambi in %, tassi in punti base (variazione assoluta × 100) senza colore buono/cattivo,
 * spread in punti base con colore invertito.
 */
export function marketChange(instrument: Pick<Instrument, 'unit' | 'series'>): MarketChange | undefined {
  const change = dailyChange(instrument.series)
  if (!change) return undefined
  switch (instrument.unit) {
    case 'pct':
      return { value: change.abs * 100, kind: 'abs', decimals: 0, suffix: ' pb', invert: false, neutral: true }
    case 'bp':
      return { value: change.abs, kind: 'abs', decimals: 0, suffix: ' pb', invert: true, neutral: false }
    default:
      return { value: change.pct, kind: 'pct', decimals: 2, suffix: '', invert: false, neutral: false }
  }
}

/** Data dell'ultimo valore disponibile tra gli strumenti indicati (per la striscia: solo indici, tassi, spread e cambi). */
export function latestDate(instruments: Pick<Instrument, 'series'>[]): DateKey | undefined {
  let latest: DateKey | undefined
  for (const i of instruments) {
    const date = lastPoint(i.series)?.date
    if (date && (!latest || date > latest)) latest = date
  }
  return latest
}

/** Da che lato un elenco a scorrimento orizzontale ha altro contenuto nascosto. */
export interface ScrollEdges {
  /** C'è altro contenuto a sinistra. */
  start: boolean
  /** C'è altro contenuto a destra. */
  end: boolean
}

/** Bordi con contenuto nascosto (tolleranza di 1px per gli arrotondamenti del browser). */
export function scrollEdges(box: { scrollLeft: number; scrollWidth: number; clientWidth: number }): ScrollEdges {
  const rest = box.scrollWidth - box.clientWidth - box.scrollLeft
  return { start: box.scrollLeft > 1, end: rest > 1 }
}

// ---------------------------------------------------------------- formazione

export interface TrainingSummary {
  /** Ore dei corsi completati. */
  done: number
  /** Ore dei corsi pianificati e non ancora completati. */
  planned: number
  /** Ore mancanti per raggiungere l'obbligo annuale (mai negative). */
  remaining: number
  /** done / hoursRequired, limitato a 0…1. */
  progress: number
}

export function trainingSummary(training: Training): TrainingSummary {
  let done = 0
  let planned = 0
  for (const c of training.courses) {
    if (c.done) done += c.hours
    else planned += c.hours
  }
  const remaining = Math.max(0, training.hoursRequired - done)
  const progress = training.hoursRequired > 0 ? Math.min(1, done / training.hoursRequired) : 1
  return { done, planned, remaining, progress }
}

/** Ore: "6", "2,5". */
export function formatHours(hours: number): string {
  return formatNumber(hours, Number.isInteger(hours) ? 0 : 1)
}
