/**
 * Lo schermo 320×240: barra di stato, schermata corrente (con transizione), messaggi,
 * retroilluminazione, luminosità, sospensione, accensione.
 */
import { useEffect, useRef, useState } from 'react'
import { useSettings } from '../core/settings'
import { useNav, type Screen } from '../core/navigation'
import { useSystem } from '../core/system'
import { useUi } from '../core/ui'
import { NoteIcon } from './icons'
import { screenDef } from './registry'
import { StatusBar } from './StatusBar'
import './lcd.css'

type Anim = 'push-in' | 'push-out' | 'pop-in' | 'pop-out' | 'fade-in' | 'fade-out' | ''

function ScreenView({ screen, anim }: { screen: Screen; anim: Anim }) {
  const def = screenDef(screen.kind)
  const C = def.Component
  return (
    <div className="screen" data-anim={anim} style={def.dark ? { background: '#000' } : undefined}>
      <C screen={screen} />
    </div>
  )
}

export function Lcd() {
  const { stack } = useNav()
  const top = stack[stack.length - 1]!
  const backlight = useSystem((s) => s.backlight)
  const asleep = useSystem((s) => s.asleep)
  const booted = useSystem((s) => s.booted)
  const brightness = useSettings((s) => s.brightness)
  const toast = useUi((s) => s.toast)
  const prevRef = useRef<{ screen: Screen; depth: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [transition, setTransition] = useState<{ from: Screen; to: number; dir: 'push' | 'pop'; fade: boolean } | null>(null)
  const topKey = top.key
  const depth = stack.length

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = { screen: top, depth }
    if (!prev || prev.screen.key === topKey) return
    const dir = depth >= prev.depth ? 'push' : 'pop'
    const fade = screenDef(top.kind).transition === 'fade' || screenDef(prev.screen.kind).transition === 'fade'
    setTransition({ from: prev.screen, to: topKey, dir, fade })
    // Il timer vive in un ref: un cambio di selezione durante l'animazione non deve annullarlo.
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setTransition(null), fade ? 300 : 220)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `top` cambia anche per sel/first: qui conta solo la chiave
  }, [topKey, depth])
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  // L'avvio resta montato finché la dissolvenza (300 ms) non è finita.
  const [bootGone, setBootGone] = useState(false)
  useEffect(() => {
    if (!booted) return
    const id = setTimeout(() => setBootGone(true), 320)
    return () => clearTimeout(id)
  }, [booted])

  const title = screenDef(top.kind).title(top)
  const active = transition && transition.to === top.key ? transition : null
  const inAnim: Anim = active ? (active.fade ? 'fade-in' : active.dir === 'push' ? 'push-in' : 'pop-in') : ''
  const outAnim: Anim = active ? (active.fade ? 'fade-out' : active.dir === 'push' ? 'push-out' : 'pop-out') : ''

  return (
    <div className="lcd" aria-live="polite">
      <StatusBar title={title} />
      <div className="content">
        <ScreenView key={top.key} screen={top} anim={inAnim} />
        {active && <ScreenView key={`out-${active.from.key}`} screen={active.from} anim={outAnim} />}
      </div>
      {toast && <div className="toast">{toast}</div>}
      <div className="lcd-vignette" />
      <div className="lcd-bright" style={{ opacity: 0.5 * (1 - brightness / 100) }} />
      <div className="lcd-dim" data-on={!backlight && !asleep ? 'true' : 'false'} />
      <div className="lcd-off" data-on={asleep ? 'true' : 'false'} />
      {!bootGone && (
        <div className="boot" data-off={booted ? 'true' : 'false'}>
          <NoteIcon />
        </div>
      )}
    </div>
  )
}
