import { ClipboardCheck, ExternalLink, Navigation, Phone } from 'lucide-react'
import { Fragment } from 'react'
import { APPOINTMENT_TYPE_LABEL } from '../../domain/labels'
import type { Appointment, Client, DateKey } from '../../domain/types'
import { timeToMinutes, type RomeNow } from '../../lib/dates'
import { buildHref } from '../../router/router'
import { clientFullName } from '../../store/selectors'
import { appointmentPhase, mapsHref, needsOutcome, phoneFor, telHref, videoHref } from './agendaUtils'
import { LocationIcon, StatusPill, locationText, typeStyle } from './AppointmentBits'
import './agenda.css'

interface DayTimelineProps {
  day: DateKey
  /** Appuntamenti del giorno, già ordinati per orario. */
  appointments: Appointment[]
  now: RomeNow
  clients: Map<string, Client>
  onEdit(appointment: Appointment, focusOutcome?: boolean): void
  /** Variante più ariosa per la pagina Agenda. */
  size?: 'compact' | 'regular'
  className?: string
}

/**
 * Elenco cronologico degli appuntamenti di un giorno: orari a sinistra, barra colorata del tipo,
 * titolo, cliente, luogo, stato e azioni rapide (Chiama, Indicazioni, Registra esito).
 * Se il giorno è oggi mostra la linea "adesso" nel punto giusto.
 */
export function DayTimeline({
  day,
  appointments,
  now,
  clients,
  onEdit,
  size = 'compact',
  className,
}: DayTimelineProps) {
  const isToday = day === now.date
  // la linea "adesso" va prima del primo appuntamento che deve ancora iniziare
  const nowIndex = isToday ? appointments.findIndex((a) => timeToMinutes(a.start) > now.minutes) : -1
  const nowAt = isToday ? (nowIndex === -1 ? appointments.length : nowIndex) : -1

  return (
    <ol className={`ag-tl ag-tl--${size}${className ? ` ${className}` : ''}`}>
      {appointments.map((a, i) => (
        <Fragment key={a.id}>
          {i === nowAt && <NowLine time={now.time} />}
          <TimelineItem
            appointment={a}
            now={now}
            client={a.clientId ? clients.get(a.clientId) : undefined}
            onEdit={onEdit}
          />
        </Fragment>
      ))}
      {nowAt === appointments.length && appointments.length > 0 && <NowLine time={now.time} />}
    </ol>
  )
}

function NowLine({ time }: { time: string }) {
  return (
    <li className="ag-tl-now">
      <span className="ag-tl-now-time num">
        <span className="visually-hidden">Adesso: </span>
        {time}
      </span>
      <span className="ag-tl-now-line" aria-hidden="true" />
    </li>
  )
}

function TimelineItem({
  appointment: a,
  now,
  client,
  onEdit,
}: {
  appointment: Appointment
  now: RomeNow
  client: Client | undefined
  onEdit(appointment: Appointment, focusOutcome?: boolean): void
}) {
  const phase = appointmentPhase(a, now)
  const cancelled = a.status === 'annullato'
  const phone = phoneFor(a, client)
  const tel = phone ? telHref(phone) : undefined
  const video = a.location === 'video' ? videoHref(a.locationDetail) : undefined
  const address = a.location === 'domicilio' ? a.locationDetail?.trim() : undefined
  const recordOutcome = needsOutcome(a, now)
  const active = !cancelled && phase !== 'passato'
  const name = client ? clientFullName(client) : ''
  const typeLabel = APPOINTMENT_TYPE_LABEL[a.type]
  // il tipo si omette se il titolo lo ripete già ("Revisione portafoglio")
  const showType = !a.title.toLowerCase().includes(typeLabel.toLowerCase())

  const cls = ['ag-tl-item', `ag-tl-item--${phase}`, cancelled && 'ag-tl-item--cancelled'].filter(Boolean).join(' ')

  return (
    <li className={cls} style={typeStyle(a)}>
      <div className="ag-tl-time num" aria-hidden="true">
        <span className="ag-tl-start">{a.start}</span>
        <span className="ag-tl-end">{a.end}</span>
      </div>
      <div className="ag-tl-body">
        <div className="ag-tl-top">
          <div className="ag-tl-head">
            <button type="button" className="ag-tl-title" onClick={() => onEdit(a)}>
              <span className="visually-hidden">
                {a.start}–{a.end},{' '}
              </span>
              {a.title}
            </button>
            <StatusPill appointment={a} phase={phase} />
          </div>
          {tel && a.location !== 'telefono' && !cancelled && (
            <a
              className="icon-btn icon-btn-sm ag-tl-quickcall"
              href={tel}
              aria-label={`Chiama ${name || phone}`}
              title={`Chiama ${phone}`}
            >
              <Phone size={16} aria-hidden="true" />
            </a>
          )}
        </div>
        <p className="ag-tl-meta">
          {showType && <span>{typeLabel}</span>}
          {showType && client && (
            <span className="ag-sep" aria-hidden="true">
              ·
            </span>
          )}
          {client && (
            <a className="ag-tl-client" href={buildHref('clienti', { id: client.id })}>
              {name}
            </a>
          )}
        </p>
        <p className="ag-tl-loc" title={a.locationDetail || undefined}>
          <LocationIcon mode={a.location} />
          <span className="truncate">{locationText(a)}</span>
        </p>
        {(recordOutcome || (active && ((a.location === 'telefono' && tel) || address || video))) && (
          <div className="ag-tl-actions">
            {active && a.location === 'telefono' && tel && (
              <a className="btn btn-sm ag-act" href={tel}>
                <Phone size={14} aria-hidden="true" />
                Chiama
                <span className="visually-hidden">{name ? ` ${name}` : ` ${phone}`}</span>
              </a>
            )}
            {active && address && (
              <a className="btn btn-sm ag-act" href={mapsHref(address)} target="_blank" rel="noopener noreferrer">
                <Navigation size={14} aria-hidden="true" />
                Indicazioni
                <span className="visually-hidden"> (si apre in una nuova scheda)</span>
              </a>
            )}
            {active && video && (
              <a className="btn btn-sm ag-act" href={video} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} aria-hidden="true" />
                Collegati
                <span className="visually-hidden"> alla videochiamata (si apre in una nuova scheda)</span>
              </a>
            )}
            {recordOutcome && (
              <button type="button" className="btn btn-sm ag-act ag-act--outcome" onClick={() => onEdit(a, true)}>
                <ClipboardCheck size={14} aria-hidden="true" />
                Registra esito
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
