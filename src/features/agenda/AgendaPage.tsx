import { CalendarDays, ChevronLeft, ChevronRight, Download, Plus, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Segmented } from '../../components/ui/Segmented'
import { useToast } from '../../components/ui/Toast'
import { APPOINTMENT_TYPE_LABEL, APPOINTMENT_TYPE_TONE, TONE_COLOR } from '../../domain/labels'
import type { AppointmentType, DateKey, TimeKey } from '../../domain/types'
import { addDays, diffDays, isDateKey, timeToMinutes, weekDays } from '../../lib/dates'
import { formatDateShort, formatRelativeDays, formatWeekdayDayMonth, capitalize, plural } from '../../lib/format'
import { appointmentsToIcs } from '../../lib/ics'
import { navigate, useRoute } from '../../router/router'
import { useNow } from '../../store/NowContext'
import {
  appointmentsBetween,
  appointmentsOn,
  appointmentTypesByDay,
  compareAppointments,
  indexById,
  nextAppointment,
} from '../../store/selectors'
import { useAppData } from '../../store/StoreContext'
import {
  AGENDA_VIEWS,
  defaultStartFor,
  formatDuration,
  isAgendaView,
  needsOutcome,
  rangeLabel,
  stepDay,
  viewRange,
  type AgendaView,
} from './agendaUtils'
import { DayTimeline } from './DayTimeline'
import { IcsImportModal } from './IcsImportModal'
import { MiniCalendar } from './MiniCalendar'
import { MonthGrid } from './MonthGrid'
import { TimeGrid } from './TimeGrid'
import { useAppointmentEditor } from './useAppointmentEditor'
import { useMediaQuery } from './useMediaQuery'
import './agenda.css'

type TypeFilter = AppointmentType | 'tutti'

const TYPE_FILTER_OPTIONS = Object.entries(APPOINTMENT_TYPE_LABEL) as [AppointmentType, string][]

const STEP_LABEL: Record<AgendaView, [string, string]> = {
  giorno: ['Giorno precedente', 'Giorno successivo'],
  settimana: ['Settimana precedente', 'Settimana successiva'],
  mese: ['Mese precedente', 'Mese successivo'],
}

/** Pagina Agenda (#/agenda?giorno=YYYY-MM-DD&vista=giorno|settimana|mese). */
export function AgendaPage() {
  const { params } = useRoute()
  const now = useNow()
  const today = now.date
  const { appointments, clients, settings } = useAppData()
  const toast = useToast()
  const editor = useAppointmentEditor()
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [importOpen, setImportOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('tutti')
  // mese mostrato nel mini-calendario laterale, se diverso da quello del giorno scelto
  const [asideMonth, setAsideMonth] = useState<{ forDay: DateKey; month: DateKey } | null>(null)

  const day: DateKey = isDateKey(params.giorno) ? params.giorno : today
  // un link a un giorno preciso (dal widget o dalle notifiche) apre la vista Giorno
  const view: AgendaView = isAgendaView(params.vista) ? params.vista : params.giorno ? 'giorno' : 'settimana'

  const go = (patch: { giorno?: DateKey; vista?: AgendaView }) =>
    navigate('agenda', { giorno: patch.giorno ?? day, vista: patch.vista ?? view }, true)

  const clientsById = useMemo(() => indexById(clients), [clients])
  const filtered = useMemo(
    () => (typeFilter === 'tutti' ? appointments : appointments.filter((a) => a.type === typeFilter)),
    [appointments, typeFilter],
  )
  const { from, to } = viewRange(view, day)
  const inRange = useMemo(() => appointmentsBetween(filtered, from, to, true), [filtered, from, to])
  const activeInRange = inRange.filter((a) => a.status !== 'annullato')

  // ---------------------------------------------------------------- intestazione
  const todayCount = appointmentsOn(appointments, today).length
  const next = nextAppointment(appointments, now)
  const pendingOutcomes = appointments.filter((a) => a.date >= addDays(today, -14) && needsOutcome(a, now)).length
  const subtitle = [
    todayCount ? `${plural(todayCount, 'appuntamento', 'appuntamenti')} oggi` : 'Nessun appuntamento oggi',
    next &&
      (next.date === today
        ? timeToMinutes(next.start) <= now.minutes
          ? `in corso fino alle ${next.end}`
          : `prossimo alle ${next.start}`
        : `prossimo ${formatRelativeDays(diffDays(today, next.date))} alle ${next.start}`),
    pendingOutcomes > 0 && plural(pendingOutcomes, 'esito da registrare', 'esiti da registrare'),
  ]
    .filter(Boolean)
    .join(' · ')

  const openNew = (date: DateKey, start?: TimeKey) =>
    editor.openNew({
      date,
      start: start ?? defaultStartFor(date, now),
      ...(typeFilter !== 'tutti' ? { type: typeFilter } : {}),
    })

  const exportIcs = () => {
    const since = addDays(today, -30)
    const list = appointments.filter((a) => a.status !== 'annullato' && a.date >= since).sort(compareAppointments)
    if (list.length === 0) {
      toast({ message: 'Nessun appuntamento da esportare' })
      return
    }
    const ics = appointmentsToIcs(list, clients, { calendarName: `Agenda ${settings.brandName || ''}`.trim() })
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `agenda-${today}.ics`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    toast({ message: `Esportati ${plural(list.length, 'appuntamento', 'appuntamenti')} dal ${formatDateShort(since)}` })
  }

  // ---------------------------------------------------------------- viste
  const [prevLabel, nextLabel] = STEP_LABEL[view]
  const legendTypes = Array.from(new Set(activeInRange.map((a) => a.type)))

  let body: React.ReactNode
  if (view === 'giorno') {
    const dayList = inRange.filter((a) => a.date === day)
    const month = asideMonth && asideMonth.forDay === day ? asideMonth.month : day
    body = (
      <div className="ag-day-layout">
        <div className="ag-day-main">
          <TimeGrid
            variant="day"
            days={[day]}
            appointments={dayList}
            now={now}
            clients={clientsById}
            onEdit={editor.openEdit}
            onSlot={openNew}
          />
          {dayList.length === 0 && (
            <p className="ag-day-empty small muted">
              Nessun appuntamento {day === today ? 'oggi' : `per ${formatWeekdayDayMonth(day)}`}: fai clic su un orario
              libero per aggiungerne uno.
            </p>
          )}
        </div>
        <aside className="ag-day-aside" aria-label="Calendario e riepilogo del giorno">
          <MiniCalendar
            month={month}
            today={today}
            selected={day}
            marks={appointmentTypesByDay(filtered, viewRange('mese', month).from, viewRange('mese', month).to)}
            onSelect={(d) => {
              setAsideMonth(null)
              go({ giorno: d })
            }}
            onMonthChange={(m) => setAsideMonth({ forDay: day, month: m })}
          />
          <DaySummary list={dayList.filter((a) => a.status !== 'annullato')} now={now} />
        </aside>
      </div>
    )
  } else if (view === 'settimana') {
    const days = weekDays(day)
    body = isMobile ? (
      <div className="ag-week-list">
        {days.map((d) => {
          const list = inRange.filter((a) => a.date === d)
          return (
            <section
              key={d}
              className={`ag-week-day${d === today ? ' is-today' : ''}`}
              aria-label={capitalize(formatWeekdayDayMonth(d))}
            >
              <div className="ag-week-day-head">
                <button type="button" className="ag-week-day-title" onClick={() => go({ giorno: d, vista: 'giorno' })}>
                  {capitalize(formatWeekdayDayMonth(d))}
                  {d === today && (
                    <span className="pill" data-tone="primary">
                      Oggi
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="icon-btn ag-week-day-add"
                  onClick={() => openNew(d)}
                  aria-label={`Nuovo appuntamento ${formatWeekdayDayMonth(d)}`}
                >
                  <Plus size={18} aria-hidden="true" />
                </button>
              </div>
              {list.length > 0 ? (
                <DayTimeline
                  day={d}
                  appointments={list}
                  now={now}
                  clients={clientsById}
                  onEdit={editor.openEdit}
                  size="regular"
                />
              ) : (
                <p className="small muted ag-week-day-empty">Nessun appuntamento</p>
              )}
            </section>
          )
        })}
      </div>
    ) : (
      <TimeGrid
        variant="week"
        days={days}
        appointments={inRange}
        now={now}
        clients={clientsById}
        onEdit={editor.openEdit}
        onSlot={openNew}
        onOpenDay={(d) => go({ giorno: d, vista: 'giorno' })}
      />
    )
  } else {
    const dayList = inRange.filter((a) => a.date === day)
    body = isMobile ? (
      <div className="ag-month-mobile">
        <MiniCalendar
          hideHeader
          month={day}
          today={today}
          selected={day}
          marks={appointmentTypesByDay(filtered, from, to)}
          onSelect={(d) => go({ giorno: d })}
          onMonthChange={(m) => go({ giorno: m })}
        />
        <section className="ag-month-day" aria-label={capitalize(formatWeekdayDayMonth(day))}>
          <div className="ag-week-day-head">
            <h3 className="ag-month-day-title">{capitalize(formatWeekdayDayMonth(day))}</h3>
            <button
              type="button"
              className="icon-btn ag-week-day-add"
              onClick={() => openNew(day)}
              aria-label={`Nuovo appuntamento ${formatWeekdayDayMonth(day)}`}
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
          {dayList.length > 0 ? (
            <DayTimeline
              day={day}
              appointments={dayList}
              now={now}
              clients={clientsById}
              onEdit={editor.openEdit}
              size="regular"
            />
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="Nessun appuntamento"
              action={
                <button type="button" className="btn btn-sm" onClick={() => openNew(day)}>
                  <Plus size={16} aria-hidden="true" />
                  Aggiungi appuntamento
                </button>
              }
            />
          )}
        </section>
      </div>
    ) : (
      <MonthGrid
        day={day}
        appointments={inRange}
        now={now}
        clients={clientsById}
        onEdit={editor.openEdit}
        onOpenDay={(d) => go({ giorno: d, vista: 'giorno' })}
        onNew={(d) => openNew(d)}
      />
    )
  }

  return (
    <div className="page ag-page">
      <header className="page-header">
        <div>
          <h1>Agenda</h1>
          <p>{subtitle}</p>
        </div>
        <div className="ag-page-actions">
          <button type="button" className="btn" onClick={() => setImportOpen(true)} aria-haspopup="dialog">
            <Upload size={18} aria-hidden="true" />
            <span className="ag-label-long">Importa calendario (.ics)</span>
            <span className="ag-label-short" aria-hidden="true">
              Importa
            </span>
          </button>
          <button type="button" className="btn" onClick={exportIcs}>
            <Download size={18} aria-hidden="true" />
            <span className="ag-label-long">Esporta .ics</span>
            <span className="ag-label-short" aria-hidden="true">
              Esporta
            </span>
          </button>
          <button type="button" className="btn btn-primary" onClick={() => openNew(day)} aria-haspopup="dialog">
            <Plus size={18} aria-hidden="true" />
            <span className="ag-label-long">Nuovo appuntamento</span>
            <span className="ag-label-short" aria-hidden="true">
              Nuovo
            </span>
          </button>
        </div>
      </header>

      <section className="card ag-cal" aria-labelledby="ag-range-label">
        <div className="ag-toolbar">
          <div className="ag-toolbar-nav">
            <button
              type="button"
              className="icon-btn ag-nav-btn"
              aria-label={prevLabel}
              title={prevLabel}
              onClick={() => go({ giorno: stepDay(view, day, -1) })}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-sm ag-today-btn"
              onClick={() => go({ giorno: today })}
              aria-label="Vai a oggi"
            >
              Oggi
            </button>
            <button
              type="button"
              className="icon-btn ag-nav-btn"
              aria-label={nextLabel}
              title={nextLabel}
              onClick={() => go({ giorno: stepDay(view, day, 1) })}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
            <h2 id="ag-range-label" className="ag-range num" aria-live="polite">
              {rangeLabel(view, day)}
            </h2>
          </div>
          <div className="ag-toolbar-tools">
            <Segmented
              options={AGENDA_VIEWS}
              value={view}
              onChange={(v) => go({ vista: v })}
              ariaLabel="Vista del calendario"
            />
            <label className="ag-filter">
              <span className="visually-hidden">Filtra per tipo di appuntamento</span>
              <select
                className="select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              >
                <option value="tutti">Tutti i tipi</option>
                {TYPE_FILTER_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {typeFilter !== 'tutti' && (
          <p className="ag-filter-note small" role="status">
            Filtro attivo: <strong>{APPOINTMENT_TYPE_LABEL[typeFilter]}</strong> ·{' '}
            <button type="button" className="btn-link" onClick={() => setTypeFilter('tutti')}>
              Mostra tutti
            </button>
          </p>
        )}

        {body}

        {view !== 'giorno' && legendTypes.length > 0 && (
          <ul className="ag-legend" aria-label="Legenda dei tipi di appuntamento">
            {legendTypes.map((t) => (
              <li key={t}>
                <span
                  className="ag-dot"
                  style={{ background: TONE_COLOR[APPOINTMENT_TYPE_TONE[t]] }}
                  aria-hidden="true"
                />
                {APPOINTMENT_TYPE_LABEL[t]}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editor.modal}
      <IcsImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}

function DaySummary({ list, now }: { list: ReturnType<typeof appointmentsOn>; now: ReturnType<typeof useNow> }) {
  const minutes = list.reduce((sum, a) => sum + Math.max(0, timeToMinutes(a.end) - timeToMinutes(a.start)), 0)
  const tentative = list.filter((a) => a.status === 'pianificato').length
  const outcomes = list.filter((a) => needsOutcome(a, now)).length
  return (
    <div className="ag-day-summary">
      <h3>Riepilogo del giorno</h3>
      <dl>
        <div>
          <dt>Appuntamenti</dt>
          <dd className="num">{list.length}</dd>
        </div>
        <div>
          <dt>Tempo in agenda</dt>
          <dd className="num">{list.length ? formatDuration(minutes) : '—'}</dd>
        </div>
        <div>
          <dt>Da confermare</dt>
          <dd className="num">{tentative}</dd>
        </div>
        <div>
          <dt>Esiti da registrare</dt>
          <dd className="num">{outcomes}</dd>
        </div>
      </dl>
    </div>
  )
}
