/**
 * Il dispositivo: scocca, finestra con LCD, ghiera con etichette, interruttore Hold.
 * Gli input (dito/mouse sulla ghiera, rotella, tastiera) diventano InputEvent e vanno
 * al dispatcher; la grafica dello schermo è nel componente figlio (children).
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
 * Calcola i pixel per millimetro in base allo spazio disponibile. Quando possibile
 * un pixel dell'LCD corrisponde a un numero intero di pixel fisici (testo nitido).
 */
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

function useDeviceScale(reserveBottom: number): DeviceScale {
  const [scale, setScale] = useState<DeviceScale>(() => computeScale(360, 640, 1))
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth - 32
      const h = window.innerHeight - 40 - reserveBottom
      const coarse = window.matchMedia('(pointer: coarse)').matches
      setScale(computeScale(w, h, window.devicePixelRatio || 1, coarse))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [reserveBottom])
  return scale
}

export function Device({ children, reserveBottom = 96 }: { children: ReactNode; reserveBottom?: number }) {
  const color = useSettings((s) => s.color)
  const hold = useSystem((s) => s.hold)
  const scale = useDeviceScale(reserveBottom)
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
  }, [onGesture])
  const onHoldSwitch = useCallback((locked: boolean) => dispatch({ type: 'holdSwitch', locked }), [])

  useClickWheel(wheelRef, { centerRatio: 8 / 20, onInput, onPointerDown: onGesture, onZoneChange: setZone })
  useMouseWheel(bodyRef, onInput, onGesture)
  useKeyboard(onInput, onGesture, onHoldSwitch)

  const style = { '--mm': `${scale.mm}px`, '--lcd-scale': String(scale.lcdScale) } as React.CSSProperties

  return (
    <div className="ipod-stage" style={style}>
      <div ref={bodyRef} className="ipod" data-color={color} data-grain={scale.grain ? 'on' : 'off'} role="application" aria-label="iPod">
        <div className="ipod-top" aria-hidden="true">
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
          <div className="ipod-jack" />
        </div>
        <div className="ipod-window">
          <div className="ipod-lcd">
            <div className="ipod-lcd-inner">{children}</div>
          </div>
          <div className="ipod-gloss" />
        </div>
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
      </div>
    </div>
  )
}
