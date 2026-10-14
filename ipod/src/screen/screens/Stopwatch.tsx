/**
 * Cronometro (Extra): tempo totale, giro in corso, due pulsanti (Avvia/Stop/Riprendi e
 * Azzera/Giro) e lista dei giri. Lo stato vive in uno store di modulo basato su timestamp:
 * continua a contare anche quando si esce dalla schermata.
 */
import type { InputEvent } from '../../core/input'
import { nav, type Screen } from '../../core/navigation'
import { createStore, useStore } from '../../core/store'
import { moveSelection } from '../../device/wheelMath'
import { t, type StringKey } from '../../i18n/strings'
import { INITIAL_STOPWATCH, currentLap, elapsed, formatStopwatch, lap, lapRows, reset, start, stop, toggle, type StopwatchState, type StopwatchStatus } from './stopwatchLogic'
import { useNow } from './useNow'
import './extras.css'

export const stopwatchStore = createStore<StopwatchState>(INITIAL_STOPWATCH)

const VISIBLE_LAPS = 4

/** Etichette dei due pulsanti per ogni stato. */
const BUTTONS: Record<StopwatchStatus, [StringKey, StringKey]> = {
  idle: ['start', 'resetStopwatch'],
  running: ['stop', 'lap'],
  stopped: ['resume', 'resetStopwatch'],
}

function activate(button: 0 | 1): void {
  const s = stopwatchStore.get()
  const now = Date.now()
  if (button === 0) stopwatchStore.set(s.status === 'running' ? stop(s, now) : start(s, now))
  else stopwatchStore.set(s.status === 'running' ? lap(s, now) : reset(s))
}

export function stopwatchInput(e: InputEvent, screen: Screen): boolean {
  switch (e.type) {
    case 'rotate': {
      const sel = moveSelection(screen.sel, e.steps, 2)
      if (sel === screen.sel) return false
      nav.update({ sel })
      return true
    }
    case 'press':
      if (e.button === 'center') {
        activate(screen.sel === 1 ? 1 : 0)
        return true
      }
      if (e.button === 'play') {
        // Play/Pausa avvia e ferma: consumato, così non parte la musica
        stopwatchStore.set(toggle(stopwatchStore.get(), Date.now()))
        return true
      }
      return false
    default:
      return false
  }
}

export function StopwatchScreen({ screen }: { screen: Screen }) {
  const sw = useStore(stopwatchStore)
  const running = sw.status === 'running'
  const now = useNow(running ? 100 : 0)
  const rows = lapRows(sw)
  const hasScrollbar = rows.length > VISIBLE_LAPS
  const [primary, secondary] = BUTTONS[sw.status]
  const thumbH = Math.max(14, Math.round((90 * VISIBLE_LAPS) / Math.max(rows.length, 1)))
  return (
    <div className="sw">
      <div className="sw-total">{formatStopwatch(elapsed(sw, now))}</div>
      <div className="sw-lap">
        <span>
          {t('lapLabel')} {sw.laps.length + 1}
        </span>
        <span className="sw-lap-time">{formatStopwatch(currentLap(sw, now))}</span>
      </div>
      <div className="sw-btn" data-focus={screen.sel !== 1 ? 'true' : 'false'} style={{ left: 50 }}>
        {t(primary)}
      </div>
      <div className="sw-btn" data-focus={screen.sel === 1 ? 'true' : 'false'} style={{ left: 166 }}>
        {t(secondary)}
      </div>
      {rows.slice(0, VISIBLE_LAPS).map((r, i) => (
        <div key={r.n} className="sw-row" data-scroll={hasScrollbar ? 'true' : 'false'} style={{ top: 124 + i * 20 }}>
          <span className="sw-row-n">
            {t('lapLabel')} {r.n}
          </span>
          <span className="sw-row-lap">{formatStopwatch(r.lap)}</span>
          <span className="sw-row-total">{formatStopwatch(r.cumulative)}</span>
        </div>
      ))}
      {hasScrollbar && (
        <div className="scrollbar sw-scrollbar">
          <div className="scrollbar-thumb" style={{ top: 0, height: thumbH }} />
        </div>
      )}
    </div>
  )
}
