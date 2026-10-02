import type { MouseEvent } from 'react'
import type { Appointment, Client, DateKey } from '../../domain/types'
import { isSameMonth, isWeekend, monthMatrix, parseKey, type RomeNow } from '../../lib/dates'
import { capitalize, WEEKDAY_SHORT } from '../../lib/format'
import { isAllDay } from '../../store/selectors'
import { appointmentPhase, dayAriaLabel } from './agendaUtils'
import { appointmentAriaLabel, appointmentTooltip, typeStyle } from './AppointmentBits'
import { WEEKDAY_LONG } from './MiniCalendar'
import './agenda.css'

interface MonthGridProps {
  /** Un giorno qualunque del mese da mostrare. */
  day: DateKey
  /** Appuntamenti delle 6 settimane visibili (già filtrati e ordinati). */
  appointments: Appointment[]
  now: RomeNow
  clients: Map<string, Client>
  onEdit(appointment: Appointment): void
  onOpenDay(day: DateKey): void
  onNew(day: DateKey): void
}

const MAX_CHIPS = 3

/**
 * Griglia del mese: fino a 3 appuntamenti per giorno ("+N altri"), clic su un giorno = vista Giorno.
 * Nelle griglie strette (tablet) le etichette perdono l'orario per lasciare spazio al titolo (vedi agenda.css).
 */
export function MonthGrid({ day, appointments, now, clients, onEdit, onOpenDay, onNew }: MonthGridProps) {
  const weeks = monthMatrix(day)
  const byDay = new Map<DateKey, Appointment[]>()
  for (const a of appointments) {
    const list = byDay.get(a.date) ?? []
    list.push(a)
    byDay.set(a.date, list)
  }

  // Clic sullo spazio vuoto di una casella: nuovo appuntamento (i pulsanti dentro la casella hanno la precedenza).
  const onCellClick = (event: MouseEvent<HTMLTableCellElement>, d: DateKey) => {
    if ((event.target as HTMLElement).closest('button, a')) return
    onNew(d)
  }

  return (
    <div className="ag-mg-wrap">
      <table className="ag-mg">
        <thead>
          <tr>
            {WEEKDAY_SHORT.map((w, i) => (
              <th key={w} scope="col" className={i >= 5 ? 'is-weekend' : undefined}>
                <abbr title={WEEKDAY_LONG[i]}>{capitalize(w)}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((d) => {
                const list = byDay.get(d) ?? []
                const activeTypes = list.filter((a) => a.status !== 'annullato').map((a) => a.type)
                const more = list.length - MAX_CHIPS
                const cls = [
                  'ag-mg-cell',
                  !isSameMonth(d, day) && 'is-outside',
                  isWeekend(d) && 'is-weekend',
                  d === now.date && 'is-today',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <td
                    key={d}
                    className={cls}
                    onClick={(e) => onCellClick(e, d)}
                    title="Clic su uno spazio libero per un nuovo appuntamento"
                  >
                    <button
                      type="button"
                      className="ag-mg-num num"
                      onClick={() => onOpenDay(d)}
                      aria-label={`${dayAriaLabel(d, activeTypes, now.date)}. Apri il giorno`}
                      aria-current={d === now.date ? 'date' : undefined}
                    >
                      {parseKey(d).day}
                    </button>
                    {list.length > 0 && (
                      <ul className="ag-mg-list">
                        {list.slice(0, MAX_CHIPS).map((a) => (
                          <li key={a.id}>
                            <button
                              type="button"
                              className={`ag-chip${a.status === 'annullato' ? ' is-cancelled' : ''}${appointmentPhase(a, now) === 'passato' ? ' is-past' : ''}`}
                              style={typeStyle(a)}
                              onClick={() => onEdit(a)}
                              aria-label={appointmentAriaLabel(
                                a,
                                a.clientId ? clients.get(a.clientId) : undefined,
                                appointmentPhase(a, now),
                              )}
                              title={appointmentTooltip(a, a.clientId ? clients.get(a.clientId) : undefined)}
                            >
                              {!isAllDay(a) && <span className="ag-chip-time num">{a.start}</span>}
                              <span className="ag-chip-title">{a.title}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {more > 0 && (
                      <button type="button" className="ag-mg-more" onClick={() => onOpenDay(d)}>
                        +{more} {more === 1 ? 'altro' : 'altri'}
                        <span className="visually-hidden">: apri il giorno</span>
                      </button>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
