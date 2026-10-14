/** Barra di stato: icona play/pausa, lucchetto Hold, titolo, batteria. */
import { useEffect, useState } from 'react'
import { usePlayer } from '../audio/player'
import { useSystem } from '../core/system'
import { BatteryIcon, LockIcon, PauseIcon, PlayIcon } from './icons'

interface BatteryManagerLike extends EventTarget {
  level: number
  charging: boolean
}

function useBattery(): { level: number; charging: boolean } {
  const [state, setState] = useState({ level: 1, charging: false })
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> }
    if (!nav.getBattery) return
    let bm: BatteryManagerLike | null = null
    const update = () => bm && setState({ level: bm.level, charging: bm.charging })
    nav
      .getBattery()
      .then((b) => {
        bm = b
        update()
        b.addEventListener('levelchange', update)
        b.addEventListener('chargingchange', update)
      })
      .catch(() => {})
    return () => {
      bm?.removeEventListener('levelchange', update)
      bm?.removeEventListener('chargingchange', update)
    }
  }, [])
  return state
}

export function StatusBar({ title }: { title: string }) {
  const status = usePlayer((s) => s.status)
  const hasTrack = usePlayer((s) => s.trackId !== null)
  const hold = useSystem((s) => s.hold)
  const battery = useBattery()
  return (
    <div className="sb">
      <div className="sb-left">
        {hold && <LockIcon />}
        {hasTrack && status === 'playing' && <PlayIcon />}
        {hasTrack && (status === 'paused' || status === 'loading') && <PauseIcon />}
      </div>
      <div className="sb-title">{title}</div>
      <div className="sb-battery">
        <BatteryIcon level={battery.level} charging={battery.charging} />
      </div>
    </div>
  )
}
