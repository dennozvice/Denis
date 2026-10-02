/** Logica pura dei widget della Panoramica (obiettivi, mercati, formazione): testabile senza React. */
import type { DateKey, Goal, Instrument, Training } from '../../domain/types'
import { addYears, daysInMonth, diffDays, parseKey, startOfYear } from '../../lib/dates'
import { dailyChange } from '../../lib/finance'
import { formatCurrency, formatNumber } from '../../lib/format'
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
}

/**
 * Variazione giornaliera da mostrare nella striscia dei mercati:
 * indici e cambi in %, tassi in punti base (variazione assoluta × 100), spread in punti base con colore invertito.
 */
export function marketChange(instrument: Pick<Instrument, 'unit' | 'series'>): MarketChange | undefined {
  const change = dailyChange(instrument.series)
  if (!change) return undefined
  switch (instrument.unit) {
    case 'pct':
      return { value: change.abs * 100, kind: 'abs', decimals: 0, suffix: ' pb', invert: false }
    case 'bp':
      return { value: change.abs, kind: 'abs', decimals: 0, suffix: ' pb', invert: true }
    default:
      return { value: change.pct, kind: 'pct', decimals: 2, suffix: '', invert: false }
  }
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
