import { Download, ShieldAlert } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import type { Appointment, DateKey } from '../../domain/types'
import { addDays } from '../../lib/dates'
import { formatDateShort, plural } from '../../lib/format'
import { appointmentsToIcs } from '../../lib/ics'
import { useNow } from '../../store/NowContext'
import { compareAppointments } from '../../store/selectors'
import { useAppData } from '../../store/StoreContext'
import './agenda.css'

interface IcsExportModalProps {
  open: boolean
  onClose(): void
}

const FORM_ID = 'ag-export-form'
/** Si esportano anche gli appuntamenti dell'ultimo mese (utile per chi sincronizza a mano). */
const PAST_DAYS = 30

/**
 * Export dell'agenda in un file .ics da importare in Outlook, Google Calendar o Apple Calendario.
 * Il file può finire su servizi cloud: si sceglie cosa includere (nomi dei clienti, luoghi, note).
 */
export function IcsExportModal({ open, onClose }: IcsExportModalProps) {
  const { appointments } = useAppData()
  const { date: today } = useNow()
  const since = addDays(today, -PAST_DAYS)
  const list = open
    ? appointments.filter((a) => a.status !== 'annullato' && a.date >= since).sort(compareAppointments)
    : []

  return (
    <Modal
      open={open}
      title="Esporta calendario (.ics)"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" form={FORM_ID} className="btn btn-primary" disabled={list.length === 0}>
            <Download size={16} aria-hidden="true" />
            Esporta
          </button>
        </>
      }
    >
      {/* montato solo da aperto: a ogni apertura le scelte tornano a quelle predefinite (note escluse) */}
      {open && <ExportForm list={list} since={since} onDone={onClose} />}
    </Modal>
  )
}

function ExportForm({ list, since, onDone }: { list: Appointment[]; since: DateKey; onDone(): void }) {
  const { clients, settings } = useAppData()
  const toast = useToast()
  const { date: today } = useNow()
  const uid = useId()
  const [includeClientNames, setIncludeClientNames] = useState(true)
  const [includeLocationDetails, setIncludeLocationDetails] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(false)
  const firstRef = useRef<HTMLInputElement>(null)

  // Il <dialog> mette il focus su "Chiudi": lo spostiamo sulla prima scelta subito dopo.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => firstRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (list.length === 0) return
    const ics = appointmentsToIcs(list, clients, {
      calendarName: `Agenda ${settings.brandName || ''}`.trim(),
      includeClientNames,
      includeLocationDetails,
      includeNotes,
    })
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `agenda-${today}.ics`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    toast({ message: `Esportati ${plural(list.length, 'appuntamento', 'appuntamenti')} dal ${formatDateShort(since)}` })
    onDone()
  }

  return (
    <form id={FORM_ID} className="form ag-exp" onSubmit={submit} noValidate>
      <p className="small">
        {list.length > 0 ? (
          <>
            Il file conterrà <strong className="num">{plural(list.length, 'appuntamento', 'appuntamenti')}</strong>{' '}
            dal <span className="num">{formatDateShort(since)}</span> in poi (esclusi gli annullati), da importare
            in Outlook, Google Calendar o Apple Calendario.
          </>
        ) : (
          <>Nessun appuntamento da esportare dal {formatDateShort(since)} in poi.</>
        )}
      </p>

      <div className="banner" id={`${uid}-privacy`}>
        <ShieldAlert size={18} aria-hidden="true" />
        <p>
          Il file può finire su servizi cloud (Outlook, Google): includi solo ciò che serve. Dalle schede clienti si
          esporta al massimo il nome, mai telefono, email o indirizzo.
        </p>
      </div>

      <fieldset className="ag-exp-options" aria-describedby={`${uid}-privacy`}>
        <legend className="field-label">Cosa includere</legend>
        <ExportOption
          inputRef={firstRef}
          id={`${uid}-names`}
          checked={includeClientNames}
          onChange={setIncludeClientNames}
          label="Includi i nomi dei clienti"
          hint="Aggiunti al titolo: «Revisione portafoglio – Mario Rossi». Un nome scritto nel titolo resta comunque."
        />
        <ExportOption
          id={`${uid}-places`}
          checked={includeLocationDetails}
          onChange={setIncludeLocationDetails}
          label="Includi indirizzi, numeri e link del luogo"
          hint="Come scritti nell'appuntamento; senza, resta solo «Dal cliente», «Telefono», «Videochiamata»…"
        />
        <ExportOption
          id={`${uid}-notes`}
          checked={includeNotes}
          onChange={setIncludeNotes}
          label="Includi le note"
          hint="Possono contenere dati personali o patrimoniali dei clienti."
        />
      </fieldset>
    </form>
  )
}

function ExportOption({
  inputRef,
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  inputRef?: Ref<HTMLInputElement>
  id: string
  checked: boolean
  onChange(value: boolean): void
  label: string
  hint: ReactNode
}) {
  return (
    <div className="ag-exp-option">
      <input
        ref={inputRef}
        id={id}
        type="checkbox"
        className="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={`${id}-hint`}
      />
      <div>
        <label htmlFor={id} className="ag-exp-label">
          {label}
        </label>
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      </div>
    </div>
  )
}
