import { Plus, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import {
  AML_RISK_LABEL,
  CLIENT_SEGMENT_LABEL,
  POLICY_KIND_LABEL,
  PREMIUM_TYPE_LABEL,
  RISK_PROFILE_LABEL,
} from '../../domain/labels'
import type { Client, ClientSegment, Policy, PolicyKind, RiskProfile } from '../../domain/types'
import { isDateKey } from '../../lib/dates'
import { formatDateShort } from '../../lib/format'
import { createId } from '../../lib/id'
import { navigate } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useActions, useAppData, type NewClient } from '../../store/StoreContext'
import { clientFullName } from '../../store/selectors'
import {
  PREMIUM_AMOUNT_LABEL,
  checkAmount,
  formatAmountInput,
  iddDueDate,
  isFourDigits,
  isPlausiblePhone,
  isValidEmail,
  maskPolicyRef,
  parseTags,
  policyRefDigits,
  premiumTypeOf,
  sensitiveDataHint,
  type PremiumType,
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

type AmlRisk = NonNullable<Client['amlRisk']>

const SEGMENT_OPTIONS = Object.entries(CLIENT_SEGMENT_LABEL) as [ClientSegment, string][]
const RISK_PROFILE_OPTIONS = Object.entries(RISK_PROFILE_LABEL) as [RiskProfile, string][]
const AML_RISK_OPTIONS = Object.entries(AML_RISK_LABEL) as [AmlRisk, string][]
const POLICY_KIND_OPTIONS = Object.entries(POLICY_KIND_LABEL) as [PolicyKind, string][]
const PREMIUM_TYPE_OPTIONS = Object.entries(PREMIUM_TYPE_LABEL) as [PremiumType, string][]

/** Valore salvato → opzione della select ('' se assente o non riconosciuto). */
const optionOf = <T extends string>(labels: Record<T, string>, value: T | undefined): T | '' =>
  value !== undefined && Object.hasOwn(labels, value) ? value : ''

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
            <button type="button" className="btn btn-danger cl-form-delete" onClick={remove} title="Elimina cliente">
              <Trash2 size={16} aria-hidden="true" />
              <span className="cl-form-delete-label">Elimina</span>
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
  productName: string
  digits: string
  startDate: string
  maturityDate: string
  premiumType: PremiumType
  /** Importo del premio (annuo, unico o versamento, secondo premiumType), come digitato. */
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
  /** undefined = consenso non ancora registrato (clienti esistenti): resta tale finché non si tocca la casella. */
  marketingConsent: boolean | undefined
  docExpiry: string
  amlReviewDue: string
  amlRisk: AmlRisk | ''
  iddQuestionnaireDate: string
  riskProfile: RiskProfile | ''
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

function toPolicyRow(p: Policy): PolicyRow {
  return {
    id: p.id,
    kind: p.kind,
    productName: p.productName ?? '',
    digits: policyRefDigits(p.ref),
    startDate: p.startDate,
    maturityDate: p.maturityDate ?? '',
    premiumType: premiumTypeOf(p),
    annualPremium: formatAmountInput(p.annualPremium),
    pacAmount: formatAmountInput(p.pac?.amount),
    pacDay: p.pac ? String(p.pac.dayOfMonth) : '',
  }
}

function emptyPolicyRow(): PolicyRow {
  return {
    id: createId('p'),
    kind: 'risparmio',
    productName: '',
    digits: '',
    startDate: '',
    maturityDate: '',
    premiumType: 'annuo',
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
    // Nuovo cliente: il consenso è facoltativo e va espresso, quindi parte da "no".
    marketingConsent: client ? client.marketingConsent : false,
    docExpiry: client?.docExpiry ?? '',
    amlReviewDue: client?.amlReviewDue ?? '',
    amlRisk: optionOf(AML_RISK_LABEL, client?.amlRisk),
    iddQuestionnaireDate: client?.iddQuestionnaireDate ?? '',
    riskProfile: optionOf(RISK_PROFILE_LABEL, client?.riskProfile),
    lastContact: client?.lastContact ?? '',
    policies: client?.policies.map(toPolicyRow) ?? [],
    tags: (client?.tags ?? []).join(', '),
    notes: client?.notes ?? '',
  }
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
    const premium = checkAmount(p.annualPremium)
    if (premium.error) e.annualPremium = premium.error
    const pac = checkAmount(p.pacAmount, { positive: true })
    const hasDay = p.pacDay.trim() !== ''
    if (pac.error) e.pacAmount = pac.error
    else if (pac.value === undefined && hasDay) e.pacAmount = "Indica l'importo mensile."
    if (hasDay) {
      const day = Number(p.pacDay)
      if (!Number.isInteger(day) || day < 1 || day > 31) e.pacDay = 'Giorno da 1 a 31.'
    } else if (pac.value !== undefined) e.pacDay = 'Indica il giorno di addebito.'
    if (Object.keys(e).length > 0) policies[p.id] = e
  }
  return { fields, policies }
}

const hasErrors = (e: Errors) => Object.keys(e.fields).length > 0 || Object.keys(e.policies).length > 0

function toPolicy(row: PolicyRow): Policy {
  const premium = checkAmount(row.annualPremium).value
  const pac = checkAmount(row.pacAmount, { positive: true }).value
  return {
    id: row.id,
    kind: row.kind,
    ref: maskPolicyRef(row.digits),
    productName: row.productName.trim() || undefined,
    startDate: row.startDate,
    maturityDate: optionalDate(row.maturityDate),
    premiumType: row.premiumType,
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
      marketingConsent: form.marketingConsent,
      docExpiry: optionalDate(form.docExpiry),
      amlReviewDue: optionalDate(form.amlReviewDue),
      amlRisk: form.amlRisk || undefined,
      iddQuestionnaireDate: optionalDate(form.iddQuestionnaireDate),
      riskProfile: form.riskProfile || undefined,
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

  // ---------------------------------------------------------------- rendering

  const fid = (key: string) => `${uid}-${key}`
  const invalid = (key: FieldKey) => (errors.fields[key] ? true : undefined)
  const describedBy = (key: string, opts: { error?: boolean; hint?: boolean; warning?: boolean }) =>
    [opts.error && `${fid(key)}-err`, opts.hint && `${fid(key)}-hint`, opts.warning && `${fid(key)}-warn`]
      .filter(Boolean)
      .join(' ') || undefined

  const dateField = (key: FieldKey, label: string, hint?: ReactNode, opts: { max?: string } = {}) => (
    <Field id={fid(key)} label={label} error={errors.fields[key]} hint={hint}>
      <input
        id={fid(key)}
        type="date"
        className="input"
        value={form[key]}
        max={opts.max}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={invalid(key)}
        aria-describedby={describedBy(key, { error: !!errors.fields[key], hint: !!hint && !errors.fields[key] })}
      />
    </Field>
  )

  const textField = (
    key: FieldKey | 'city',
    label: string,
    props: { type?: string; placeholder?: string; maxLength: number; required?: boolean; inputRef?: Ref<HTMLInputElement> },
  ) => {
    const error = key === 'city' ? undefined : errors.fields[key]
    return (
      <Field id={fid(key)} label={label} required={props.required} error={error}>
        <input
          ref={props.inputRef}
          id={fid(key)}
          type={props.type ?? 'text'}
          className="input"
          value={form[key]}
          onChange={(e) => set(key, e.target.value)}
          placeholder={props.placeholder}
          required={props.required}
          maxLength={props.maxLength}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(key, { error: !!error })}
        />
      </Field>
    )
  }

  const selectField = <K extends 'riskProfile' | 'amlRisk'>(
    key: K,
    label: string,
    options: [Exclude<FormState[K], ''>, string][],
  ) => (
    <Field id={fid(key)} label={label}>
      <select
        id={fid(key)}
        className="select"
        value={form[key]}
        onChange={(e) => set(key, e.target.value as FormState[K])}
      >
        <option value="">Non registrato</option>
        {options.map(([value, optionLabel]) => (
          <option key={value} value={value}>
            {optionLabel}
          </option>
        ))}
      </select>
    </Field>
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
  const consentHint =
    'Spunta solo se il cliente ha firmato il consenso privacy per finalità commerciali.' +
    (form.marketingConsent === undefined ? ' Finora non registrato.' : '')
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
      <p className="cl-required-note">
        <span className="cl-required">*</span> campo obbligatorio
      </p>

      <fieldset className="cl-fieldset">
        <legend>Anagrafica</legend>
        <div className="form-grid">
          {textField('firstName', 'Nome', { maxLength: 80, inputRef: firstNameRef })}
          {textField('lastName', 'Cognome', { maxLength: 80, required: true })}
          {dateField('birthDate', 'Data di nascita', undefined, { max: today })}
          {textField('city', 'Città', { maxLength: 80 })}
          <Field id={fid('segment')} label="Segmento">
            <select
              id={fid('segment')}
              className="select"
              value={form.segment}
              onChange={(e) => set('segment', e.target.value as ClientSegment | '')}
            >
              <option value="">Non indicato</option>
              {SEGMENT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="cl-fieldset">
        <legend>Contatti</legend>
        <div className="form-grid">
          {textField('phone', 'Telefono', { type: 'tel', placeholder: 'Es. +39 333 123 4567', maxLength: 30 })}
          {textField('email', 'Email', { type: 'email', placeholder: 'nome@dominio.it', maxLength: 120 })}
          <div className="field span-2">
            <label className="cl-check">
              <input
                type="checkbox"
                className="checkbox"
                checked={form.marketingConsent === true}
                onChange={(e) => set('marketingConsent', e.target.checked)}
                aria-describedby={`${fid('consent')}-hint`}
              />
              <span>Consenso comunicazioni commerciali</span>
            </label>
            <span id={`${fid('consent')}-hint`} className="field-hint">
              {consentHint}
            </span>
          </div>
        </div>
      </fieldset>

      <fieldset className="cl-fieldset">
        <legend>Adempimenti</legend>
        <div className="form-grid">
          {dateField('docExpiry', "Scadenza documento d'identità")}
          {dateField('lastContact', 'Ultimo contatto', 'Incontro o telefonata significativa', { max: today })}
          {dateField('amlReviewDue', 'Prossima adeguata verifica (antiriciclaggio)')}
          {selectField('amlRisk', 'Rischio antiriciclaggio', AML_RISK_OPTIONS)}
          {dateField('iddQuestionnaireDate', 'Data ultimo questionario di adeguatezza', iddHint, { max: today })}
          {selectField('riskProfile', 'Profilo di rischio (questionario)', RISK_PROFILE_OPTIONS)}
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
          <Field id={fid('tags')} label="Etichette" className="span-2" hint="Separate da virgola." warning={tagsWarning}>
            <input
              id={fid('tags')}
              className="input"
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
              placeholder="Es. prospect, cliente storico"
              autoComplete="off"
              maxLength={300}
              aria-describedby={describedBy('tags', { hint: true, warning: !!tagsWarning })}
            />
          </Field>
          <Field
            id={fid('notes')}
            label="Note"
            className="span-2"
            hint="Evita dati sanitari o informazioni sensibili."
            warning={notesWarning}
          >
            <textarea
              id={fid('notes')}
              className="textarea"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={4}
              maxLength={2000}
              aria-describedby={describedBy('notes', { hint: true, warning: !!notesWarning })}
            />
          </Field>
        </div>
      </fieldset>
    </form>
  )
}

/**
 * Campo con etichetta collegata (htmlFor), errore, suggerimento e avviso.
 * Gli ID di errore/suggerimento/avviso sono `${id}-err`, `${id}-hint`, `${id}-warn`.
 */
function Field({
  id,
  label,
  required,
  error,
  hint,
  warning,
  className,
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  hint?: ReactNode
  warning?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && (
          <span className="cl-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <span id={`${id}-err`} className="cl-error">
          {error}
        </span>
      )}
      {hint && !error && (
        <span id={`${id}-hint`} className="field-hint">
          {hint}
        </span>
      )}
      {warning && (
        <span id={`${id}-warn`} className="cl-sensitive">
          <TriangleAlert size={14} aria-hidden="true" />
          {warning}
        </span>
      )}
    </div>
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
  const fid = (key: string) => `${base}-${key}`
  const describedBy = (key: PolicyField, hint = false) =>
    errors[key] ? `${fid(key)}-err` : hint ? `${fid(key)}-hint` : undefined
  const invalid = (key: PolicyField) => (errors[key] ? true : undefined)
  /** Importo in euro: testo libero ("3.000", "1.200,50"), riscritto in formato italiano all'uscita dal campo. */
  const amountField = (key: 'annualPremium' | 'pacAmount', label: string, placeholder: string, className?: string) => (
    <Field id={fid(key)} label={label} error={errors[key]} className={className}>
      <input
        id={fid(key)}
        type="text"
        className="input num"
        value={row[key]}
        onChange={(e) => onChange(row.id, key, e.target.value)}
        onBlur={() => {
          const { value, error } = checkAmount(row[key])
          const formatted = formatAmountInput(value)
          if (!error && value !== undefined && formatted !== row[key]) onChange(row.id, key, formatted)
        }}
        inputMode="decimal"
        autoComplete="off"
        maxLength={20}
        placeholder={placeholder}
        aria-invalid={invalid(key)}
        aria-describedby={describedBy(key)}
      />
    </Field>
  )

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
        <Field id={fid('kind')} label="Tipo">
          <select
            id={fid('kind')}
            className="select"
            value={row.kind}
            onChange={(e) => onChange(row.id, 'kind', e.target.value as PolicyKind)}
          >
            {POLICY_KIND_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field id={fid('productName')} label="Nome prodotto" className="cl-span-2" hint="Facoltativo.">
          <input
            id={fid('productName')}
            className="input"
            value={row.productName}
            onChange={(e) => onChange(row.id, 'productName', e.target.value)}
            maxLength={80}
            autoComplete="off"
            aria-describedby={`${fid('productName')}-hint`}
          />
        </Field>
        <Field id={fid('digits')} label="Ultime 4 cifre" required error={errors.digits} hint="Mai il numero completo.">
          <span className="cl-ref-input">
            <span className="cl-ref-mask" aria-hidden="true">
              ••••
            </span>
            <input
              id={fid('digits')}
              className="input num"
              value={row.digits}
              onChange={(e) => onChange(row.id, 'digits', e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              required
              aria-invalid={invalid('digits')}
              aria-describedby={describedBy('digits', true)}
            />
          </span>
        </Field>
        <Field id={fid('startDate')} label="Decorrenza" required error={errors.startDate}>
          <input
            id={fid('startDate')}
            type="date"
            className="input"
            value={row.startDate}
            onChange={(e) => onChange(row.id, 'startDate', e.target.value)}
            required
            aria-invalid={invalid('startDate')}
            aria-describedby={describedBy('startDate')}
          />
        </Field>
        <Field id={fid('maturityDate')} label="Scadenza" error={errors.maturityDate} hint="Facoltativa.">
          <input
            id={fid('maturityDate')}
            type="date"
            className="input"
            value={row.maturityDate}
            onChange={(e) => onChange(row.id, 'maturityDate', e.target.value)}
            aria-invalid={invalid('maturityDate')}
            aria-describedby={describedBy('maturityDate', true)}
          />
        </Field>
        <Field id={fid('premiumType')} label="Tipo di premio" className="cl-grid-newline">
          <select
            id={fid('premiumType')}
            className="select"
            value={row.premiumType}
            onChange={(e) => onChange(row.id, 'premiumType', e.target.value as PremiumType)}
          >
            {PREMIUM_TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {amountField('annualPremium', `${PREMIUM_AMOUNT_LABEL[row.premiumType]} €`, 'Es. 1.200,00')}
        {amountField('pacAmount', 'PAC €/mese', 'Facoltativo', 'cl-grid-newline')}
        <Field id={fid('pacDay')} label="Giorno addebito PAC" error={errors.pacDay}>
          <input
            id={fid('pacDay')}
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
            aria-describedby={describedBy('pacDay')}
          />
        </Field>
      </div>
    </li>
  )
}
