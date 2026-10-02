import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { APPOINTMENT_TYPE_TONE, TONE_COLOR } from '../../domain/labels'
import type { AppointmentType, DateKey } from '../../domain/types'
import { addDays, addMonths, isSameMonth, monthMatrix, parseKey, startOfMonth, weekdayIndex } from '../../lib/dates'
import { capitalize, formatDateLong, formatMonthYear, plural, WEEKDAY_MIN } from '../../lib/format'
import './agenda.css'

export interface MiniCalendarProps {
  /** Un qualunque giorno del mese da mostrare. */
  month: DateKey
  today: DateKey
  selected?: DateKey
  /** Tipi di appuntamento per giorno (pallini colorati). */
  marks?: Map<DateKey, AppointmentType[]>
  onSelect(day: DateKey): void
  onMonthChange(month: DateKey): void
  /** Facoltativo: id dell'elemento radice (per aria-controls). */
  id?: string
  className?: string
  /** Facoltativo: nasconde intestazione e frecce (quando la pagina ha già la sua barra di navigazione). */
  hideHeader?: boolean
}

export const WEEKDAY_LONG = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']

/** Testo per lettori di schermo: "venerdì 2 ottobre 2026, 4 appuntamenti, oggi". */
export function dayAriaLabel(day: DateKey, count: number, today: DateKey): string {
  let label = formatDateLong(day)
  if (count > 0) label += `, ${plural(count, 'appuntamento', 'appuntamenti')}`
  if (day === today) label += ', oggi'
  return label
}

/** Pallini colorati per tipo di appuntamento (massimo 3, poi "+"). */
export function TypeDots({
  types,
  className = 'ag-dots',
}: {
  types: AppointmentType[] | undefined
  className?: string
}) {
  if (!types || types.length === 0) return null
  return (
    <span className={className} aria-hidden="true">
      {types.slice(0, 3).map((t, i) => (
        <span key={i} className="ag-dot" style={{ background: TONE_COLOR[APPOINTMENT_TYPE_TONE[t]] }} />
      ))}
      {types.length > 3 && <span className="ag-dot-more">+</span>}
    </span>
  )
}

/**
 * Calendario mensile compatto (lun→dom) con pallini sugli appuntamenti.
 * Semantica ARIA "grid" con tabindex mobile: frecce = giorno/settimana, Home/Fine = inizio/fine settimana,
 * PagSu/PagGiù = mese precedente/successivo (con Maiusc: anno), Invio/Spazio = seleziona.
 */
export function MiniCalendar({
  month,
  today,
  selected,
  marks,
  onSelect,
  onMonthChange,
  id,
  className,
  hideHeader = false,
}: MiniCalendarProps) {
  const titleId = useId()
  const gridRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<DateKey | null>(null)
  const [focusDay, setFocusDay] = useState<DateKey | null>(null)
  const weeks = monthMatrix(month)

  // Giorno raggiungibile con Tab (tabindex mobile): quello con il focus, poi il selezionato, oggi o il primo del mese.
  const tabbable =
    [focusDay, selected, today].find((d): d is DateKey => !!d && isSameMonth(d, month)) ?? startOfMonth(month)

  // Dopo un cambio di mese da tastiera, il focus va sul giorno corrispondente nella nuova griglia.
  useEffect(() => {
    const day = pendingFocus.current
    if (!day) return
    const button = gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)
    if (button) {
      pendingFocus.current = null
      button.focus()
    }
  })

  const moveFocus = (day: DateKey) => {
    setFocusDay(day)
    pendingFocus.current = day
    if (!isSameMonth(day, month)) onMonthChange(day)
    else gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, day: DateKey) => {
    let next: DateKey
    switch (event.key) {
      case 'ArrowLeft':
        next = addDays(day, -1)
        break
      case 'ArrowRight':
        next = addDays(day, 1)
        break
      case 'ArrowUp':
        next = addDays(day, -7)
        break
      case 'ArrowDown':
        next = addDays(day, 7)
        break
      case 'Home':
        next = addDays(day, -weekdayIndex(day))
        break
      case 'End':
        next = addDays(day, 6 - weekdayIndex(day))
        break
      case 'PageUp':
        next = addMonths(day, event.shiftKey ? -12 : -1)
        break
      case 'PageDown':
        next = addMonths(day, event.shiftKey ? 12 : 1)
        break
      default:
        return
    }
    event.preventDefault()
    moveFocus(next)
  }

  const select = (day: DateKey) => {
    setFocusDay(day)
    if (!isSameMonth(day, month)) onMonthChange(day)
    onSelect(day)
  }

  return (
    <div className={`ag-mc${className ? ` ${className}` : ''}`} id={id}>
      <div className={hideHeader ? 'visually-hidden' : 'ag-mc-header'}>
        <h3 id={titleId} className="ag-mc-title" aria-live={hideHeader ? undefined : 'polite'}>
          {capitalize(formatMonthYear(month))}
        </h3>
        {!hideHeader && (
          <div className="ag-mc-nav">
            <button
              type="button"
              className="btn btn-ghost btn-sm ag-mc-today"
              onClick={() => select(today)}
              aria-label="Vai a oggi"
            >
              Oggi
            </button>
            <button
              type="button"
              className="icon-btn ag-mc-arrow"
              aria-label="Mese precedente"
              onClick={() => onMonthChange(addMonths(month, -1))}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-btn ag-mc-arrow"
              aria-label="Mese successivo"
              onClick={() => onMonthChange(addMonths(month, 1))}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div role="grid" aria-labelledby={titleId} className="ag-mc-grid" ref={gridRef}>
        <div role="row" className="ag-mc-row">
          {WEEKDAY_MIN.map((w, i) => (
            <div role="columnheader" key={w} className={`ag-mc-wd${i >= 5 ? ' ag-mc-wd--weekend' : ''}`}>
              <span aria-hidden="true">{w}</span>
              <span className="visually-hidden">{WEEKDAY_LONG[i]}</span>
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div role="row" className="ag-mc-row" key={week[0]}>
            {week.map((day) => {
              const types = marks?.get(day)
              const outside = !isSameMonth(day, month)
              const isToday = day === today
              const isSelected = day === selected
              const cls = [
                'ag-mc-day',
                outside && 'ag-mc-day--outside',
                isToday && 'ag-mc-day--today',
                isSelected && 'ag-mc-day--selected',
                weekdayIndex(day) >= 5 && 'ag-mc-day--weekend',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <div role="gridcell" key={day} aria-selected={isSelected} className="ag-mc-cell">
                  <button
                    type="button"
                    className={cls}
                    data-day={day}
                    tabIndex={day === tabbable ? 0 : -1}
                    aria-label={dayAriaLabel(day, types?.length ?? 0, today)}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => select(day)}
                    onKeyDown={(e) => onKeyDown(e, day)}
                    onFocus={() => setFocusDay(day)}
                  >
                    <span className="ag-mc-num num">{parseKey(day).day}</span>
                    <TypeDots types={types} />
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
