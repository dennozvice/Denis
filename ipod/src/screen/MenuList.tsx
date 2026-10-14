/** Renderer delle liste: solo le righe visibili, evidenziazione, valori, barra di scorrimento, marquee. */
import { useEffect, useRef } from 'react'
import { useUi } from '../core/ui'
import { CheckIcon, Chevron, SpeakerIcon } from './icons'
import { ROW_HEIGHT, VISIBLE_ROWS, type ListItem } from './listModel'

/** Testo che scorre quando non entra nella riga selezionata (attesa 1 s, 30 px/s, pausa, ritorno secco). */
export function Marquee({ text, active }: { text: string; active: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !active) return
    const parent = el.parentElement
    if (!parent) return
    const overflow = el.scrollWidth - parent.clientWidth
    if (overflow <= 2) return
    const duration = (overflow / 30) * 1000
    const anim = el.animate(
      [
        { transform: 'translateX(0)', offset: 0 },
        { transform: 'translateX(0)', offset: 1000 / (duration + 3000) },
        { transform: `translateX(${-overflow}px)`, offset: (1000 + duration) / (duration + 3000) },
        { transform: `translateX(${-overflow}px)`, offset: (2000 + duration) / (duration + 3000) },
        { transform: 'translateX(0)', offset: (2000 + duration + 1) / (duration + 3000) },
        { transform: 'translateX(0)', offset: 1 },
      ],
      { duration: duration + 3000, iterations: Infinity, easing: 'linear' },
    )
    return () => anim.cancel()
  }, [text, active])
  return (
    <span ref={ref} className="row-marquee">
      {text}
    </span>
  )
}

export function MenuList({
  items,
  sel,
  first,
  split = false,
  letters = false,
  width,
}: {
  items: ListItem[]
  sel: number
  first: number
  split?: boolean
  letters?: boolean
  width?: number
}) {
  const letter = useUi((s) => s.letter)
  const blink = useUi((s) => s.blink)
  const blinkRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!blink || !blinkRef.current) return
    const el = blinkRef.current
    const anim = el.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }, { opacity: 0 }, { opacity: 1 }, { opacity: 0 }, { opacity: 1 }], {
      duration: 540,
      easing: 'steps(1, end)',
    })
    return () => anim.cancel()
  }, [blink])

  const total = items.length
  const hasScrollbar = total > VISIBLE_ROWS
  const listWidth = width ?? (split ? 160 : 320)
  const rowWidth = hasScrollbar ? listWidth - 15 : listWidth
  const visible = items.slice(first, first + VISIBLE_ROWS)
  const thumbH = Math.max(14, Math.round((213 * VISIBLE_ROWS) / Math.max(total, 1)))
  const thumbTop = total > VISIBLE_ROWS ? Math.round(((213 - thumbH) * first) / (total - VISIBLE_ROWS)) : 0

  return (
    <div className="list" data-split={split ? 'true' : 'false'} style={{ width: listWidth }}>
      {visible.map((item, i) => {
        const index = first + i
        const selected = index === sel
        return (
          <div
            key={item.id}
            ref={selected ? blinkRef : undefined}
            className="row"
            data-sel={selected ? 'true' : 'false'}
            style={{ top: i * ROW_HEIGHT, width: rowWidth }}
          >
            <div className="row-label" data-marquee={selected ? 'true' : 'false'}>
              {selected ? <Marquee text={item.label} active={selected} /> : item.label}
              {item.sub && <span className="row-sub">{item.sub}</span>}
            </div>
            {item.playing && (
              <div className="row-icon">
                <SpeakerIcon />
              </div>
            )}
            {item.value !== undefined && <div className="row-value">{item.value}</div>}
            {item.checked && (
              <div className="row-icon">
                <CheckIcon />
              </div>
            )}
            {item.chevron && (
              <div className="row-chevron">
                <Chevron />
              </div>
            )}
          </div>
        )
      })}
      {hasScrollbar && (
        <div className="scrollbar" style={{ left: listWidth - 12 }}>
          <div className="scrollbar-thumb" style={{ top: thumbTop, height: thumbH }} />
        </div>
      )}
      {letters && letter && hasScrollbar && (
        <div className="letter-overlay" style={{ left: 160, top: 109 }}>
          {letter}
        </div>
      )}
    </div>
  )
}
