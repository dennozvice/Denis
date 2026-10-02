import { ClipboardCheck, ExternalLink, Navigation, Phone } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Modal } from '../../components/ui/Modal'
import type { Appointment, Client, DateKey, TimeKey } from '../../domain/types'
import { isWeekend, minutesToTime, parseKey, weekdayIndex, type RomeNow } from '../../lib/dates'
import { capitalize, formatDateLong, formatWeekdayDayMonth, plural, WEEKDAY_SHORT } from '../../lib/format'
import { clientFullName, isAllDay } from '../../store/selectors'
import {
  appointmentPhase,
  capOverlaps,
  dayAriaLabel,
  hourRange,
  layoutOverlaps,
  mapsHref,
  needsOutcome,
  phoneFor,
  telHref,
  videoHref,
} from './agendaUtils'
import {
  appointmentAriaLabel,
  appointmentTooltip,
  LocationIcon,
  locationText,
  StatusPill,
  typeStyle,
} from './AppointmentBits'
import { DayTimeline } from './DayTimeline'
import { useMediaQuery } from './useMediaQuery'
import './agenda.css'

interface TimeGridProps {
  /** 1 giorno (vista Giorno) o 7 giorni (vista Settimana). */
  days: DateKey[]
  /** Appuntamenti dei giorni mostrati (anche annullati), già filtrati. */
  appointments: Appointment[]
  variant: 'day' | 'week'
  now: RomeNow
  clients: Map<string, Client>
  onEdit(appointment: Appointment, focusOutcome?: boolean): void
  /** Clic su uno spazio libero: nuovo appuntamento a quell'ora. */
  onSlot(day: DateKey, start: TimeKey): void
  /** Clic sull'intestazione di un giorno (vista Settimana). */
  onOpenDay?(day: DateKey): void
}

const HOUR_HEIGHT = { day: 64, week: 48 } as const
/** Altezza minima visiva dei blocchi, in minuti (gli eventi brevi restano leggibili). */
const MIN_VISUAL = { day: 32, week: 28 } as const
/** Eventi affiancati al massimo per gruppo di sovrapposizione (su mobile 2): gli altri finiscono nel pulsante "+N". */
const MAX_COLUMNS = { day: 3, week: 2 } as const

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * Griglia oraria (08–20, estesa se serve) con eventi posizionati per orario e affiancati se sovrapposti.
 * Oltre MAX_COLUMNS eventi contemporanei compare un pulsante "+N" che apre l'elenco di quelli non mostrati.
 */
export function TimeGrid({ days, appointments, variant, now, clients, onEdit, onSlot, onOpenDay }: TimeGridProps) {
  // elenco "+N" aperto: si conservano gli id, così l'elenco segue i dati aggiornati
  const [more, setMore] = useState<{ day: DateKey; ids: string[]; range: string } | null>(null)
  const isMobile = useMediaQuery('(max-width: 767px)')
  const maxColumns = isMobile ? Math.min(MAX_COLUMNS[variant], 2) : MAX_COLUMNS[variant]
  const hourHeight = HOUR_HEIGHT[variant]
  const { startHour, endHour } = hourRange(appointments)
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const toPx = (minutes: number) => ((minutes - startHour * 60) * hourHeight) / 60
  const allDay = appointments.filter(isAllDay)
  const timed = appointments.filter((a) => !isAllDay(a))
  const nowVisible = days.includes(now.date) && now.minutes >= startHour * 60 && now.minutes <= endHour * 60

  const gridStyle = { '--ag-hour': `${hourHeight}px`, '--ag-cols': days.length } as CSSProperties

  const byId = new Map(appointments.map((a) => [a.id, a]))
  const moreList = more ? more.ids.flatMap((id) => byId.get(id) ?? []) : []
  const moreTitle = more ? `${capitalize(formatWeekdayDayMonth(more.day))}, ${more.range}` : ''
  const moreFooter = (
    <>
      {onOpenDay && more && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setMore(null)
            onOpenDay(more.day)
          }}
        >
          Apri il giorno
        </button>
      )}
      <button type="button" className="btn btn-primary" onClick={() => setMore(null)}>
        Chiudi
      </button>
    </>
  )

  return (
    <div className={`ag-tg ag-tg--${variant}`} style={gridStyle}>
      {variant === 'week' && (
        <div className="ag-tg-head">
          <div className="ag-tg-corner" aria-hidden="true" />
          {days.map((day) => {
            const types = appointments.filter((a) => a.date === day && a.status !== 'annullato').map((a) => a.type)
            return (
              <div
                key={day}
                className={`ag-tg-dayhead${isWeekend(day) ? ' is-weekend' : ''}${day === now.date ? ' is-today' : ''}`}
              >
                <button
                  type="button"
                  className="ag-tg-daybtn"
                  onClick={() => onOpenDay?.(day)}
                  aria-label={`${dayAriaLabel(day, types, now.date)}. Apri il giorno`}
                  aria-current={day === now.date ? 'date' : undefined}
                >
                  <span className="ag-tg-wd" aria-hidden="true">
                    {WEEKDAY_SHORT[weekdayIndex(day)]}
                  </span>
                  <span className="ag-tg-dnum num" aria-hidden="true">
                    {parseKey(day).day}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {allDay.length > 0 && (
        <div className="ag-tg-allday">
          <div className="ag-tg-allday-label">Tutto il giorno</div>
          {days.map((day) => (
            <div key={day} className={`ag-tg-allday-cell${isWeekend(day) ? ' is-weekend' : ''}`}>
              {allDay
                .filter((a) => a.date === day)
                .map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`ag-chip${a.status === 'annullato' ? ' is-cancelled' : ''}`}
                    style={typeStyle(a)}
                    onClick={() => onEdit(a)}
                    aria-label={appointmentAriaLabel(
                      a,
                      a.clientId ? clients.get(a.clientId) : undefined,
                      appointmentPhase(a, now),
                    )}
                    title={appointmentTooltip(a, a.clientId ? clients.get(a.clientId) : undefined)}
                  >
                    <span className="truncate">{a.title}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}

      <div className="ag-tg-body" style={{ height: hours.length * hourHeight }}>
        <div className="ag-tg-gutter" aria-hidden="true">
          {hours.map((h) => (
            <span
              key={h}
              className="ag-tg-hour num"
              // l'etichetta dell'ora attuale prende il posto di quella vicina
              style={{
                top: (h - startHour) * hourHeight,
                visibility: nowVisible && Math.abs(now.minutes - h * 60) < 15 ? 'hidden' : undefined,
              }}
            >
              {pad2(h)}:00
            </span>
          ))}
          {nowVisible && (
            <span className="ag-tg-now-label num" style={{ top: toPx(now.minutes) }}>
              {now.time}
            </span>
          )}
        </div>

        {days.map((day) => {
          const { visible, hidden } = capOverlaps(
            layoutOverlaps(
              timed.filter((a) => a.date === day),
              MIN_VISUAL[variant],
            ),
            maxColumns,
          )
          return (
            <div
              key={day}
              role="group"
              aria-label={formatDateLong(day)}
              className={`ag-tg-col${isWeekend(day) ? ' is-weekend' : ''}${day === now.date ? ' is-today' : ''}`}
            >
              <div className="ag-tg-slots" aria-hidden="true">
                {hours.flatMap((h) =>
                  [0, 30].map((m) => {
                    const time = minutesToTime(h * 60 + m)
                    return (
                      <div
                        key={time}
                        className="ag-tg-slot"
                        data-time={time}
                        title={`Nuovo appuntamento alle ${time}`}
                        onClick={() => onSlot(day, time)}
                      />
                    )
                  }),
                )}
              </div>

              {visible.map(({ appointment: a, startMin, endMin, column, columns, crowded }) => {
                const top = toPx(startMin)
                const height = Math.max(endMin - startMin, MIN_VISUAL[variant]) * (hourHeight / 60) - 2
                // con eventi nascosti la fascia a destra (--ag-more-w) resta al pulsante "+N"
                const area = crowded ? '(100% - var(--ag-more-w))' : '100%'
                const style: CSSProperties = {
                  ...typeStyle(a),
                  top,
                  height,
                  left: `calc(${area} * ${column / columns} + 2px)`,
                  width: `calc(${area} / ${columns} - 4px)`,
                }
                const client = a.clientId ? clients.get(a.clientId) : undefined
                return variant === 'day' ? (
                  <DayEvent
                    key={a.id}
                    appointment={a}
                    client={client}
                    now={now}
                    style={style}
                    height={height}
                    onEdit={onEdit}
                  />
                ) : (
                  <WeekEvent
                    key={a.id}
                    appointment={a}
                    client={client}
                    now={now}
                    style={style}
                    height={height}
                    onEdit={onEdit}
                  />
                )
              })}

              {hidden.map((g) => {
                const n = g.appointments.length
                // orari reali (non l'ingombro minimo): dal primo inizio all'ultima fine del gruppo
                const first = g.appointments[0].start
                const lastEnd = g.appointments.reduce((end, a) => (a.end > end ? a.end : end), g.appointments[0].end)
                const range = `${first}–${lastEnd}`
                const label = plural(n, 'altro appuntamento', 'altri appuntamenti')
                return (
                  <button
                    key={g.appointments[0].id}
                    type="button"
                    className="ag-tg-more num"
                    style={{
                      top: toPx(g.startMin),
                      height: Math.max((g.endMin - g.startMin) * (hourHeight / 60) - 2, 24),
                    }}
                    onClick={() => setMore({ day, ids: g.appointments.map((a) => a.id), range })}
                    aria-haspopup="dialog"
                    aria-label={`${capitalize(label)} dalle ${first} alle ${lastEnd}: mostra l'elenco`}
                    title={`${capitalize(label)} (${range})`}
                  >
                    +{n}
                  </button>
                )
              })}

              {nowVisible && day === now.date && (
                <div className="ag-tg-now" style={{ top: toPx(now.minutes) }}>
                  <span className="visually-hidden">Adesso: {now.time}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Modal open={moreList.length > 0} title={moreTitle} onClose={() => setMore(null)} footer={moreFooter}>
        <p className="small muted">
          {plural(
            moreList.length,
            'appuntamento contemporaneo non mostrato',
            'appuntamenti contemporanei non mostrati',
          )}{' '}
          nella griglia per mancanza di spazio.
        </p>
        {more && (
          <DayTimeline
            day={more.day}
            appointments={moreList}
            now={now}
            clients={clients}
            onEdit={(a, focusOutcome) => {
              setMore(null)
              onEdit(a, focusOutcome)
            }}
          />
        )}
      </Modal>
    </div>
  )
}

interface EventProps {
  appointment: Appointment
  client: Client | undefined
  now: RomeNow
  style: CSSProperties
  height: number
  onEdit(appointment: Appointment, focusOutcome?: boolean): void
}

function eventClass(a: Appointment, now: RomeNow, extra: string): string {
  const phase = appointmentPhase(a, now)
  return [
    'ag-ev',
    extra,
    `ag-ev--${phase}`,
    a.status === 'annullato' && 'is-cancelled',
    a.status === 'pianificato' && 'is-tentative',
  ]
    .filter(Boolean)
    .join(' ')
}

/** Blocco compatto della vista Settimana: un unico pulsante. */
function WeekEvent({ appointment: a, client, now, style, height, onEdit }: EventProps) {
  const phase = appointmentPhase(a, now)
  return (
    <button
      type="button"
      className={eventClass(a, now, `ag-ev--week${height < 40 ? ' is-short' : ''}${height >= 70 ? ' is-tall' : ''}`)}
      style={style}
      onClick={() => onEdit(a)}
      aria-label={appointmentAriaLabel(a, client, phase)}
      title={appointmentTooltip(a, client)}
    >
      <span className="ag-ev-line">
        <span className="ag-ev-time num">{a.start}</span>
        <span className="ag-ev-title">{a.title}</span>
      </span>
      {height >= 44 && client && <span className="ag-ev-sub truncate">{clientFullName(client)}</span>}
    </button>
  )
}

/** Blocco della vista Giorno: titolo, dettagli e azioni rapide (Chiama, Indicazioni, Collegati, Registra esito). */
function DayEvent({ appointment: a, client, now, style, height, onEdit }: EventProps) {
  const phase = appointmentPhase(a, now)
  const cancelled = a.status === 'annullato'
  const active = !cancelled && phase !== 'passato'
  const phone = phoneFor(a, client)
  const tel = phone ? telHref(phone) : undefined
  const address = a.location === 'domicilio' ? a.locationDetail?.trim() : undefined
  const video = a.location === 'video' ? videoHref(a.locationDetail) : undefined
  const outcome = needsOutcome(a, now)
  const name = client ? clientFullName(client) : ''
  const showMeta = height >= 46

  return (
    <div
      className={eventClass(a, now, `ag-ev--day${height < 46 ? ' is-short' : ''}${height >= 60 ? ' is-tall' : ''}`)}
      style={style}
    >
      <div className="ag-ev-content">
        <span className="ag-ev-line">
          <span className="ag-ev-time num">
            {a.start}–{a.end}
          </span>
          <button
            type="button"
            className="ag-ev-title ag-ev-open"
            onClick={() => onEdit(a)}
            aria-label={appointmentAriaLabel(a, client, phase)}
            title={appointmentTooltip(a, client)}
          >
            {a.title}
          </button>
          <StatusPill appointment={a} phase={phase} />
        </span>
        {showMeta && (
          <span className="ag-ev-sub">
            {name && (
              <span className="ag-ev-client" title={name}>
                {name}
              </span>
            )}
            <span className="ag-ev-loc">
              <LocationIcon mode={a.location} size={13} />
              <span className="truncate">{locationText(a)}</span>
            </span>
          </span>
        )}
      </div>
      <div className="ag-ev-actions">
        {!cancelled && tel && (
          <a className="ag-ev-act" href={tel} aria-label={`Chiama ${name || phone}`} title={`Chiama ${phone}`}>
            <Phone size={15} aria-hidden="true" />
            <span className="ag-ev-act-label">Chiama</span>
          </a>
        )}
        {active && address && (
          <a
            className="ag-ev-act"
            href={mapsHref(address)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Indicazioni per ${address} (si apre in una nuova scheda)`}
            title="Indicazioni stradali"
          >
            <Navigation size={15} aria-hidden="true" />
            <span className="ag-ev-act-label">Indicazioni</span>
          </a>
        )}
        {active && video && (
          <a
            className="ag-ev-act"
            href={video}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Collegati alla videochiamata (si apre in una nuova scheda)"
            title="Collegati alla videochiamata"
          >
            <ExternalLink size={15} aria-hidden="true" />
            <span className="ag-ev-act-label">Collegati</span>
          </a>
        )}
        {outcome && (
          <button
            type="button"
            className="ag-ev-act ag-ev-act--outcome"
            onClick={() => onEdit(a, true)}
            aria-label={`Registra esito: ${a.title}`}
          >
            <ClipboardCheck size={15} aria-hidden="true" />
            <span className="ag-ev-act-label">Registra esito</span>
          </button>
        )}
      </div>
    </div>
  )
}
