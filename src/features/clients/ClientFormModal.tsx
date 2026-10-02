import { Plus, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { CLIENT_SEGMENT_LABEL, POLICY_KIND_LABEL } from '../../domain/labels'
import type { Client, ClientSegment, Policy, PolicyKind } from '../../domain/types'
import { isDateKey } from '../../lib/dates'
import { formatDateShort } from '../../lib/format'
import { createId } from '../../lib/id'
import { navigate } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useActions, useAppData, type NewClient } from '../../store/StoreContext'
import { clientFullName } from '../../store/selectors'
import {
  iddDueDate,
  isFourDigits,
  isPlausiblePhone,
  isValidEmail,
  maskPolicyRef,
  parseTags,
  policyRefDigits,
  sensitiveDataHint,
} from './clientUtils'
import './clients.css'

export interface ClientFormModalProps {
  open: boolean
  onClose(): void
  /** Se presente: modifica di un cliente esistente. */
  client?: Client
  /** Chiamata dopo il salvataggio con il cliente creato/aggiornato. */
  onSaved?(client: Client): void
  /** Facoltativo: chiamata dopo l'eliminazione del cliente (es. per chiudere la scheda). */
  onDeleted?(client: Client): void
}

const FORM_ID = 'cl-client-form'

const SEGMENT_OPTIONS = Object.entries(CLIENT_SEGMENT_LABEL) as [ClientSegment, string][]
const POLICY_KIND_OPTIONS = Object.entries(POLICY_KIND_LABEL) as [PolicyKind, string][]

/** Form crea/modifica cliente: anagrafica, contatti, adempimenti, polizze, etichette e note. */
export function ClientFormModal({ open, onClose, client, onSaved, onDeleted }: ClientFormModalProps) {
  const actions = useActions()
  const toast = useToast()

  const remove = () => {
    if (!client) return
    const name = clientFullName(client) || 'questo cliente'
    const ok = window.confirm(
      `Eliminare ${name}?\n\nLe attività, gli appuntamenti e le pratiche collegati non verranno cancellati ma resteranno senza cliente. L'operazione non si può annullare.`,
    )
    if (!ok) return
    actions.deleteClient(client.id)
    toast({ message: `Cliente eliminato: ${name}` })
    onClose()
    onDeleted?.(client)
  }

  return (
    <Modal
      open={open}
      title={client ? 'Modifica cliente' : 'Nuovo cliente'}
      onClose={onClose}
      wide
      footer={
        <>
          {client && (
            <button type="button" className="btn btn-danger cl-form-delete" onClick={remove}>
              <Trash2 size={16} aria-hidden="true" />
              Elimina
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" form={FORM_ID} className="btn btn-primary">
            {client ? 'Salva' : 'Aggiungi cliente'}
          </button>
        </>
      }
    >
      {open && <ClientForm key={client?.id ?? 'new'} client={client} onSaved={onSaved} onDone={onClose} />}
    </Modal>
  )
}

// ---------------------------------------------------------------- stato del form

interface PolicyRow {
  /** ID della polizza (esistente o nuovo). */
  id: string
  kind: PolicyKind
  digits: string
  startDate: string
  maturityDate: string
  annualPremium: string
  pacAmount: string
  pacDay: string
}

interface FormState {
  firstName: string
  lastName: string
  birthDate: string
  city: string
  segment: ClientSegment | ''
  phone: string
  email: string
  docExpiry: string
  amlReviewDue: string
  iddQuestionnaireDate: string
  lastContact: string
  policies: PolicyRow[]
  tags: string
  notes: string
}

type FieldKey =
  | 'firstName'
  | 'lastName'
  | 'birthDate'
  | 'phone'
  | 'email'
  | 'docExpiry'
  | 'amlReviewDue'
  | 'iddQuestionnaireDate'
  | 'lastContact'
type PolicyField = 'digits' | 'startDate' | 'maturityDate' | 'annualPremium' | 'pacAmount' | 'pacDay'

interface Errors {
  fields: Partial<Record<FieldKey, string>>
  policies: Record<string, Partial<Record<PolicyField, string>>>
}

const NO_ERRORS: Errors = { fields: {}, policies: {} }

const amountToString = (n: number | undefined) => (n === undefined ? '' : String(n))

function toPolicyRow(p: Policy): PolicyRow {
  return {
    id: p.id,
    kind: p.kind,
    digits: policyRefDigits(p.ref),
    startDate: p.startDate,
    maturityDate: p.maturityDate ?? '',
    annualPremium: amountToString(p.annualPremium),
    pacAmount: amountToString(p.pac?.amount),
    pacDay: p.pac ? String(p.pac.dayOfMonth) : '',
  }
}

function emptyPolicyRow(): PolicyRow {
  return {
    id: createId('p'),
    kind: 'risparmio',
    digits: '',
    startDate: '',
    maturityDate: '',
    annualPremium: '',
    pacAmount: '',
    pacDay: '',
  }
}

function initialState(client: Client | undefined): FormState {
  return {
    firstName: client?.firstName ?? '',
    lastName: client?.lastName ?? '',
    birthDate: client?.birthDate ?? '',
    city: client?.city ?? '',
    segment: client?.segment ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    docExpiry: client?.docExpiry ?? '',
    amlReviewDue: client?.amlReviewDue ?? '',
    iddQuestionnaireDate: client?.iddQuestionnaireDate ?? '',
    lastContact: client?.lastContact ?? '',
    policies: client?.policies.map(toPolicyRow) ?? [],
    tags: (client?.tags ?? []).join(', '),
    notes: client?.notes ?? '',
  }
}

/** "1.234,50" / "1234.5" / "1 234" → 1234.5; stringa vuota → undefined; NaN se non valido. */
function parseAmount(value: string): number | undefined {
  const trimmed = value.trim().replace(/\s|€/g, '')
  if (!trimmed) return undefined
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed
  if (!/^\d+(\.\d+)?$/.test(normalized)) return Number.NaN
  return Number(normalized)
}

const optionalDate = (value: string) => (value && isDateKey(value) ? value : undefined)

function validate(f: FormState, today: string): Errors {
  const fields: Errors['fields'] = {}
  const policies: Errors['policies'] = {}

  if (!f.lastName.trim()) fields.lastName = 'Il cognome è obbligatorio.'
  else if (f.lastName.trim().length > 80) fields.lastName = 'Massimo 80 caratteri.'
  if (f.firstName.trim().length > 80) fields.firstName = 'Massimo 80 caratteri.'

  const dateField = (key: FieldKey, value: string, opts: { notFuture?: boolean } = {}) => {
    if (!value) return
    if (!isDateKey(value)) fields[key] = 'Data non valida.'
    else if (opts.notFuture && value > today) fields[key] = 'La data non può essere nel futuro.'
  }
  dateField('birthDate', f.birthDate, { notFuture: true })
  dateField('docExpiry', f.docExpiry)
  dateField('amlReviewDue', f.amlReviewDue)
  dateField('iddQuestionnaireDate', f.iddQuestionnaireDate, { notFuture: true })
  dateField('lastContact', f.lastContact, { notFuture: true })

  if (f.phone.trim() && !isPlausiblePhone(f.phone.trim())) {
    fields.phone = 'Numero non valido: usa solo cifre, spazi e il prefisso +.'
  }
  if (f.email.trim() && !isValidEmail(f.email.trim())) fields.email = 'Indirizzo email non valido (es. nome@dominio.it).'

  for (const p of f.policies) {
    const e: Partial<Record<PolicyField, string>> = {}
    if (!isFourDigits(p.digits)) e.digits = 'Inserisci esattamente 4 cifre.'
    if (!p.startDate) e.startDate = 'Inserisci la decorrenza.'
    else if (!isDateKey(p.startDate)) e.startDate = 'Data non valida.'
    if (p.maturityDate) {
      if (!isDateKey(p.maturityDate)) e.maturityDate = 'Data non valida.'
      else if (isDateKey(p.startDate) && p.maturityDate <= p.startDate) e.maturityDate = 'Deve essere dopo la decorrenza.'
    }
    const premium = parseAmount(p.annualPremium)
    if (premium !== undefined && (Number.isNaN(premium) || premium < 0)) e.annualPremium = 'Importo non valido.'
    const pac = parseAmount(p.pacAmount)
    const hasDay = p.pacDay.trim() !== ''
    if (pac !== undefined && (Number.isNaN(pac) || pac <= 0)) e.pacAmount = 'Importo non valido.'
    else if (pac === undefined && hasDay) e.pacAmount = "Indica l'importo mensile."
    if (hasDay) {
      const day = Number(p.pacDay)
      if (!Number.isInteger(day) || day < 1 || day > 31) e.pacDay = 'Giorno da 1 a 31.'
    } else if (pac !== undefined && !Number.isNaN(pac)) e.pacDay = 'Indica il giorno di addebito.'
    if (Object.keys(e).length > 0) policies[p.id] = e
  }
  return { fields, policies }
}

const hasErrors = (e: Errors) => Object.keys(e.fields).length > 0 || Object.keys(e.policies).length > 0

function toPolicy(row: PolicyRow): Policy {
  const premium = parseAmount(row.annualPremium)
  const pac = parseAmount(row.pacAmount)
  return {
    id: row.id,
    kind: row.kind,
    ref: maskPolicyRef(row.digits),
    startDate: row.startDate,
    maturityDate: optionalDate(row.maturityDate),
    annualPremium: premium,
    pac: pac !== undefined && row.pacDay ? { amount: pac, dayOfMonth: Number(row.pacDay) } : undefined,
  }
}

// ---------------------------------------------------------------- form

function ClientForm({ client, onSaved, onDone }: { client?: Client; onSaved?(client: Client): void; onDone(): void }) {
  const { settings } = useAppData()
  const actions = useActions()
  const toast = useToast()
  const { date: today } = useNow()
  const uid = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const firstNameRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>(() => initialState(client))
  const [errors, setErrors] = useState<Errors>(NO_ERRORS)

  // Il <dialog> mette il focus sul primo elemento (il pulsante "Chiudi"): lo spostiamo sul primo campo.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => firstNameRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (key in errors.fields) setErrors((e) => ({ ...e, fields: { ...e.fields, [key]: undefined } }))
  }

  const setPolicy = <K extends keyof PolicyRow>(id: string, key: K, value: PolicyRow[K]) => {
    setForm((f) => ({ ...f, policies: f.policies.map((p) => (p.id === id ? { ...p, [key]: value } : p)) }))
    if (errors.policies[id]) {
      setErrors((e) => ({ ...e, policies: { ...e.policies, [id]: { ...e.policies[id], [key]: undefined } } }))
    }
  }

  const addPolicy = () => {
    const row = emptyPolicyRow()
    setForm((f) => ({ ...f, policies: [...f.policies, row] }))
    window.requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLSelectElement>(`[data-cl-policy="${row.id}"] select`)?.focus()
    })
  }

  const removePolicy = (id: string, index: number) => {
    setForm((f) => ({ ...f, policies: f.policies.filter((p) => p.id !== id) }))
    setErrors((e) => {
      const rest = { ...e.policies }
      delete rest[id]
      return { ...e, policies: rest }
    })
    // Il focus va sulla polizza precedente (o sul pulsante "Aggiungi polizza").
    window.requestAnimationFrame(() => {
      const rows = formRef.current?.querySelectorAll<HTMLElement>('[data-cl-policy] .cl-policy-remove')
      const target = rows && rows.length > 0 ? rows[Math.min(index, rows.length - 1)] : undefined
      ;(target ?? formRef.current?.querySelector<HTMLElement>('.cl-policy-add'))?.focus()
    })
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const found = validate(form, today)
    setErrors(found)
    if (hasErrors(found)) {
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }

    const tags = parseTags(form.tags)
    const data: NewClient = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      birthDate: optionalDate(form.birthDate),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      city: form.city.trim() || undefined,
      segment: form.segment || undefined,
      docExpiry: optionalDate(form.docExpiry),
      amlReviewDue: optionalDate(form.amlReviewDue),
      iddQuestionnaireDate: optionalDate(form.iddQuestionnaireDate),
      lastContact: optionalDate(form.lastContact),
      policies: form.policies.map(toPolicy),
      tags: tags.length > 0 ? tags : undefined,
      notes: form.notes.trim() || undefined,
    }

    let saved: Client
    if (client) {
      actions.updateClient(client.id, data)
      saved = { ...client, ...data }
      toast({ message: 'Modifiche al cliente salvate' })
    } else {
      saved = actions.addClient(data)
      const id = saved.id
      toast(
        onSaved
          ? { message: `Cliente aggiunto: ${clientFullName(saved)}` }
          : {
              message: `Cliente aggiunto: ${clientFullName(saved)}`,
              actionLabel: 'Apri scheda',
              onAction: () => navigate('clienti', { id }),
            },
      )
    }
    onSaved?.(saved)
    onDone()
  }

  // ---------------------------------------------------------------- helper di rendering

  const fieldErrorId = (key: FieldKey) => (errors.fields[key] ? `${uid}-${key}-err` : undefined)
  const fieldError = (key: FieldKey) =>
    errors.fields[key] ? (
      <span id={fieldErrorId(key)} className="cl-error">
        {errors.fields[key]}
      </span>
    ) : null
  const describedBy = (...ids: (string | undefined)[]) => ids.filter(Boolean).join(' ') || undefined

  const dateInput = (key: FieldKey, label: ReactNode, hint?: ReactNode, opts: { max?: string } = {}) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="date"
        className="input"
        value={form[key]}
        max={opts.max}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={errors.fields[key] ? true : undefined}
        aria-describedby={describedBy(fieldErrorId(key), hint ? `${uid}-${key}-hint` : undefined)}
      />
      {fieldError(key)}
      {hint && (
        <span id={`${uid}-${key}-hint`} className="field-hint">
          {hint}
        </span>
      )}
    </label>
  )

  const iddDue = isDateKey(form.iddQuestionnaireDate)
    ? iddDueDate({ iddQuestionnaireDate: form.iddQuestionnaireDate }, settings.iddValidityMonths)
    : undefined
  const iddHint = (
    <>
      Validità: {settings.iddValidityMonths} mesi (modificabile in Impostazioni)
      {iddDue && <> · valido fino al {formatDateShort(iddDue)}</>}
    </>
  )
  const notesWarning = sensitiveDataHint(form.notes)
  const tagsWarning = sensitiveDataHint(form.tags)

  return (
    <form id={FORM_ID} ref={formRef} className="form cl-form" onSubmit={submit} noValidate>
      <p className="cl-privacy-note">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>
          Registra solo i dati utili al lavoro: niente dati sanitari, codici fiscali o numeri di polizza completi.
        </span>
      </p>

      <fieldset className="cl-fieldset">
        <legend>Anagrafica</legend>
        <div className="form-grid">
          <label className="field">
            <span>Nome</span>
            <input
              ref={firstNameRef}
              className="input"
              value={form.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              autoComplete="off"
              maxLength={80}
              aria-invalid={errors.fields.firstName ? true : undefined}
              aria-describedby={fieldErrorId('firstName')}
            />
            {fieldError('firstName')}
          </label>
          <label className="field">
            <span>
              Cognome{' '}
              <span className="cl-required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              className="input"
              value={form.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              required
              autoComplete="off"
              maxLength={80}
              aria-invalid={errors.fields.lastName ? true : undefined}
              aria-describedby={fieldErrorId('lastName')}
            />
            {fieldError('lastName')}
          </label>
          {dateInput('birthDate', 'Data di nascita', undefined, { max: today })}
          <label className="field">
            <span>Città</span>
            <input
              className="input"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              autoComplete="off"
              maxLength={80}
            />
          </label>
          <label className="field">
            <span>Segmento</span>
            <select className="select" value={form.segment} onChange={(e) => set('segment', e.target.value as ClientSegment | '')}>
              <option value="">Non indicato</option>
              {SEGMENT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="cl-fieldset">
        <legend>Contatti</legend>
        <div className="form-grid">
          <label className="field">
            <span>Telefono</span>
            <input
              type="tel"
              className="input"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="Es. +39 333 123 4567"
              autoComplete="off"
              maxLength={30}
              aria-invalid={errors.fields.phone ? true : undefined}
              aria-describedby={fieldErrorId('phone')}
            />
            {fieldError('phone')}
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="nome@dominio.it"
              autoComplete="off"
              maxLength={120}
              aria-invalid={errors.fields.email ? true : undefined}
              aria-describedby={fieldErrorId('email')}
            />
            {fieldError('email')}
          </label>
        </div>
      </fieldset>

      <fieldset className="cl-fieldset">
        <legend>Adempimenti</legend>
        <div className="form-grid">
          {dateInput('docExpiry', "Scadenza documento d'identità")}
          {dateInput('amlReviewDue', 'Prossima adeguata verifica (antiriciclaggio)')}
          {dateInput('iddQuestionnaireDate', 'Data ultimo questionario di adeguatezza', iddHint, { max: today })}
          {dateInput('lastContact', 'Ultimo contatto', 'Incontro o telefonata significativa', { max: today })}
        </div>
      </fieldset>

      <fieldset className="cl-fieldset">
        <legend>Polizze</legend>
        {form.policies.length === 0 ? (
          <p className="cl-form-empty">Nessuna polizza registrata (es. prospect).</p>
        ) : (
          <ol className="cl-policy-rows">
            {form.policies.map((p, index) => (
              <PolicyRowFields
                key={p.id}
                row={p}
                index={index}
                errors={errors.policies[p.id] ?? {}}
                uid={uid}
                onChange={setPolicy}
                onRemove={() => removePolicy(p.id, index)}
              />
            ))}
          </ol>
        )}
        <div>
          <button type="button" className="btn cl-policy-add" onClick={addPolicy}>
            <Plus size={16} aria-hidden="true" />
            Aggiungi polizza
          </button>
        </div>
      </fieldset>

      <fieldset className="cl-fieldset">
        <legend>Etichette e note</legend>
        <div className="form-grid">
          <label className="field span-2">
            <span>Etichette</span>
            <input
              className="input"
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
              placeholder="Es. prospect, cliente storico"
              autoComplete="off"
              maxLength={300}
              aria-describedby={describedBy(`${uid}-tags-hint`, tagsWarning ? `${uid}-tags-warn` : undefined)}
            />
            <span id={`${uid}-tags-hint`} className="field-hint">
              Separate da virgola.
            </span>
            {tagsWarning && <SensitiveWarning id={`${uid}-tags-warn`} text={tagsWarning} />}
          </label>
          <label className="field span-2">
            <span>Note</span>
            <textarea
              className="textarea"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={4}
              maxLength={2000}
              aria-describedby={describedBy(`${uid}-notes-hint`, notesWarning ? `${uid}-notes-warn` : undefined)}
            />
            <span id={`${uid}-notes-hint`} className="field-hint">
              Evita dati sanitari o informazioni sensibili.
            </span>
            {notesWarning && <SensitiveWarning id={`${uid}-notes-warn`} text={notesWarning} />}
          </label>
        </div>
      </fieldset>
    </form>
  )
}

function SensitiveWarning({ id, text }: { id: string; text: string }) {
  return (
    <span id={id} className="cl-sensitive">
      <TriangleAlert size={14} aria-hidden="true" />
      {text}
    </span>
  )
}

function PolicyRowFields({
  row,
  index,
  errors,
  uid,
  onChange,
  onRemove,
}: {
  row: PolicyRow
  index: number
  errors: Partial<Record<PolicyField, string>>
  uid: string
  onChange<K extends keyof PolicyRow>(id: string, key: K, value: PolicyRow[K]): void
  onRemove(): void
}) {
  const n = index + 1
  const base = `${uid}-p${n}`
  const errId = (key: PolicyField) => (errors[key] ? `${base}-${key}-err` : undefined)
  const err = (key: PolicyField) =>
    errors[key] ? (
      <span id={errId(key)} className="cl-error">
        {errors[key]}
      </span>
    ) : null
  const invalid = (key: PolicyField) => (errors[key] ? true : undefined)

  return (
    <li className="cl-policy-row" data-cl-policy={row.id}>
      <div className="cl-policy-row-head">
        <span className="cl-policy-row-title" id={`${base}-title`}>
          Polizza {n}
        </span>
        <button
          type="button"
          className="icon-btn cl-policy-remove"
          onClick={onRemove}
          aria-label={`Rimuovi polizza ${n}`}
          title="Rimuovi polizza"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="cl-policy-grid" role="group" aria-labelledby={`${base}-title`}>
        <label className="field cl-span-2">
          <span>Tipo</span>
          <select className="select" value={row.kind} onChange={(e) => onChange(row.id, 'kind', e.target.value as PolicyKind)}>
            {POLICY_KIND_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            Ultime 4 cifre{' '}
            <span className="cl-required" aria-hidden="true">
              *
            </span>
          </span>
          <span className="cl-ref-input">
            <span className="cl-ref-mask" aria-hidden="true">
              ••••
            </span>
            <input
              className="input num"
              value={row.digits}
              onChange={(e) => onChange(row.id, 'digits', e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="1234"
              required
              aria-invalid={invalid('digits')}
              aria-describedby={errId('digits') ?? `${base}-digits-hint`}
            />
          </span>
          {err('digits') ?? (
            <span id={`${base}-digits-hint`} className="field-hint">
              Mai il numero completo.
            </span>
          )}
        </label>
        <label className="field">
          <span>
            Decorrenza{' '}
            <span className="cl-required" aria-hidden="true">
              *
            </span>
          </span>
          <input
            type="date"
            className="input"
            value={row.startDate}
            onChange={(e) => onChange(row.id, 'startDate', e.target.value)}
            required
            aria-invalid={invalid('startDate')}
            aria-describedby={errId('startDate')}
          />
          {err('startDate')}
        </label>
        <label className="field">
          <span>Scadenza</span>
          <input
            type="date"
            className="input"
            value={row.maturityDate}
            onChange={(e) => onChange(row.id, 'maturityDate', e.target.value)}
            aria-invalid={invalid('maturityDate')}
            aria-describedby={errId('maturityDate') ?? `${base}-maturity-hint`}
          />
          {err('maturityDate') ?? (
            <span id={`${base}-maturity-hint`} className="field-hint">
              Facoltativa (vita intera: vuota).
            </span>
          )}
        </label>
        <label className="field">
          <span>Premio annuo €</span>
          <input
            type="number"
            className="input num"
            value={row.annualPremium}
            onChange={(e) => onChange(row.id, 'annualPremium', e.target.value)}
            min={0}
            step="any"
            inputMode="decimal"
            aria-invalid={invalid('annualPremium')}
            aria-describedby={errId('annualPremium')}
          />
          {err('annualPremium')}
        </label>
        <label className="field">
          <span>PAC €/mese</span>
          <input
            type="number"
            className="input num"
            value={row.pacAmount}
            onChange={(e) => onChange(row.id, 'pacAmount', e.target.value)}
            min={0}
            step="any"
            inputMode="decimal"
            placeholder="Facoltativo"
            aria-invalid={invalid('pacAmount')}
            aria-describedby={errId('pacAmount')}
          />
          {err('pacAmount')}
        </label>
        <label className="field">
          <span>Giorno addebito PAC</span>
          <input
            type="number"
            className="input num"
            value={row.pacDay}
            onChange={(e) => onChange(row.id, 'pacDay', e.target.value)}
            min={1}
            max={31}
            step={1}
            inputMode="numeric"
            placeholder="1–31"
            aria-invalid={invalid('pacDay')}
            aria-describedby={errId('pacDay')}
          />
          {err('pacDay')}
        </label>
      </div>
    </li>
  )
}
