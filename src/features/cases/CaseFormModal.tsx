import { Trash2 } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { CASE_STATUS_LABEL, CASE_TYPE_LABEL } from '../../domain/labels'
import type { Case, CaseStatus, CaseType } from '../../domain/types'
import { isDateKey } from '../../lib/dates'
import { useNow } from '../../store/NowContext'
import { useActions, useAppData, type NewCase } from '../../store/StoreContext'
import { clientFullName } from '../../store/selectors'
import { CASE_STATUSES } from './CaseBits'
import {
  caseDueHint,
  formatAmountInput,
  parseAmount,
  sortClientsByLastName,
  suggestCaseDueDate,
  suggestCaseTitle,
} from './caseUtils'
import './cases.css'

export interface CaseFormModalProps {
  open: boolean
  onClose(): void
  caseItem?: Case
  defaults?: Partial<NewCase>
}

const FORM_ID = 'cs-case-form'
const CASE_TYPES = Object.keys(CASE_TYPE_LABEL) as CaseType[]

/** Form crea/modifica pratica in una finestra modale. */
export function CaseFormModal({ open, onClose, caseItem, defaults }: CaseFormModalProps) {
  const actions = useActions()
  const toast = useToast()

  const remove = () => {
    if (!caseItem) return
    actions.deleteCase(caseItem.id)
    toast({ message: 'Pratica eliminata', actionLabel: 'Annulla', onAction: () => actions.restoreCase(caseItem) })
    onClose()
  }

  return (
    <Modal
      open={open}
      title={caseItem ? 'Modifica pratica' : 'Nuova pratica'}
      onClose={onClose}
      footer={
        <>
          {caseItem && (
            <button type="button" className="btn btn-danger cs-modal-delete" onClick={remove}>
              <Trash2 size={16} aria-hidden="true" />
              Elimina
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" form={FORM_ID} className="btn btn-primary">
            {caseItem ? 'Salva' : 'Crea pratica'}
          </button>
        </>
      }
    >
      {open && <CaseForm key={caseItem?.id ?? 'new'} caseItem={caseItem} defaults={defaults} onDone={onClose} />}
    </Modal>
  )
}

interface FormState {
  type: CaseType
  clientId: string
  title: string
  /** true finché l'utente non scrive un titolo: si usa quello proposto da tipo + cliente. */
  titleAuto: boolean
  openedOn: string
  dueDate: string
  /**
   * true finché l'utente non tocca la scadenza: si propone il termine di riferimento del tipo
   * (reclamo 45 giorni; riscatto, liquidazione, sinistro 30 giorni solo per le nuove pratiche).
   */
  dueAuto: boolean
  status: CaseStatus
  amount: string
  notes: string
}

type Errors = Partial<Record<'title' | 'openedOn' | 'dueDate' | 'amount', string>>

function CaseForm({ caseItem, defaults, onDone }: { caseItem?: Case; defaults?: Partial<NewCase>; onDone(): void }) {
  const { clients } = useAppData()
  const actions = useActions()
  const toast = useToast()
  const { date: today } = useNow()
  const uid = useId()
  const typeRef = useRef<HTMLSelectElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const openedRef = useRef<HTMLInputElement>(null)
  const dueRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>(() => {
    const src: Partial<NewCase> = caseItem ?? defaults ?? {}
    return {
      type: src.type ?? 'riscatto',
      clientId: src.clientId ?? '',
      title: src.title ?? '',
      titleAuto: !src.title,
      openedOn: src.openedOn ?? today,
      dueDate: src.dueDate ?? '',
      dueAuto: !src.dueDate,
      status: src.status ?? 'aperta',
      amount: formatAmountInput(src.amount),
      notes: src.notes ?? '',
    }
  })
  const [errors, setErrors] = useState<Errors>({})

  const sortedClients = useMemo(() => sortClientsByLastName(clients), [clients])
  const client = form.clientId ? clients.find((c) => c.id === form.clientId) : undefined
  // Un cliente eliminato nel frattempo diventa "Nessun cliente".
  const clientId = client ? client.id : ''

  const suggestedTitle = suggestCaseTitle(form.type, client ? clientFullName(client) : '')
  const title = form.titleAuto ? suggestedTitle : form.title
  const isReclamo = form.type === 'reclamo'
  const autoDue = suggestCaseDueDate(form.type, form.openedOn, !caseItem)
  const dueDate = form.dueAuto ? autoDue : form.dueDate
  const dueHint = caseDueHint(form.type)

  // All'apertura il <dialog> mette il focus sul primo elemento (la X): lo spostiamo sul primo campo.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => typeRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const set = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }))
    const touched = Object.keys(patch).filter((k) => k in errors)
    if (touched.length > 0) setErrors((e) => ({ ...e, ...Object.fromEntries(touched.map((k) => [k, undefined])) }))
  }

  const validate = (): Errors => {
    const e: Errors = {}
    if (!title.trim()) e.title = 'Inserisci un titolo.'
    else if (title.trim().length > 200) e.title = 'Il titolo può avere al massimo 200 caratteri.'
    if (!form.openedOn) e.openedOn = 'Inserisci la data di apertura.'
    else if (!isDateKey(form.openedOn)) e.openedOn = 'Data non valida.'
    if (dueDate && !isDateKey(dueDate)) e.dueDate = 'Data non valida.'
    else if (dueDate && isDateKey(form.openedOn) && dueDate < form.openedOn)
      e.dueDate = 'La scadenza non può precedere la data di apertura.'
    if (parseAmount(form.amount) === null) e.amount = 'Importo non valido (es. 15.000 oppure 1.250,50).'
    return e
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    const invalid = found.title ? titleRef : found.openedOn ? openedRef : found.dueDate ? dueRef : found.amount ? amountRef : null
    if (invalid) {
      invalid.current?.focus()
      return
    }

    const payload: NewCase = {
      type: form.type,
      clientId: clientId || undefined,
      title: title.trim(),
      openedOn: form.openedOn,
      dueDate: dueDate || undefined,
      status: form.status,
      amount: parseAmount(form.amount) ?? undefined,
      notes: form.notes.trim() || undefined,
    }

    if (caseItem) {
      actions.updateCase(caseItem.id, payload)
      toast({ message: 'Pratica aggiornata' })
    } else {
      actions.addCase(payload)
      toast({ message: 'Pratica creata' })
    }
    onDone()
  }

  const fid = (key: string) => `${uid}-${key}`

  return (
    <form id={FORM_ID} className="form cs-form" onSubmit={submit} noValidate>
      <div className="form-grid">
        <Field id={fid('type')} label="Tipo">
          <select
            id={fid('type')}
            ref={typeRef}
            className="select"
            value={form.type}
            onChange={(e) => set({ type: e.target.value as CaseType })}
          >
            {CASE_TYPES.map((t) => (
              <option key={t} value={t}>
                {CASE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field id={fid('client')} label="Cliente">
          <select id={fid('client')} className="select" value={clientId} onChange={(e) => set({ clientId: e.target.value })}>
            <option value="">Nessun cliente</option>
            {sortedClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.lastName} {c.firstName}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id={fid('title')}
          label="Titolo"
          required
          className="span-2"
          hint={form.titleAuto ? 'Proposto in base a tipo e cliente: puoi modificarlo.' : undefined}
          error={errors.title}
        >
          <input
            id={fid('title')}
            ref={titleRef}
            className="input"
            value={title}
            onChange={(e) => set({ title: e.target.value, titleAuto: false })}
            onBlur={(e) => {
              if (!e.target.value.trim()) set({ title: '', titleAuto: true })
            }}
            placeholder={suggestedTitle}
            required
            maxLength={200}
            autoComplete="off"
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={describedBy(fid('title'), form.titleAuto, errors.title)}
          />
        </Field>

        <Field id={fid('opened')} label="Data apertura" required error={errors.openedOn}>
          <input
            id={fid('opened')}
            ref={openedRef}
            type="date"
            className="input"
            value={form.openedOn}
            onChange={(e) => set({ openedOn: e.target.value })}
            required
            aria-invalid={errors.openedOn ? true : undefined}
            aria-describedby={describedBy(fid('opened'), false, errors.openedOn)}
          />
        </Field>

        <Field
          id={fid('due')}
          label="Scadenza (facoltativa)"
          hint={dueHint}
          error={errors.dueDate}
        >
          <input
            id={fid('due')}
            ref={dueRef}
            type="date"
            className="input"
            value={dueDate}
            min={isDateKey(form.openedOn) ? form.openedOn : undefined}
            onChange={(e) => set({ dueDate: e.target.value, dueAuto: false })}
            onBlur={(e) => {
              // il termine del reclamo vale comunque: svuotando il campo torna quello calcolato
              if (!e.target.value && isReclamo) set({ dueDate: '', dueAuto: true })
            }}
            aria-invalid={errors.dueDate ? true : undefined}
            aria-describedby={describedBy(fid('due'), dueHint !== undefined, errors.dueDate)}
          />
        </Field>

        <Field id={fid('status')} label="Stato">
          <select
            id={fid('status')}
            className="select"
            value={form.status}
            onChange={(e) => set({ status: e.target.value as CaseStatus })}
          >
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CASE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>

        <Field id={fid('amount')} label="Importo € (facoltativo)" error={errors.amount}>
          <input
            id={fid('amount')}
            ref={amountRef}
            className="input num"
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => set({ amount: e.target.value })}
            placeholder="Es. 15.000"
            autoComplete="off"
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={describedBy(fid('amount'), false, errors.amount)}
          />
        </Field>

        <Field id={fid('notes')} label="Note" className="span-2">
          <textarea
            id={fid('notes')}
            className="textarea"
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            rows={3}
            placeholder="Documenti mancanti, numero di protocollo, riferimenti della sede…"
          />
        </Field>
      </div>
      <p className="field-hint">
        <span aria-hidden="true">*</span> Campi obbligatori
      </p>
    </form>
  )
}

/** id del suggerimento e dell'errore collegati al campo (per aria-describedby). */
function describedBy(id: string, hasHint: boolean, error: string | undefined): string | undefined {
  return [hasHint && !error ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(' ') || undefined
}

/** Campo con etichetta, suggerimento ed errore fuori dal <label> (il nome accessibile resta solo l'etichetta). */
function Field({
  id,
  label,
  required = false,
  hint,
  error,
  className,
  children,
}: {
  id: string
  label: string
  required?: boolean
  hint?: string
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && (
          <span className="cs-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <span id={`${id}-hint`} className="field-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-err`} className="cs-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
