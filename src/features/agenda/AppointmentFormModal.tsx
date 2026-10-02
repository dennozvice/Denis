import { Trash2 } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Segmented } from '../../components/ui/Segmented'
import { useToast } from '../../components/ui/Toast'
import {
  APPOINTMENT_OUTCOME_LABEL,
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_TYPE_LABEL,
  LOCATION_LABEL,
} from '../../domain/labels'
import type {
  Appointment,
  AppointmentOutcome,
  AppointmentStatus,
  AppointmentType,
  Client,
  LocationMode,
} from '../../domain/types'
import { isDateKey, isTimeKey, timeToMinutes } from '../../lib/dates'
import { useNow } from '../../store/NowContext'
import { useActions, useAppData, type NewAppointment, type NewTask } from '../../store/StoreContext'
import { TaskFormModal } from '../tasks/TaskFormModal'
import { DEFAULT_DURATION, defaultStartFor, endAfter, formatDuration, nextWorkday } from './agendaUtils'
import './agenda.css'

export interface AppointmentFormModalProps {
  open: boolean
  onClose(): void
  /** Se presente: modifica di un appuntamento esistente. */
  appointment?: Appointment
  /** Valori iniziali per un nuovo appuntamento (es. date, start, clientId, type). */
  defaults?: Partial<NewAppointment>
  /** Facoltativo: all'apertura porta il focus sul campo "Esito" (pulsante "Registra esito"). */
  focusOutcome?: boolean
}

const FORM_ID = 'ag-appointment-form'

const TYPE_OPTIONS = Object.entries(APPOINTMENT_TYPE_LABEL) as [AppointmentType, string][]
const STATUS_OPTIONS: { value: AppointmentStatus; label: string }[] = [
  { value: 'pianificato', label: `${APPOINTMENT_STATUS_LABEL.pianificato} (da confermare)` },
  { value: 'confermato', label: APPOINTMENT_STATUS_LABEL.confermato },
  { value: 'svolto', label: APPOINTMENT_STATUS_LABEL.svolto },
  { value: 'annullato', label: APPOINTMENT_STATUS_LABEL.annullato },
]
const OUTCOME_OPTIONS = Object.entries(APPOINTMENT_OUTCOME_LABEL) as [AppointmentOutcome, string][]
const LOCATION_OPTIONS: { value: LocationMode; label: string; title: string }[] = [
  { value: 'ufficio', label: 'Ufficio', title: LOCATION_LABEL.ufficio },
  { value: 'domicilio', label: 'Dal cliente', title: LOCATION_LABEL.domicilio },
  { value: 'video', label: 'Video', title: LOCATION_LABEL.video },
  { value: 'telefono', label: 'Telefono', title: LOCATION_LABEL.telefono },
]

/** Form crea/modifica appuntamento, con eliminazione (annullabile) e proposta di follow-up. */
export function AppointmentFormModal({
  open,
  onClose,
  appointment,
  defaults,
  focusOutcome,
}: AppointmentFormModalProps) {
  const actions = useActions()
  const toast = useToast()
  // Attività di follow-up proposta dopo un esito "Da ricontattare".
  const [followUp, setFollowUp] = useState<Partial<NewTask> | null>(null)

  const remove = () => {
    if (!appointment) return
    actions.deleteAppointment(appointment.id)
    toast({
      message: 'Appuntamento eliminato',
      actionLabel: 'Annulla',
      onAction: () => actions.restoreAppointment(appointment),
    })
    onClose()
  }

  return (
    <>
      <Modal
        open={open}
        title={appointment ? 'Modifica appuntamento' : 'Nuovo appuntamento'}
        onClose={onClose}
        footer={
          <>
            {appointment && (
              <button type="button" className="btn btn-danger ag-form-delete" onClick={remove}>
                <Trash2 size={16} aria-hidden="true" />
                Elimina
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Annulla
            </button>
            <button type="submit" form={FORM_ID} className="btn btn-primary">
              {appointment ? 'Salva' : 'Crea appuntamento'}
            </button>
          </>
        }
      >
        {open && (
          <AppointmentForm
            key={appointment?.id ?? 'new'}
            appointment={appointment}
            defaults={defaults}
            focusOutcome={focusOutcome}
            onDone={onClose}
            onFollowUp={setFollowUp}
          />
        )}
      </Modal>
      <TaskFormModal open={followUp !== null} onClose={() => setFollowUp(null)} defaults={followUp ?? undefined} />
    </>
  )
}

interface FormState {
  title: string
  type: AppointmentType
  date: string
  start: string
  end: string
  location: LocationMode
  locationDetail: string
  clientId: string
  status: AppointmentStatus
  outcome: AppointmentOutcome | ''
  notes: string
}

type Errors = Partial<Record<'title' | 'date' | 'start' | 'end', string>>

const byLastName = (a: Client, b: Client) =>
  a.lastName.localeCompare(b.lastName, 'it') || a.firstName.localeCompare(b.firstName, 'it')

const DETAIL_FIELD: Record<LocationMode, { label: string; placeholder: string; type: 'text' | 'url' | 'tel' }> = {
  ufficio: { label: 'Dettaglio luogo', placeholder: 'Es. Sala riunioni, sede di via Roma', type: 'text' },
  domicilio: { label: 'Indirizzo', placeholder: 'Es. Via Roma 1, Milano', type: 'text' },
  video: { label: 'Link della videochiamata', placeholder: 'Es. https://teams.microsoft.com/…', type: 'text' },
  telefono: { label: 'Numero di telefono', placeholder: 'Es. +39 333 123 4567', type: 'tel' },
}

function AppointmentForm({
  appointment,
  defaults,
  focusOutcome,
  onDone,
  onFollowUp,
}: {
  appointment?: Appointment
  defaults?: Partial<NewAppointment>
  focusOutcome?: boolean
  onDone(): void
  onFollowUp(task: Partial<NewTask>): void
}) {
  const { clients } = useAppData()
  const actions = useActions()
  const toast = useToast()
  const now = useNow()
  const today = now.date
  const uid = useId()
  const titleRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const startRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLInputElement>(null)
  const outcomeRef = useRef<HTMLSelectElement>(null)

  const [form, setForm] = useState<FormState>(() => {
    const src: Partial<NewAppointment> = appointment ?? defaults ?? {}
    const date = src.date && isDateKey(src.date) ? src.date : today
    const start = src.start && isTimeKey(src.start) ? src.start : defaultStartFor(date, now)
    const end = src.end && isTimeKey(src.end) && src.end > start ? src.end : endAfter(start)
    return {
      title: src.title ?? '',
      type: src.type ?? (src.clientId ? 'revisione_portafoglio' : 'altro'),
      date,
      start,
      end,
      location: src.location ?? 'ufficio',
      locationDetail: src.locationDetail ?? '',
      clientId: src.clientId ?? '',
      status: src.status ?? 'confermato',
      outcome: src.outcome ?? '',
      notes: src.notes ?? '',
    }
  })
  const [errors, setErrors] = useState<Errors>({})

  const sortedClients = useMemo(() => [...clients].sort(byLastName), [clients])
  const client = clients.find((c) => c.id === form.clientId)
  const clientExists = form.clientId === '' || client !== undefined
  // L'esito ha senso solo per appuntamenti di oggi o passati.
  const outcomeAvailable = isDateKey(form.date) && form.date <= today
  const durationMin =
    isTimeKey(form.start) && isTimeKey(form.end) ? timeToMinutes(form.end) - timeToMinutes(form.start) : undefined

  const showDuration = !errors.end && durationMin !== undefined && durationMin > 0

  // Il <dialog> mette il focus sul primo elemento: lo spostiamo sul titolo (o sull'esito) subito dopo.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const target = focusOutcome && outcomeRef.current ? outcomeRef.current : titleRef.current
      target?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusOutcome])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  /** Cambiando l'inizio si mantiene la durata. */
  const changeStart = (start: string) => {
    setForm((f) => {
      if (!isTimeKey(start)) return { ...f, start }
      const previous = isTimeKey(f.start) && isTimeKey(f.end) ? timeToMinutes(f.end) - timeToMinutes(f.start) : 0
      return { ...f, start, end: endAfter(start, previous > 0 ? previous : DEFAULT_DURATION) }
    })
    setErrors((e) => ({ ...e, start: undefined, end: undefined }))
  }

  /** Cambiando tipo, il titolo vuoto (o ancora uguale al tipo precedente) segue il nuovo tipo. */
  const changeType = (type: AppointmentType) => {
    setForm((f) => {
      const autoTitle = f.title.trim() === '' || f.title === APPOINTMENT_TYPE_LABEL[f.type]
      return { ...f, type, title: autoTitle ? APPOINTMENT_TYPE_LABEL[type] : f.title }
    })
    setErrors((e) => ({ ...e, title: undefined }))
  }

  /** Registrare un esito implica che l'incontro si è svolto. */
  const changeOutcome = (outcome: AppointmentOutcome | '') => {
    setForm((f) => ({
      ...f,
      outcome,
      status: outcome && (f.status === 'pianificato' || f.status === 'confermato') ? 'svolto' : f.status,
    }))
  }

  const validate = (f: FormState): Errors => {
    const e: Errors = {}
    if (!f.title.trim()) e.title = 'Inserisci un titolo.'
    else if (f.title.trim().length > 200) e.title = 'Il titolo può avere al massimo 200 caratteri.'
    if (!f.date) e.date = 'Inserisci la data.'
    else if (!isDateKey(f.date)) e.date = 'Data non valida.'
    if (!isTimeKey(f.start)) e.start = 'Orario di inizio non valido (hh:mm).'
    if (!isTimeKey(f.end)) e.end = 'Orario di fine non valido (hh:mm).'
    else if (isTimeKey(f.start) && timeToMinutes(f.end) <= timeToMinutes(f.start)) {
      e.end = "L'orario di fine deve essere successivo all'inizio."
    }
    return e
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const found = validate(form)
    setErrors(found)
    const invalid = found.title ? titleRef : found.date ? dateRef : found.start ? startRef : found.end ? endRef : null
    if (invalid) {
      invalid.current?.focus()
      return
    }

    const clientId = form.clientId && clientExists ? form.clientId : undefined
    const outcome = outcomeAvailable && form.outcome ? form.outcome : undefined
    const title = form.title.trim()
    const data = {
      title,
      type: form.type,
      date: form.date,
      start: form.start,
      end: form.end,
      location: form.location,
      locationDetail: form.locationDetail.trim() || undefined,
      clientId,
      status: form.status,
      outcome,
      notes: form.notes.trim() || undefined,
    }

    if (appointment) actions.updateAppointment(appointment.id, data)
    else actions.addAppointment({ ...data, source: 'manuale' })

    // Un esito registrato aggiorna l'ultimo contatto del cliente.
    if (client && clientId && outcome && (!client.lastContact || form.date > client.lastContact)) {
      actions.updateClient(clientId, { lastContact: form.date })
    }

    const saved = appointment ? 'Appuntamento aggiornato' : 'Appuntamento creato'
    if (outcome === 'da_ricontattare' && appointment?.outcome !== 'da_ricontattare') {
      const followUp: Partial<NewTask> = {
        title: `Ricontattare dopo: ${title}`,
        category: 'ricontatto',
        priority: 'media',
        clientId,
        dueDate: nextWorkday(today),
      }
      toast({
        message: `${saved}. Vuoi creare un'attività di follow-up?`,
        actionLabel: 'Crea attività',
        onAction: () => onFollowUp(followUp),
        duration: 10000,
      })
    } else {
      toast({ message: saved })
    }
    onDone()
  }

  const errId = (key: keyof Errors) => (errors[key] ? `${uid}-${key}-err` : undefined)
  const error = (key: keyof Errors) =>
    errors[key] && (
      <span id={errId(key)} className="ag-error" role="alert">
        {errors[key]}
      </span>
    )
  const detail = DETAIL_FIELD[form.location]
  const detailHint =
    form.location === 'telefono' && client?.phone && !form.locationDetail.trim()
      ? `Se vuoto si usa il numero del cliente: ${client.phone}`
      : undefined

  return (
    <form id={FORM_ID} className="form ag-form" onSubmit={submit} noValidate>
      <div className="form-grid">
        <label className="field span-2">
          <span>
            Titolo{' '}
            <span className="ag-required" aria-hidden="true">
              *
            </span>
          </span>
          <input
            ref={titleRef}
            className="input"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Es. Revisione portafoglio"
            required
            maxLength={200}
            autoComplete="off"
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errId('title')}
          />
          {error('title')}
        </label>

        <label className="field">
          <span>Tipo</span>
          <select className="select" value={form.type} onChange={(e) => changeType(e.target.value as AppointmentType)}>
            {TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Cliente</span>
          <select
            className="select"
            value={clientExists ? form.clientId : ''}
            onChange={(e) => set('clientId', e.target.value)}
          >
            <option value="">Nessun cliente</option>
            {sortedClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.lastName} {c.firstName}
              </option>
            ))}
          </select>
        </label>

        <div className="span-2 ag-form-when">
          <label className="field ag-form-date">
            <span>
              Data{' '}
              <span className="ag-required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              ref={dateRef}
              type="date"
              className="input"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
              required
              aria-invalid={errors.date ? true : undefined}
              aria-describedby={errId('date')}
            />
            {error('date')}
          </label>

          <label className="field">
            <span>Inizio</span>
            <input
              ref={startRef}
              type="time"
              className="input"
              value={form.start}
              onChange={(e) => changeStart(e.target.value)}
              required
              step={300}
              aria-invalid={errors.start ? true : undefined}
              aria-describedby={errId('start')}
            />
            {error('start')}
          </label>
          <label className="field">
            <span>Fine</span>
            <input
              ref={endRef}
              type="time"
              className="input"
              value={form.end}
              onChange={(e) => set('end', e.target.value)}
              required
              step={300}
              aria-invalid={errors.end ? true : undefined}
              aria-describedby={errId('end') ?? (showDuration ? `${uid}-duration` : undefined)}
            />
            {error('end')}
            {showDuration && (
              <span id={`${uid}-duration`} className="field-hint">
                Durata: {formatDuration(durationMin)}
              </span>
            )}
          </label>
        </div>

        <div className="field span-2 ag-form-location">
          <span className="field-label" aria-hidden="true">
            Luogo
          </span>
          <Segmented
            options={LOCATION_OPTIONS}
            value={form.location}
            onChange={(v) => set('location', v)}
            ariaLabel="Luogo"
          />
        </div>

        <label className="field span-2">
          <span>{detail.label}</span>
          <input
            className="input"
            type={detail.type}
            inputMode={form.location === 'video' ? 'url' : undefined}
            value={form.locationDetail}
            onChange={(e) => set('locationDetail', e.target.value)}
            placeholder={detail.placeholder}
            autoComplete="off"
            maxLength={300}
            aria-describedby={detailHint ? `${uid}-detail-hint` : undefined}
          />
          {detailHint && (
            <span id={`${uid}-detail-hint`} className="field-hint">
              {detailHint}
            </span>
          )}
        </label>

        <label className="field">
          <span>Stato</span>
          <select
            className="select"
            value={form.status}
            onChange={(e) => set('status', e.target.value as AppointmentStatus)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {outcomeAvailable ? (
          <label className="field">
            <span>Esito</span>
            <select
              ref={outcomeRef}
              className="select"
              value={form.outcome}
              onChange={(e) => changeOutcome(e.target.value as AppointmentOutcome | '')}
            >
              <option value="">— Non registrato</option>
              {OUTCOME_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="field">
            <span className="field-label">Esito</span>
            <p className="field-hint ag-form-outcome-hint">Si potrà registrare dal giorno dell'appuntamento.</p>
          </div>
        )}

        <label className="field span-2">
          <span>Note</span>
          <textarea
            className="textarea"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Documenti da portare, argomenti da trattare…"
            maxLength={4000}
          />
        </label>
      </div>
      {appointment?.source === 'ics' && (
        <p className="field-hint">
          Importato da un calendario esterno (.ics): un nuovo import dello stesso file aggiornerà titolo, data, orari e
          luogo; cliente ed esito registrati qui vengono mantenuti.
        </p>
      )}
    </form>
  )
}
