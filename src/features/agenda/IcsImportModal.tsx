import { CalendarRange, FileUp, Info, TriangleAlert, Upload } from 'lucide-react'
import { useId, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { APPOINTMENT_TYPE_LABEL } from '../../domain/labels'
import type { Appointment } from '../../domain/types'
import { createId } from '../../lib/id'
import { decodeIcsBytes, icsEventsToAppointments, parseIcs, type ImportedAppointment } from '../../lib/ics'
import { formatDayMonth, formatDateShort, formatWeekdayShort, plural } from '../../lib/format'
import { useNow } from '../../store/NowContext'
import { clientNameById, isAllDay } from '../../store/selectors'
import { useActions, useAppData } from '../../store/StoreContext'
import './agenda.css'

interface IcsImportModalProps {
  open: boolean
  onClose(): void
}

interface Parsed {
  fileName: string
  items: ImportedAppointment[]
  warnings: string[]
}

const FORM_ID = 'ag-import-form'
const MAX_BYTES = 10 * 1024 * 1024
const PREVIEW_ROWS = 8
const OWN_UID_SUFFIX = '@advisor-desk'

/**
 * Import di un file .ics esportato da Outlook o Google Calendar: anteprima (numero di eventi, periodo,
 * avvisi, aggiornamenti di eventi già importati) e conferma.
 */
export function IcsImportModal({ open, onClose }: IcsImportModalProps) {
  const { appointments, clients } = useAppData()
  const actions = useActions()
  const toast = useToast()
  const { date: today } = useNow()
  const uid = useId()
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [onlyFuture, setOnlyFuture] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const close = () => {
    setParsed(null)
    setError(null)
    setFileName(null)
    setOnlyFuture(true)
    onClose()
  }

  const readFile = async (file: File | undefined) => {
    setParsed(null)
    setError(null)
    setFileName(file?.name ?? null)
    if (!file) return
    if (!/\.(ics|ical|ifb|icalendar)$/i.test(file.name) && file.type && file.type !== 'text/calendar') {
      setError('Seleziona un file di calendario con estensione .ics.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Il file è troppo grande (massimo 10 MB).')
      return
    }
    setBusy(true)
    try {
      const text = decodeIcsBytes(await file.arrayBuffer())
      if (!/BEGIN:VCALENDAR/i.test(text)) {
        setError('Il file non sembra un calendario .ics valido.')
        return
      }
      const { events, warnings } = parseIcs(text)
      if (events.length === 0) {
        setError(
          warnings.length ? `Nessun evento importabile. ${warnings.join(' ')}` : 'Nessun evento trovato nel file.',
        )
        return
      }
      setParsed({ fileName: file.name, items: icsEventsToAppointments(events, clients), warnings })
    } catch {
      setError('Impossibile leggere il file. Riprova oppure esporta di nuovo il calendario.')
    } finally {
      setBusy(false)
    }
  }

  const onFile = (event: ChangeEvent<HTMLInputElement>) => void readFile(event.target.files?.[0])

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    void readFile(event.dataTransfer.files?.[0])
  }

  // ---------------------------------------------------------------- anteprima (derivata)
  const ownIds = new Set(appointments.map((a) => a.id))
  const knownExternal = new Set(appointments.map((a) => a.externalId).filter(Boolean))
  const all = parsed?.items ?? []
  const candidates = onlyFuture ? all.filter((a) => a.date >= today) : all
  // Eventi esportati da questa stessa agenda e ancora presenti: non vanno duplicati.
  const isOwn = (a: ImportedAppointment) =>
    !!a.externalId?.endsWith(OWN_UID_SUFFIX) && ownIds.has(a.externalId.slice(0, -OWN_UID_SUFFIX.length))
  const seen = new Set<string>()
  const toImport = candidates.filter((a) => {
    if (isOwn(a)) return false
    // stesso evento due volte nel file (es. eventi senza UID identici): uno solo
    if (a.externalId) {
      if (seen.has(a.externalId)) return false
      seen.add(a.externalId)
    }
    return true
  })
  const alreadyHere = candidates.filter(isOwn).length
  const updates = toImport.filter((a) => a.externalId && knownExternal.has(a.externalId)).length
  const fresh = toImport.length - updates
  const skippedPast = all.length - candidates.length
  const first = all[0]?.date
  const last = all[all.length - 1]?.date

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (toImport.length === 0) return
    const list: Appointment[] = toImport.map((a) => ({ ...a, id: createId('a') }))
    actions.importAppointments(list)
    const parts = [
      fresh > 0 && plural(fresh, 'appuntamento importato', 'appuntamenti importati'),
      updates > 0 && plural(updates, 'aggiornato', 'aggiornati'),
    ]
    toast({ message: parts.filter(Boolean).join(' · ') || 'Calendario importato' })
    close()
  }

  return (
    <Modal
      open={open}
      title="Importa calendario (.ics)"
      onClose={close}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={close}>
            Annulla
          </button>
          <button type="submit" form={FORM_ID} className="btn btn-primary" disabled={toImport.length === 0}>
            {toImport.length > 0 ? `Importa ${plural(toImport.length, 'evento', 'eventi')}` : 'Importa'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} className="form ag-imp" onSubmit={submit} noValidate>
        <div className="banner" data-tone="info">
          <Info size={18} aria-hidden="true" />
          <div className="stack ag-imp-help">
            <p>Esporta il calendario dal tuo programma e caricalo qui.</p>
            <ul className="ag-imp-steps">
              <li>
                <strong>In Outlook:</strong> File › Salva calendario (o esporta in .ics)
              </li>
              <li>
                <strong>In Google Calendar:</strong> Impostazioni › Importa ed esporta
              </li>
            </ul>
            <p className="xsmall">
              Gli eventi già importati in precedenza vengono aggiornati, non duplicati. Il file resta sul tuo
              dispositivo.
            </p>
          </div>
        </div>

        <div className="field">
          <span className="field-label" aria-hidden="true">
            File del calendario
          </span>
          <label
            className={`ag-imp-drop${dragging ? ' is-dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              type="file"
              className="visually-hidden"
              accept=".ics,text/calendar"
              onChange={onFile}
              aria-label="File del calendario (.ics)"
              aria-describedby={[`${uid}-name`, error ? `${uid}-err` : ''].filter(Boolean).join(' ')}
              aria-invalid={error ? true : undefined}
            />
            <span className="btn btn-sm ag-imp-pick" aria-hidden="true">
              <Upload size={16} />
              Scegli file…
            </span>
            <span id={`${uid}-name`} className="ag-imp-filename">
              {fileName ?? 'Nessun file selezionato · oppure trascinalo qui'}
            </span>
          </label>
        </div>

        {busy && (
          <p className="small muted" role="status">
            Lettura del file in corso…
          </p>
        )}
        {error && (
          <p id={`${uid}-err`} className="ag-error ag-imp-error" role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            {error}
          </p>
        )}

        {parsed && (
          <section className="ag-imp-preview" aria-label="Anteprima dell'import">
            <div className="ag-imp-summary">
              <span className="ag-imp-icon" aria-hidden="true">
                <FileUp size={20} />
              </span>
              <div className="grow">
                <p className="strong">
                  {plural(all.length, 'evento', 'eventi')} in <span className="ag-imp-name">{parsed.fileName}</span>
                </p>
                {first && last && (
                  <p className="small muted num">
                    <CalendarRange size={14} aria-hidden="true" className="ag-inline-icon" />
                    {first === last
                      ? `il ${formatDateShort(first)}`
                      : `dal ${formatDateShort(first)} al ${formatDateShort(last)}`}
                  </p>
                )}
              </div>
            </div>

            <label className="ag-imp-check">
              <input
                type="checkbox"
                className="checkbox"
                checked={onlyFuture}
                onChange={(e) => setOnlyFuture(e.target.checked)}
              />
              <span>
                Solo eventi da oggi in poi
                {onlyFuture && skippedPast > 0 && (
                  <span className="muted">
                    {' '}
                    ({plural(skippedPast, 'evento passato escluso', 'eventi passati esclusi')})
                  </span>
                )}
              </span>
            </label>

            <ul className="ag-imp-counts" aria-label="Riepilogo">
              <li>
                <strong className="num">{fresh}</strong> {fresh === 1 ? 'nuovo' : 'nuovi'}
              </li>
              <li>
                <strong className="num">{updates}</strong>{' '}
                {updates === 1
                  ? 'aggiornerà un appuntamento già importato'
                  : 'aggiorneranno appuntamenti già importati'}
              </li>
              {alreadyHere > 0 && (
                <li>
                  <strong className="num">{alreadyHere}</strong> già presenti in agenda (esportati da qui): saltati
                </li>
              )}
            </ul>

            {parsed.warnings.length > 0 && (
              <div className="banner ag-imp-warnings">
                <TriangleAlert size={18} aria-hidden="true" />
                <ul>
                  {parsed.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {toImport.length > 0 && (
              <>
                <h3 className="ag-imp-subtitle">Anteprima</h3>
                <ul className="ag-imp-list">
                  {toImport.slice(0, PREVIEW_ROWS).map((a, i) => {
                    const who = clientNameById(clients, a.clientId)
                    return (
                      <li key={`${a.externalId}-${i}`} className="ag-imp-row">
                        <span className="ag-imp-when num">
                          {formatWeekdayShort(a.date)} {formatDayMonth(a.date)} ·{' '}
                          {isAllDay(a) ? 'tutto il giorno' : `${a.start}–${a.end}`}
                        </span>
                        <span className="ag-imp-title">{a.title}</span>
                        <span className="ag-imp-meta small muted">
                          {APPOINTMENT_TYPE_LABEL[a.type]}
                          {who && ` · ${who}`}
                          {a.externalId && knownExternal.has(a.externalId) && ' · aggiornamento'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                {toImport.length > PREVIEW_ROWS && (
                  <p className="small muted">… e altri {toImport.length - PREVIEW_ROWS}.</p>
                )}
              </>
            )}
            {toImport.length === 0 && <p className="small muted">Nessun evento da importare con le opzioni scelte.</p>}
          </section>
        )}
      </form>
    </Modal>
  )
}
