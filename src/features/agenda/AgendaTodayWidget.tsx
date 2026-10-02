import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import type { DateKey } from '../../domain/types'
import { addDays, monthMatrix, parseKey, startOfWeek, weekDays } from '../../lib/dates'
import { formatDayMonth, formatWeekdayDayMonth, plural, WEEKDAY_MIN } from '../../lib/format'
import { buildHref } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { appointmentsOn, appointmentTypesByDay, indexById, isAllDay } from '../../store/selectors'
import { useAppData } from '../../store/StoreContext'
import { appointmentPhase, busyMinutes, defaultStartFor, formatDuration, relativeDayLabel } from './agendaUtils'
import { DayTimeline } from './DayTimeline'
import { dayAriaLabel, MiniCalendar, TypeDots } from './MiniCalendar'
import { useAppointmentEditor } from './useAppointmentEditor'
import './agenda.css'

/**
 * Widget "Agenda" della panoramica: appuntamenti del giorno scelto (oggi di default) con linea "adesso",
 * mini-calendario a destra su desktop; su tablet e mobile una striscia settimanale con il mese a scomparsa.
 */
export function AgendaTodayWidget() {
  const { appointments, clients } = useAppData()
  const now = useNow()
  const today = now.date
  const calendarId = useId()
  // null = segue "oggi" (anche dopo la mezzanotte)
  const [picked, setPicked] = useState<DateKey | null>(null)
  const [pickedMonth, setPickedMonth] = useState<DateKey | null>(null)
  const [monthOpen, setMonthOpen] = useState(false)
  const editor = useAppointmentEditor()

  const selected = picked ?? today
  const month = pickedMonth ?? selected
  const week = weekDays(selected)

  const clientsById = useMemo(() => indexById(clients), [clients])
  const dayList = useMemo(() => appointmentsOn(appointments, selected, true), [appointments, selected])
  const active = dayList.filter((a) => a.status !== 'annullato')
  // pallini per la griglia del mese e per la striscia della settimana (che può cadere in un altro mese)
  const marks = useMemo(() => {
    const grid = monthMatrix(month)
    const weekStart = startOfWeek(selected)
    const weekEnd = addDays(weekStart, 6)
    const from = grid[0][0] < weekStart ? grid[0][0] : weekStart
    const to = grid[5][6] > weekEnd ? grid[5][6] : weekEnd
    return appointmentTypesByDay(appointments, from, to)
  }, [appointments, month, selected])

  const select = (day: DateKey) => {
    setPicked(day === today ? null : day)
    setPickedMonth(null)
  }

  const addNew = () => editor.openNew({ date: selected, start: defaultStartFor(selected, now) })
  const isToday = selected === today
  const totalMinutes = busyMinutes(active)

  return (
    <Card
      className="ag-w"
      id="agenda-widget"
      title="Agenda"
      subtitle={
        <>
          <span>{relativeDayLabel(selected, today)}</span>
          {active.length > 0 && <span> · {plural(active.length, 'appuntamento', 'appuntamenti')}</span>}
          {!isToday && (
            <>
              {' · '}
              <button type="button" className="btn-link ag-w-back" onClick={() => select(today)}>
                Torna a oggi
              </button>
            </>
          )}
        </>
      }
      actions={
        <>
          <button
            type="button"
            className="icon-btn ag-w-add"
            onClick={addNew}
            aria-label={`Nuovo appuntamento ${isToday ? 'oggi' : `il ${formatWeekdayDayMonth(selected)}`}`}
            title="Nuovo appuntamento"
            aria-haspopup="dialog"
          >
            <Plus size={20} aria-hidden="true" />
          </button>
          <a className="card-link ag-w-open" href={buildHref('agenda', { giorno: selected })}>
            Apri agenda
            <ChevronRight size={14} aria-hidden="true" />
          </a>
        </>
      }
      footer={
        active.length > 0 ? (
          <Summary isToday={isToday} totalMinutes={totalMinutes} list={active} now={now} />
        ) : undefined
      }
    >
      <div className="ag-w-body">
        <div className="ag-w-layout">
          {/* Tablet e mobile: striscia della settimana + mese a scomparsa */}
          <div className="ag-w-strip">
            <div className="ag-w-strip-head">
              <button
                type="button"
                className="icon-btn ag-w-arrow"
                aria-label="Settimana precedente"
                onClick={() => select(addDays(selected, -7))}
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span className="ag-w-strip-label num">
                {formatDayMonth(week[0])} – {formatDayMonth(week[6])}
              </span>
              <button
                type="button"
                className="icon-btn ag-w-arrow"
                aria-label="Settimana successiva"
                onClick={() => select(addDays(selected, 7))}
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm ag-w-month-toggle"
                aria-expanded={monthOpen}
                aria-controls={calendarId}
                onClick={() => setMonthOpen((v) => !v)}
              >
                Mese
                <ChevronDown size={16} aria-hidden="true" className="ag-w-chevron" />
              </button>
            </div>
            <div className="ag-ws" role="group" aria-label="Giorni della settimana">
              {week.map((day, i) => (
                <button
                  key={day}
                  type="button"
                  className={`ag-ws-day${day === today ? ' ag-ws-day--today' : ''}${i >= 5 ? ' ag-ws-day--weekend' : ''}`}
                  aria-pressed={day === selected}
                  aria-current={day === today ? 'date' : undefined}
                  aria-label={dayAriaLabel(day, marks.get(day)?.length ?? 0, today)}
                  onClick={() => select(day)}
                >
                  <span className="ag-ws-wd" aria-hidden="true">
                    {WEEKDAY_MIN[i]}
                  </span>
                  <span className="ag-ws-num num" aria-hidden="true">
                    {parseKey(day).day}
                  </span>
                  <TypeDots types={marks.get(day)} />
                </button>
              ))}
            </div>
          </div>

          <div className={`ag-w-cal${monthOpen ? ' is-open' : ''}`} id={calendarId}>
            <MiniCalendar
              month={month}
              today={today}
              selected={selected}
              marks={marks}
              onSelect={select}
              onMonthChange={(m) => setPickedMonth(m)}
            />
          </div>

          <div className="ag-w-main">
            {dayList.length > 0 ? (
              <DayTimeline
                day={selected}
                appointments={dayList}
                now={now}
                clients={clientsById}
                onEdit={editor.openEdit}
              />
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="Nessun appuntamento"
                text={
                  isToday
                    ? 'La giornata è libera da appuntamenti.'
                    : `Nessun appuntamento per ${formatWeekdayDayMonth(selected)}.`
                }
                action={
                  <button type="button" className="btn btn-sm ag-w-empty-add" onClick={addNew} aria-haspopup="dialog">
                    <Plus size={16} aria-hidden="true" />
                    Aggiungi appuntamento
                  </button>
                }
              />
            )}
          </div>
        </div>
      </div>
      {editor.modal}
    </Card>
  )
}

function Summary({
  isToday,
  totalMinutes,
  list,
  now,
}: {
  isToday: boolean
  totalMinutes: number
  list: ReturnType<typeof appointmentsOn>
  now: ReturnType<typeof useNow>
}) {
  // gli eventi "tutto il giorno" non sono né "in corso" né "il prossimo"
  const timed = isToday ? list.filter((a) => !isAllDay(a)) : []
  const current = timed.find((a) => appointmentPhase(a, now) === 'in_corso')
  const next = timed.find((a) => appointmentPhase(a, now) === 'futuro')
  return (
    <p className="ag-w-summary small">
      <span className="num">
        {plural(list.length, 'appuntamento', 'appuntamenti')}
        {totalMinutes > 0 && ` · ${formatDuration(totalMinutes)} in agenda`}
      </span>
      {isToday && (
        <span className="ag-w-summary-next">
          {current ? (
            <>
              In corso fino alle <strong className="num">{current.end}</strong>
              {next && (
                <>
                  {' · '}Poi alle <strong className="num">{next.start}</strong>
                </>
              )}
            </>
          ) : next ? (
            <>
              Prossimo alle <strong className="num">{next.start}</strong>
              <span className="ag-w-summary-title"> · {next.title}</span>
            </>
          ) : (
            'Nessun altro appuntamento oggi'
          )}
        </span>
      )}
    </p>
  )
}
