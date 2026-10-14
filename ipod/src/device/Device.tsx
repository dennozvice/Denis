/**
 * Il dispositivo in due vesti:
 * - con cornice: la scocca completa (alluminio, finestra, ghiera, interruttore Hold);
 * - senza cornice: solo schermo e ghiera su fondo tutto bianco (iPod argento) o tutto nero (iPod nero),
 *   pensata per il telefono a tutto schermo. Sui telefoni è la modalità automatica.
 * Gli input (dito/mouse sulla ghiera, rotella, tastiera) diventano InputEvent e vanno al dispatcher;
 * la grafica dello schermo è nel componente figlio (children).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { unlockAudio } from '../audio/clicker'
import { primeAudio } from '../audio/player'
import { dispatch } from '../core/dispatcher'
import type { InputEvent, WheelButton } from '../core/input'
import { useSettings } from '../core/settings'
import { useSystem } from '../core/system'
import { useClickWheel } from './useClickWheel'
import { useKeyboard } from './useKeyboard'
import { useMouseWheel } from './useMouseWheel'
import { NextGlyph, PlayPauseGlyph, PrevGlyph } from './WheelLabels'
import './device.css'

const MM_PER_LCD_PX = 0.156
const BODY_W = 61.8
const BODY_H = 103.5

export interface DeviceScale {
  mm: number
  lcdScale: number
  grain: boolean
}

/**
 * `preferSize` (telefoni): la grandezza conta più della nitidezza assoluta, perché a tutta larghezza
 * l'iPod viene quasi a grandezza naturale; si aggancia ai pixel interi solo se costa poco spazio.
 */
export function computeScale(availW: number, availH: number, dpr: number, preferSize = false): DeviceScale {
  const maxMm = Math.max(1.5, Math.min(availW / BODY_W, availH / BODY_H, 9.6))
  const n = Math.floor(maxMm * MM_PER_LCD_PX * dpr)
  if (n >= 1) {
    const snapped = n / (dpr * MM_PER_LCD_PX)
    // Si "aggancia" ai pixel interi quando non costa troppo spazio (o appena si arriva a 2 pixel per punto):
    // la scala dell'LCD è esattamente n/dpr, così testo e linee da 1 px restano nitidi.
    const ok = preferSize ? snapped >= 0.9 * maxMm : n >= 2 || snapped >= 0.6 * maxMm
    if (ok) return { mm: snapped, lcdScale: n / dpr, grain: snapped * dpr >= 2 }
  }
  return { mm: maxMm, lcdScale: maxMm * MM_PER_LCD_PX, grain: maxMm * dpr >= 2 }
}

export interface FlatScale {
  /** Scala dello schermo 320×240. */
  lcdScale: number
  /** Diametro della ghiera in px. */
  wheelPx: number
}

/**
 * Senza cornice: schermo largo quanto lo spazio (agganciato ai pixel interi solo se costa pochissimo:
 * sui display da 460 ppi dell'iPhone la frazione non si vede), ghiera grande quanto resta in altezza.
 * Su iPhone 16e (390×844, 3×): schermo 366×275, ghiera ≈ 330 px, niente scorrimento.
 */
export function computeFlatScale(availW: number, availH: number, dpr: number): FlatScale {
  const maxScale = Math.min(availW / 320, 1.6)
  const n = Math.floor(maxScale * dpr)
  let lcdScale = maxScale
  if (n >= 1) {
    const snapped = n / dpr
    if (snapped >= 0.96 * maxScale) lcdScale = snapped
  }
  const rest = availH - 240 * lcdScale - 40
  const wheelPx = Math.max(150, Math.min(availW * 0.92, rest, 400))
  return { lcdScale, wheelPx }
}

function useViewport(): { w: number; h: number; dpr: number; coarse: boolean } {
  const read = () => ({
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    coarse: window.matchMedia('(pointer: coarse)').matches,
  })
  const [vp, setVp] = useState(read)
  useEffect(() => {
    const update = () => setVp(read())
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])
  return vp
}

/** true quando l'iPod va mostrato senza cornice (impostazione, o automatica sui telefoni). */
export function useFlat(): boolean {
  const frame = useSettings((s) => s.frame)
  const vp = useViewport()
  if (frame === 'off') return true
  if (frame === 'on') return false
  return vp.coarse && vp.w < 700
}

function Wheel({ wheelRef, zone }: { wheelRef: React.RefObject<HTMLDivElement | null>; zone: WheelButton | 'ring' | null }) {
  return (
    <div ref={wheelRef} className="ipod-wheel" aria-hidden="true">
      <div className="ipod-wheel-press" data-zone={zone ?? ''} />
      <div className="ipod-label ipod-label-menu">MENU</div>
      <div className="ipod-label ipod-label-prev">
        <PrevGlyph />
      </div>
      <div className="ipod-label ipod-label-next">
        <NextGlyph />
      </div>
      <div className="ipod-label ipod-label-play">
        <PlayPauseGlyph />
      </div>
      <div className="ipod-center" data-pressed={zone === 'center' ? 'true' : 'false'} />
    </div>
  )
}

function HoldSwitch() {
  const hold = useSystem((s) => s.hold)
  return (
    <div
      className="ipod-hold"
      data-locked={hold ? 'true' : 'false'}
      onPointerDown={(e) => {
        e.preventDefault()
        unlockAudio()
        dispatch({ type: 'holdSwitch', locked: !hold })
      }}
      title="Hold"
    />
  )
}

export function Device({ children, reserveBottom = 96 }: { children: ReactNode; reserveBottom?: number }) {
  const color = useSettings((s) => s.color)
  const flat = useFlat()
  const vp = useViewport()
  const wheelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [zone, setZone] = useState<WheelButton | 'ring' | null>(null)

  const onInput = useCallback((e: InputEvent) => dispatch(e), [])
  const onGesture = useCallback(() => {
    unlockAudio()
    primeAudio()
  }, [])
  // Su iOS il tocco iniziale non conta come gesto: sblocchiamo anche al rilascio (e blocchiamo lo zoom a due dita).
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const up = () => onGesture()
    const noGesture = (e: Event) => e.preventDefault()
    el.addEventListener('pointerup', up)
    document.addEventListener('gesturestart', noGesture)
    return () => {
      el.removeEventListener('pointerup', up)
      document.removeEventListener('gesturestart', noGesture)
    }
  }, [onGesture, flat])
  const onHoldSwitch = useCallback((locked: boolean) => dispatch({ type: 'holdSwitch', locked }), [])

  useClickWheel(wheelRef, { centerRatio: 8 / 20, onInput, onPointerDown: onGesture, onZoneChange: setZone })
  useMouseWheel(bodyRef, onInput, onGesture)
  useKeyboard(onInput, onGesture, onHoldSwitch)

  if (flat) {
    const fs = computeFlatScale(vp.w - 24, vp.h - 24 - reserveBottom, vp.dpr)
    const style = { '--mm': `${fs.wheelPx / 40}px`, '--lcd-scale': String(fs.lcdScale) } as React.CSSProperties
    return (
      <div ref={bodyRef} className="flat" data-color={color} style={style} role="application" aria-label="iPod">
        <div className="flat-screen" style={{ width: Math.round(320 * fs.lcdScale), height: Math.round(240 * fs.lcdScale) }}>
          <div className="ipod-lcd-inner">{children}</div>
        </div>
        <div className="flat-hold">
          <HoldSwitch />
        </div>
        <Wheel wheelRef={wheelRef} zone={zone} />
      </div>
    )
  }

  const scale = computeScale(vp.w - 32, vp.h - 40 - reserveBottom, vp.dpr, vp.coarse)
  const style = { '--mm': `${scale.mm}px`, '--lcd-scale': String(scale.lcdScale) } as React.CSSProperties
  return (
    <div className="ipod-stage" style={style}>
      <div ref={bodyRef} className="ipod" data-color={color} data-grain={scale.grain ? 'on' : 'off'} role="application" aria-label="iPod">
        <div className="ipod-top" aria-hidden="true">
          <HoldSwitch />
          <div className="ipod-jack" />
        </div>
        <div className="ipod-window">
          <div className="ipod-lcd">
            <div className="ipod-lcd-inner">{children}</div>
          </div>
          <div className="ipod-gloss" />
        </div>
        <Wheel wheelRef={wheelRef} zone={zone} />
      </div>
    </div>
  )
}
