/**
 * Logica pura del cronometro: macchina a stati (fermo → in corsa → fermato) basata su
 * timestamp, così il conteggio prosegue anche quando la schermata non è montata,
 * e formattazione dei tempi ("m:ss.t", "h:mm:ss.t" oltre l'ora).
 */
export type StopwatchStatus = 'idle' | 'running' | 'stopped'

export interface StopwatchState {
  status: StopwatchStatus
  /** Millisecondi accumulati prima dell'ultimo avvio. */
  accumulated: number
  /** Istante (ms) dell'ultimo avvio; ha senso solo con `status` = 'running'. */
  startedAt: number
  /** Durata (ms) dei giri conclusi, nell'ordine in cui sono stati registrati. */
  laps: number[]
}

export interface LapRow {
  /** Numero del giro (1 = il primo registrato). */
  n: number
  lap: number
  /** Tempo totale alla fine di questo giro. */
  cumulative: number
}

export const INITIAL_STOPWATCH: StopwatchState = { status: 'idle', accumulated: 0, startedAt: 0, laps: [] }

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

/** Tempo totale (ms) all'istante `now`. */
export function elapsed(s: StopwatchState, now: number): number {
  return s.status === 'running' ? s.accumulated + Math.max(0, now - s.startedAt) : s.accumulated
}

/** Tempo (ms) del giro in corso. */
export function currentLap(s: StopwatchState, now: number): number {
  return Math.max(0, elapsed(s, now) - sum(s.laps))
}

/** Avvia o riprende; se già in corsa non cambia nulla. */
export function start(s: StopwatchState, now: number): StopwatchState {
  if (s.status === 'running') return s
  return { ...s, status: 'running', startedAt: now }
}

/** Ferma congelando il totale; se non è in corsa non cambia nulla. */
export function stop(s: StopwatchState, now: number): StopwatchState {
  if (s.status !== 'running') return s
  return { ...s, status: 'stopped', accumulated: elapsed(s, now), startedAt: 0 }
}

/** Registra un giro (solo in corsa): il tempo trascorso dall'ultimo giro. */
export function lap(s: StopwatchState, now: number): StopwatchState {
  if (s.status !== 'running') return s
  return { ...s, laps: [...s.laps, currentLap(s, now)] }
}

/** Azzera tutto (non mentre è in corsa: lì il tasto è "Giro"). */
export function reset(s: StopwatchState): StopwatchState {
  return s.status === 'running' ? s : INITIAL_STOPWATCH
}

/** Play/Pausa: in corsa → ferma, altrimenti avvia o riprende. */
export function toggle(s: StopwatchState, now: number): StopwatchState {
  return s.status === 'running' ? stop(s, now) : start(s, now)
}

/** Righe della lista giri, dal più recente al più vecchio, con il tempo cumulativo. */
export function lapRows(s: StopwatchState): LapRow[] {
  const rows: LapRow[] = []
  let cumulative = 0
  s.laps.forEach((lapMs, i) => {
    cumulative += lapMs
    rows.push({ n: i + 1, lap: lapMs, cumulative })
  })
  return rows.reverse()
}

/** "m:ss.t", oppure "h:mm:ss.t" da un'ora in su (decimi troncati, come sul display). */
export function formatStopwatch(ms: number): string {
  const tenths = Math.floor(Math.max(0, ms) / 100)
  const t = tenths % 10
  const totalSec = Math.floor(tenths / 10)
  const sec = totalSec % 60
  const min = Math.floor(totalSec / 60) % 60
  const hours = Math.floor(totalSec / 3600)
  const ss = String(sec).padStart(2, '0')
  if (hours > 0) return `${hours}:${String(min).padStart(2, '0')}:${ss}.${t}`
  return `${min}:${ss}.${t}`
}
