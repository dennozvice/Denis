import { describe, expect, it } from 'vitest'
import { INITIAL_STOPWATCH, currentLap, elapsed, formatStopwatch, lap, lapRows, reset, start, stop, toggle } from './stopwatchLogic'

describe('cronometro: stati', () => {
  it('parte fermo a zero', () => {
    expect(INITIAL_STOPWATCH.status).toBe('idle')
    expect(elapsed(INITIAL_STOPWATCH, 123456)).toBe(0)
  })

  it('avvia, conta e si ferma congelando il totale', () => {
    const s1 = start(INITIAL_STOPWATCH, 1000)
    expect(s1.status).toBe('running')
    expect(elapsed(s1, 1000)).toBe(0)
    expect(elapsed(s1, 4500)).toBe(3500)
    const s2 = stop(s1, 4500)
    expect(s2.status).toBe('stopped')
    expect(elapsed(s2, 99999)).toBe(3500)
  })

  it('riprende sommando al tempo accumulato', () => {
    const s = start(stop(start(INITIAL_STOPWATCH, 0), 2000), 10000)
    expect(elapsed(s, 10500)).toBe(2500)
  })

  it('avviare due volte o fermare da fermo non cambia nulla', () => {
    const running = start(INITIAL_STOPWATCH, 100)
    expect(start(running, 500)).toBe(running)
    expect(stop(INITIAL_STOPWATCH, 500)).toBe(INITIAL_STOPWATCH)
    expect(elapsed(running, 600)).toBe(500)
  })

  it('un istante precedente all’avvio non produce tempi negativi', () => {
    expect(elapsed(start(INITIAL_STOPWATCH, 1000), 900)).toBe(0)
  })

  it('azzera solo da fermo', () => {
    const running = start(INITIAL_STOPWATCH, 0)
    expect(reset(running)).toBe(running)
    const stopped = stop(running, 1234)
    expect(reset(stopped)).toEqual(INITIAL_STOPWATCH)
  })

  it('Play/Pausa alterna avvio e stop', () => {
    const a = toggle(INITIAL_STOPWATCH, 0)
    expect(a.status).toBe('running')
    const b = toggle(a, 700)
    expect(b.status).toBe('stopped')
    expect(elapsed(b, 5000)).toBe(700)
    expect(toggle(b, 5000).status).toBe('running')
  })
})

describe('cronometro: giri', () => {
  it('registra i giri come intervalli dall’ultimo giro', () => {
    let s = start(INITIAL_STOPWATCH, 0)
    s = lap(s, 1200)
    s = lap(s, 3000)
    expect(s.laps).toEqual([1200, 1800])
    expect(currentLap(s, 3400)).toBe(400)
  })

  it('non registra giri se non è in corsa', () => {
    expect(lap(INITIAL_STOPWATCH, 500)).toBe(INITIAL_STOPWATCH)
    const stopped = stop(start(INITIAL_STOPWATCH, 0), 900)
    expect(lap(stopped, 2000)).toBe(stopped)
  })

  it('il giro in corso continua anche dopo stop e ripresa', () => {
    let s = start(INITIAL_STOPWATCH, 0)
    s = lap(s, 1000)
    s = stop(s, 1500)
    s = start(s, 9000)
    expect(currentLap(s, 9200)).toBe(700)
  })

  it('elenca i giri dal più recente con il tempo cumulativo', () => {
    let s = start(INITIAL_STOPWATCH, 0)
    s = lap(s, 1000)
    s = lap(s, 2500)
    s = lap(s, 2600)
    expect(lapRows(s)).toEqual([
      { n: 3, lap: 100, cumulative: 2600 },
      { n: 2, lap: 1500, cumulative: 2500 },
      { n: 1, lap: 1000, cumulative: 1000 },
    ])
    expect(lapRows(INITIAL_STOPWATCH)).toEqual([])
  })
})

describe('cronometro: formato', () => {
  it('usa m:ss.t sotto l’ora', () => {
    expect(formatStopwatch(0)).toBe('0:00.0')
    expect(formatStopwatch(99)).toBe('0:00.0')
    expect(formatStopwatch(100)).toBe('0:00.1')
    expect(formatStopwatch(12_450)).toBe('0:12.4')
    expect(formatStopwatch(61_250)).toBe('1:01.2')
    expect(formatStopwatch(3_599_999)).toBe('59:59.9')
  })

  it('passa a h:mm:ss.t da un’ora in su', () => {
    expect(formatStopwatch(3_600_000)).toBe('1:00:00.0')
    expect(formatStopwatch(3_600_000 + 65_300)).toBe('1:01:05.3')
    expect(formatStopwatch(10 * 3_600_000 + 7 * 60_000 + 8_000)).toBe('10:07:08.0')
  })

  it('non va mai sotto zero', () => {
    expect(formatStopwatch(-500)).toBe('0:00.0')
  })
})
