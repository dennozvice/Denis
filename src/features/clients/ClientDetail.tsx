import {
  ArrowLeft,
  Cake,
  CalendarPlus,
  Check,
  ClipboardCheck,
  FileText,
  FolderPlus,
  IdCard,
  ListPlus,
  Mail,
  Megaphone,
  Pencil,
  Phone,
  PhoneCall,
  ShieldCheck,
  StickyNote,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Pill } from '../../components/ui/Pill'
import { useToast } from '../../components/ui/Toast'
import {
  AML_RISK_LABEL,
  APPOINTMENT_OUTCOME_LABEL,
  APPOINTMENT_TYPE_LABEL,
  CASE_STATUS_LABEL,
  CASE_STATUS_TONE,
  CASE_TYPE_LABEL,
  CLIENT_SEGMENT_LABEL,
  POLICY_KIND_LABEL,
  PREMIUM_TYPE_LABEL,
  RISK_PROFILE_LABEL,
  TASK_CATEGORY_LABEL,
  type Tone,
} from '../../domain/labels'
import type { Appointment, AppointmentOutcome, Case, Client, DateKey, Policy, Task, TaskCategory } from '../../domain/types'
import { addDays, ageOn, diffDays, nextAnniversary, timeToMinutes } from '../../lib/dates'
import {
  formatCurrency,
  formatDateShort,
  formatDayMonth,
  formatMonthShort,
  formatNumber,
  formatRelativeDays,
  initials,
  plural,
} from '../../lib/format'
import { buildHref } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useActions, useAppData, type NewAppointment, type NewTask } from '../../store/StoreContext'
import {
  clientFullName,
  compareAppointments,
  computeDeadlines,
  findTaskForDeadline,
  indexById,
  isOpen,
  sortTasks,
} from '../../store/selectors'
import { AppointmentFormModal } from '../agenda/AppointmentFormModal'
import { CaseFormModal } from '../cases/CaseFormModal'
import { TaskFormModal } from '../tasks/TaskFormModal'
import { ClientFormModal } from './ClientFormModal'
import {
  COMPLIANCE_TONE,
  EXPIRING_WITHIN_DAYS,
  complianceLabel,
  complianceState,
  iddDueDate,
  lastContactInfo,
  policyTotals,
  premiumTypeOf,
  tagTone,
  type ComplianceState,
} from './clientUtils'
import './clients.css'

interface ClientDetailProps {
  client: Client
  /** Torna all'elenco (visibile solo su tablet e mobile). */
  onBack(): void
  /** Dopo l'eliminazione del cliente. */
  onDeleted?(): void
}

type DetailModal =
  | { kind: 'edit' }
  | { kind: 'task'; defaults: Partial<NewTask> }
  | { kind: 'appointment'; defaults?: Partial<NewAppointment>; appointment?: Appointment; focusOutcome?: boolean }
  | { kind: 'case' }
  | null

/** Scheda del cliente: contatti, azioni rapide, adempimenti, polizze, attività, appuntamenti, pratiche, note. */
export function ClientDetail({ client, onBack, onDeleted }: ClientDetailProps) {
  const data = useAppData()
  const actions = useActions()
  const toast = useToast()
  const now = useNow()
  const today = now.date
  const [modal, setModal] = useState<DetailModal>(null)
  const close = () => setModal(null)

  const name = clientFullName(client) || client.lastName
  const contact = lastContactInfo(client, today, data.settings.recontactAfterDays)
  const totals = policyTotals(client.policies)
  const age = client.birthDate && client.birthDate <= today ? ageOn(client.birthDate, today) : undefined
  const nextBirthday = client.birthDate ? nextAnniversary(client.birthDate, today) : undefined
  /** Compleanno entro 30 giorni (per la pillola nell'intestazione). */
  const birthday = nextBirthday && diffDays(today, nextBirthday) <= 30 ? nextBirthday : undefined
  const daysToBirthday = birthday ? diffDays(today, birthday) : 0

  const openTasks = useMemo(
    () => sortTasks(data.tasks.filter((t) => t.clientId === client.id && isOpen(t))),
    [data.tasks, client.id],
  )
  const appointments = useMemo(() => {
    const mine = data.appointments
      .filter((a) => a.clientId === client.id && a.status !== 'annullato')
      .sort(compareAppointments)
    const isUpcoming = (a: Appointment) =>
      a.status !== 'svolto' && (a.date > today || (a.date === today && timeToMinutes(a.end) > now.minutes))
    const upcoming = mine.filter(isUpcoming)
    const past = mine.filter((a) => !isUpcoming(a)).reverse()
    return { upcoming, past }
  }, [data.appointments, client.id, today, now.minutes])
  const cases = useMemo(
    () =>
      data.cases
        .filter((k) => k.clientId === client.id)
        .sort((a, b) => {
          const ao = a.status !== 'chiusa'
          const bo = b.status !== 'chiusa'
          if (ao !== bo) return ao ? -1 : 1
          return a.openedOn < b.openedOn ? 1 : a.openedOn > b.openedOn ? -1 : 0
        }),
    [data.cases, client.id],
  )

  const markContact = () => {
    const previous = client.lastContact
    actions.updateClient(client.id, { lastContact: today })
    toast({
      message: `Contatto di oggi registrato: ${name}`,
      actionLabel: 'Annulla',
      onAction: () => actions.updateClient(client.id, { lastContact: previous }),
    })
  }

  const toggleTask = (task: Task, control: HTMLElement) => {
    const previous = { status: task.status, completedAt: task.completedAt }
    keepFocusInList(control)
    actions.toggleTask(task.id)
    toast({
      message: 'Attività completata',
      actionLabel: 'Annulla',
      onAction: () => actions.updateTask(task.id, previous),
    })
  }

  const createTask = (defaults: Partial<NewTask>) => setModal({ kind: 'task', defaults: { clientId: client.id, ...defaults } })

  /**
   * Scadenze di adempimento del cliente (doc-, aml-, idd-<id>) scadute o entro 30 giorni:
   * servono a riconoscere un'attività aperta già collegata, per non proporne un doppione.
   */
  const deadlines = useMemo(
    () => indexById(computeDeadlines({ ...data, clients: [client], cases: [] }, today, { horizonDays: EXPIRING_WITHIN_DAYS })),
    [data, client, today],
  )
  const linkedTask = (deadlineId: string) => {
    const deadline = deadlines.get(deadlineId)
    return deadline ? findTaskForDeadline(data.tasks, deadline) : undefined
  }

  const iddDue = iddDueDate(client, data.settings.iddValidityMonths)
  const compliance: ComplianceRowProps[] = [
    {
      icon: IdCard,
      label: "Documento d'identità",
      feminine: false,
      state: complianceState(client.docExpiry, today),
      describe: (due, expired) => `${expired ? 'Scaduto il' : 'Scade il'} ${formatDateShort(due)}`,
      deadlineId: `doc-${client.id}`,
      task: { title: "Richiedere documento d'identità aggiornato", category: 'documento' },
    },
    {
      icon: ShieldCheck,
      label: 'Adeguata verifica',
      feminine: true,
      state: complianceState(client.amlReviewDue, today),
      describe: (due, expired) => `${expired ? 'Rinnovo scaduto il' : 'Rinnovo entro il'} ${formatDateShort(due)}`,
      deadlineId: `aml-${client.id}`,
      task: { title: "Rinnovare l'adeguata verifica", category: 'compliance' },
      extra: {
        label: 'Rischio antiriciclaggio',
        value: labelOf(AML_RISK_LABEL, client.amlRisk),
        alert: client.amlRisk === 'alto',
      },
    },
    {
      icon: ClipboardCheck,
      label: 'Questionario di adeguatezza',
      feminine: false,
      state: complianceState(iddDue, today),
      describe: (due, expired) =>
        `${client.iddQuestionnaireDate ? `Compilato il ${formatDateShort(client.iddQuestionnaireDate)} · ` : ''}${expired ? 'scaduto il' : 'valido fino al'} ${formatDateShort(due)} (${data.settings.iddValidityMonths} mesi)`,
      deadlineId: `idd-${client.id}`,
      task: { title: 'Aggiornare il questionario di adeguatezza', category: 'adeguatezza' },
      extra: { label: 'Profilo di rischio', value: labelOf(RISK_PROFILE_LABEL, client.riskProfile) },
    },
  ]

  const subtitle = [
    age !== undefined ? `${age} anni` : undefined,
    client.segment ? CLIENT_SEGMENT_LABEL[client.segment] : undefined,
    client.city,
  ].filter(Boolean)

  return (
    <article className="cl-detail card" aria-labelledby={`cl-detail-${client.id}`}>
      <div className="cl-back-bar">
        <button type="button" className="btn btn-ghost cl-back" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden="true" />
          Tutti i clienti
        </button>
      </div>

      <header className="cl-detail-head">
        <span className="cl-avatar cl-avatar-lg" aria-hidden="true">
          {initials(name)}
        </span>
        <div className="cl-detail-id">
          <h2 id={`cl-detail-${client.id}`} tabIndex={-1} className="cl-detail-name">
            {name}
          </h2>
          {subtitle.length > 0 && <p className="cl-detail-sub">{subtitle.join(' · ')}</p>}
          {((client.tags?.length ?? 0) > 0 || birthday) && (
            <div className="cl-tags">
              {birthday && (
                <Pill tone="violet" title={`Compleanno: ${formatDateShort(birthday)}`}>
                  <Cake size={12} aria-hidden="true" />
                  {daysToBirthday === 0 ? 'Compleanno oggi' : `Compleanno ${formatRelativeDays(daysToBirthday)}`}
                </Pill>
              )}
              {client.tags?.map((tag) => (
                <Pill key={tag} tone={tagTone(tag)}>
                  {tag}
                </Pill>
              ))}
            </div>
          )}
        </div>
      </header>

      {(client.phone || client.email) && (
        <div className="cl-contact-links">
          {client.phone && (
            <a className="btn cl-contact-btn" href={`tel:${client.phone.replace(/[^\d+]/g, '')}`}>
              <Phone size={16} aria-hidden="true" />
              <span className="visually-hidden">Chiama </span>
              <span className="truncate num">{client.phone}</span>
            </a>
          )}
          {client.email && (
            <a className="btn cl-contact-btn" href={`mailto:${client.email}`}>
              <Mail size={16} aria-hidden="true" />
              <span className="visually-hidden">Scrivi a </span>
              <span className="truncate">{client.email}</span>
            </a>
          )}
        </div>
      )}

      <p className="cl-consent">
        <Megaphone size={16} aria-hidden="true" />
        <span>
          Consenso comunicazioni commerciali:{' '}
          <strong data-unset={client.marketingConsent === undefined || undefined}>
            {client.marketingConsent === undefined ? 'Non registrato' : client.marketingConsent ? 'Sì' : 'No'}
          </strong>
        </span>
      </p>

      <div className="cl-actions" role="group" aria-label={`Azioni per ${name}`}>
        <button type="button" className="btn" onClick={() => setModal({ kind: 'edit' })} aria-haspopup="dialog">
          <Pencil size={16} aria-hidden="true" />
          Modifica
        </button>
        <button type="button" className="btn" onClick={markContact} disabled={client.lastContact === today}>
          <PhoneCall size={16} aria-hidden="true" />
          {client.lastContact === today ? 'Contattato oggi' : 'Segna contatto oggi'}
        </button>
        <button type="button" className="btn" onClick={() => createTask({})} aria-haspopup="dialog">
          <ListPlus size={16} aria-hidden="true" />
          Nuova attività
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setModal({ kind: 'appointment', defaults: { clientId: client.id, title: `Incontro con ${name}` } })}
          aria-haspopup="dialog"
        >
          <CalendarPlus size={16} aria-hidden="true" />
          Nuovo appuntamento
        </button>
        <button type="button" className="btn" onClick={() => setModal({ kind: 'case' })} aria-haspopup="dialog">
          <FolderPlus size={16} aria-hidden="true" />
          Nuova pratica
        </button>
      </div>

      <dl className="cl-facts">
        <div className="cl-fact" data-alert={contact.stale || undefined}>
          <dt>Ultimo contatto</dt>
          <dd>
            {contact.label === 'Mai contattato' ? 'Mai' : capitalizeFirst(contact.label)}
            {client.lastContact && contact.days !== undefined && contact.days > 1 && (
              <span className="cl-fact-sub num">{formatDateShort(client.lastContact)}</span>
            )}
            {contact.stale && <span className="cl-fact-sub">Da ricontattare</span>}
          </dd>
        </div>
        <div className="cl-fact">
          <dt>Polizze</dt>
          <dd className="num">{formatNumber(client.policies.length)}</dd>
        </div>
        <div className="cl-fact">
          <dt>Premi annui</dt>
          <dd className="num">
            {totals.annualPremium > 0 ? formatMoney(totals.annualPremium) : '—'}
            {totals.singlePremium > 0 && (
              <span className="cl-fact-sub">+ {formatMoney(totals.singlePremium)} premi unici</span>
            )}
            {totals.recurringPayments > 0 && (
              <span className="cl-fact-sub">+ {formatMoney(totals.recurringPayments)} versamenti</span>
            )}
          </dd>
        </div>
        <div className="cl-fact">
          <dt>PAC mensili</dt>
          <dd className="num">
            {totals.monthlyPac > 0 ? formatMoney(totals.monthlyPac) : '—'}
            {totals.withPac > 0 && <span className="cl-fact-sub">{plural(totals.withPac, 'piano', 'piani')}</span>}
          </dd>
        </div>
      </dl>

      <Section title="Adempimenti">
        <ul className="cl-comp-list">
          {compliance.map((row) => (
            <ComplianceRow
              key={row.label}
              {...row}
              linkedTask={linkedTask(row.deadlineId)}
              onCreateTask={(due) =>
                createTask({ ...row.task, deadlineId: row.deadlineId, dueDate: taskDueFor(due, today), priority: 'alta' })
              }
            />
          ))}
        </ul>
      </Section>

      <Section title="Polizze" count={client.policies.length}>
        {client.policies.length === 0 ? (
          <p className="cl-section-empty">Nessuna polizza registrata.</p>
        ) : (
          <ul className="cl-pol-list">
            {client.policies.map((p) => (
              <PolicyItem key={p.id} policy={p} today={today} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Attività aperte" count={openTasks.length}>
        {openTasks.length === 0 ? (
          <p className="cl-section-empty">Nessuna attività aperta.</p>
        ) : (
          <ul className="cl-task-list" data-cl-tasks="">
            {openTasks.map((t) => (
              <TaskItem key={t.id} task={t} today={today} onToggle={toggleTask} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Appuntamenti">
        {appointments.upcoming.length === 0 && appointments.past.length === 0 ? (
          <p className="cl-section-empty">Nessun appuntamento registrato.</p>
        ) : (
          <div className="cl-appt-groups">
            <div>
              <h4 className="cl-subhead">Prossimo</h4>
              {appointments.upcoming.length === 0 ? (
                <p className="cl-section-empty">Nessun appuntamento in programma.</p>
              ) : (
                <ul className="cl-appt-list">
                  <AppointmentItem appointment={appointments.upcoming[0]} today={today} highlight />
                </ul>
              )}
              {appointments.upcoming.length > 1 && (
                <p className="cl-more">
                  {appointments.upcoming.length - 1 === 1
                    ? 'Un altro appuntamento in programma'
                    : `Altri ${appointments.upcoming.length - 1} appuntamenti in programma`}
                </p>
              )}
            </div>
            {appointments.past.length > 0 && (
              <div>
                <h4 className="cl-subhead">Ultimi incontri</h4>
                <ul className="cl-appt-list">
                  {appointments.past.slice(0, 3).map((a) => (
                    <AppointmentItem
                      key={a.id}
                      appointment={a}
                      today={today}
                      onRecordOutcome={() => setModal({ kind: 'appointment', appointment: a, focusOutcome: true })}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Pratiche" count={cases.length}>
        {cases.length === 0 ? (
          <p className="cl-section-empty">Nessuna pratica.</p>
        ) : (
          <ul className="cl-case-list">
            {cases.map((k) => (
              <CaseItem key={k.id} item={k} today={today} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Note">
        {client.notes ? (
          <p className="cl-notes">
            <StickyNote size={16} aria-hidden="true" />
            <span>{client.notes}</span>
          </p>
        ) : (
          <p className="cl-section-empty">Nessuna nota.</p>
        )}
        <p className="cl-privacy-hint">Nelle note evita dati sanitari, codici fiscali e numeri di polizza completi.</p>
      </Section>

      <ClientFormModal
        open={modal?.kind === 'edit'}
        onClose={close}
        client={client}
        onDeleted={() => onDeleted?.()}
      />
      <TaskFormModal
        open={modal?.kind === 'task'}
        onClose={close}
        defaults={modal?.kind === 'task' ? modal.defaults : { clientId: client.id }}
      />
      <AppointmentFormModal
        open={modal?.kind === 'appointment'}
        onClose={close}
        appointment={modal?.kind === 'appointment' ? modal.appointment : undefined}
        defaults={modal?.kind === 'appointment' ? modal.defaults : undefined}
        focusOutcome={modal?.kind === 'appointment' ? modal.focusOutcome : undefined}
      />
      <CaseFormModal open={modal?.kind === 'case'} onClose={close} defaults={{ clientId: client.id }} />
    </article>
  )
}

// ---------------------------------------------------------------- sezioni

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="cl-section">
      <h3 className="cl-section-title">
        {title}
        {count !== undefined && count > 0 && <span className="cl-section-count num">{formatNumber(count)}</span>}
      </h3>
      {children}
    </section>
  )
}

/** Scadenza proposta per l'attività: una settimana prima dell'adempimento, mai prima di oggi. */
function taskDueFor(due: DateKey | undefined, today: DateKey): DateKey {
  if (!due) return today
  const target = addDays(due, -7)
  return target < today ? today : target
}

const capitalizeFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** Premi e PAC: centesimi solo se presenti ("3.000 €", "1.200,50 €"). */
const formatMoney = (value: number) => formatCurrency(value, Number.isInteger(value) ? 0 : 2)

/** Etichetta di un valore facoltativo; undefined se assente o non riconosciuto (dati importati). */
const labelOf = <T extends string>(labels: Record<T, string>, value: T | undefined): string | undefined =>
  value !== undefined && Object.hasOwn(labels, value) ? labels[value] : undefined

interface ComplianceRowProps {
  icon: LucideIcon
  label: string
  feminine: boolean
  state: ComplianceState
  describe(due: DateKey, expired: boolean): string
  /** ID della scadenza calcolata corrispondente (vedi computeDeadlines), salvato nell'attività creata. */
  deadlineId: string
  task: { title: string; category: TaskCategory }
  /** Esito collegato all'adempimento (rischio AML, profilo di rischio): undefined = non registrato. */
  extra?: { label: string; value?: string; alert?: boolean }
}

function ComplianceRow({
  icon: Icon,
  label,
  feminine,
  state,
  describe,
  extra,
  linkedTask,
  onCreateTask,
}: ComplianceRowProps & { linkedTask?: Task; onCreateTask(due: DateKey | undefined): void }) {
  const tone = COMPLIANCE_TONE[state.status]
  const needsAction = state.status === 'scaduto' || state.status === 'in_scadenza'
  const relative = state.daysLeft === undefined ? undefined : formatRelativeDays(state.daysLeft)
  return (
    <li className="cl-comp-row">
      <span className="cl-comp-icon" data-tone={tone} aria-hidden="true">
        <Icon size={18} />
      </span>
      <div className="cl-comp-main">
        <span className="cl-comp-label">{label}</span>
        <span className="cl-comp-meta">
          {state.due ? describe(state.due, state.status === 'scaduto') : 'Nessuna data registrata'}
          {relative && <span className="num"> · {relative}</span>}
        </span>
        {extra && (
          <span className="cl-comp-extra">
            {extra.label}:{' '}
            <strong data-unset={extra.value === undefined || undefined} data-alert={extra.alert || undefined}>
              {extra.value ?? 'Non registrato'}
            </strong>
          </span>
        )}
      </div>
      <div className="cl-comp-side">
        <Pill tone={tone}>{complianceLabel(state.status, feminine)}</Pill>
        {needsAction &&
          (linkedTask ? (
            <a
              className="pill cl-comp-task"
              data-tone="positive"
              href={buildHref('attivita', { id: linkedTask.id })}
              title={`Apri l'attività collegata: ${linkedTask.title}`}
            >
              <Check size={12} aria-hidden="true" />
              Attività presente
              <span className="visually-hidden">: {linkedTask.title}</span>
            </a>
          ) : (
            <button
              type="button"
              className="icon-btn cl-icon-btn"
              onClick={() => onCreateTask(state.due)}
              aria-label={`Crea attività: ${label}`}
              title="Crea attività"
              aria-haspopup="dialog"
            >
              <ListPlus size={18} aria-hidden="true" />
            </button>
          ))}
      </div>
    </li>
  )
}

function PolicyItem({ policy: p, today }: { policy: Policy; today: DateKey }) {
  const matured = p.maturityDate !== undefined && p.maturityDate < today
  const daysToMaturity = p.maturityDate ? diffDays(today, p.maturityDate) : undefined
  const notStarted = p.startDate > today
  const candidate = !notStarted && !matured ? nextAnniversary(p.startDate, today) : undefined
  const anniversary =
    candidate !== undefined && candidate !== p.startDate && (!p.maturityDate || candidate < p.maturityDate)
      ? candidate
      : undefined
  const years = anniversary ? ageOn(p.startDate, anniversary) : undefined
  const premiumType = premiumTypeOf(p)

  return (
    <li className="cl-pol">
      <div className="cl-pol-head">
        <span className="cl-pol-kind">
          {POLICY_KIND_LABEL[p.kind]}
          {p.productName && <span className="cl-pol-product"> · {p.productName}</span>}
        </span>
        <span className="cl-pol-ref num" title="Ultime 4 cifre del numero di polizza">
          {p.ref}
        </span>
        {matured && <Pill tone="neutral">Scaduta</Pill>}
        {!matured && daysToMaturity !== undefined && daysToMaturity <= 60 && (
          <Pill tone="warning">{daysToMaturity === 0 ? 'Scade oggi' : `Scade ${formatRelativeDays(daysToMaturity)}`}</Pill>
        )}
        {notStarted && <Pill tone="primary">Decorre {formatRelativeDays(diffDays(today, p.startDate))}</Pill>}
      </div>
      <dl className="cl-pol-grid">
        <div>
          <dt>Decorrenza</dt>
          <dd className="num">{formatDateShort(p.startDate)}</dd>
        </div>
        <div>
          <dt>Scadenza</dt>
          <dd className="num">{p.maturityDate ? formatDateShort(p.maturityDate) : 'Nessuna'}</dd>
        </div>
        <div>
          <dt>{PREMIUM_TYPE_LABEL[premiumType]}</dt>
          <dd className="num">{p.annualPremium ? formatMoney(p.annualPremium) : '—'}</dd>
        </div>
        <div>
          <dt>PAC</dt>
          <dd className="num">
            {p.pac ? `${formatMoney(p.pac.amount)}/mese · giorno ${p.pac.dayOfMonth}` : '—'}
          </dd>
        </div>
        <div>
          <dt>Prossimo anniversario</dt>
          <dd className="num">
            {anniversary
              ? `${formatDayMonth(anniversary)} · ${formatRelativeDays(diffDays(today, anniversary))}${years ? ` (${years} ${years === 1 ? 'anno' : 'anni'})` : ''}`
              : '—'}
          </dd>
        </div>
      </dl>
    </li>
  )
}

function TaskItem({
  task,
  today,
  onToggle,
}: {
  task: Task
  today: DateKey
  onToggle(task: Task, control: HTMLElement): void
}) {
  const days = diffDays(today, task.dueDate)
  const late = days < 0
  return (
    <li className="cl-task">
      <label className="cl-task-check">
        <input
          type="checkbox"
          className="checkbox"
          checked={false}
          data-cl-toggle=""
          onChange={(e) => onToggle(task, e.currentTarget)}
        />
        <span className="visually-hidden">Completa: {task.title}</span>
      </label>
      <div className="cl-task-main">
        <a className="cl-task-title" href={buildHref('attivita', { id: task.id })}>
          {task.title}
        </a>
        <span className="cl-task-meta">
          <span>{TASK_CATEGORY_LABEL[task.category]}</span>
          {task.status === 'in_attesa' && <span>In attesa</span>}
          <span className={late ? 'cl-late num' : 'num'}>
            {late ? `in ritardo da ${formatNumber(-days)} gg` : days <= 1 ? formatRelativeDays(days) : formatDateShort(task.dueDate)}
            {task.dueTime && ` · ${task.dueTime}`}
          </span>
        </span>
      </div>
    </li>
  )
}

const OUTCOME_TONE: Record<AppointmentOutcome, Tone> = {
  positivo: 'positive',
  da_ricontattare: 'warning',
  negativo: 'negative',
}

function AppointmentItem({
  appointment: a,
  today,
  highlight = false,
  onRecordOutcome,
}: {
  appointment: Appointment
  today: DateKey
  highlight?: boolean
  onRecordOutcome?(): void
}) {
  const days = diffDays(today, a.date)
  return (
    <li className="cl-appt" data-highlight={highlight || undefined}>
      <span className="cl-appt-date" aria-hidden="true">
        <span className="cl-appt-day num">{a.date.slice(8, 10)}</span>
        <span className="cl-appt-month">{formatMonthShort(a.date)}</span>
      </span>
      <div className="cl-appt-main">
        <a className="cl-appt-title" href={buildHref('agenda', { giorno: a.date, vista: 'giorno' })}>
          <span className="visually-hidden">{formatDateShort(a.date)}, </span>
          {a.title}
        </a>
        <span className="cl-appt-meta num">
          {APPOINTMENT_TYPE_LABEL[a.type]} · {a.start}–{a.end}
          {highlight && ` · ${formatRelativeDays(days)}`}
        </span>
      </div>
      {!highlight && (
        <div className="cl-appt-side">
          {a.outcome ? (
            <Pill tone={OUTCOME_TONE[a.outcome]}>{APPOINTMENT_OUTCOME_LABEL[a.outcome]}</Pill>
          ) : onRecordOutcome ? (
            <button type="button" className="btn btn-ghost cl-outcome-btn" onClick={onRecordOutcome} aria-haspopup="dialog">
              Registra esito
              <span className="visually-hidden">: {a.title}</span>
            </button>
          ) : null}
        </div>
      )}
    </li>
  )
}

function CaseItem({ item: k, today }: { item: Case; today: DateKey }) {
  const open = k.status !== 'chiusa'
  const daysLeft = k.dueDate ? diffDays(today, k.dueDate) : undefined
  return (
    <li className="cl-case">
      <span className="cl-case-icon" aria-hidden="true">
        <FileText size={16} />
      </span>
      <div className="cl-case-main">
        <a className="cl-case-title" href={buildHref('pratiche', { id: k.id })}>
          {k.title}
        </a>
        <span className="cl-case-meta num">
          {CASE_TYPE_LABEL[k.type]} · aperta il {formatDateShort(k.openedOn)}
          {k.amount !== undefined && ` · ${formatCurrency(k.amount)}`}
          {open && daysLeft !== undefined && (
            <span className={daysLeft < 0 ? 'cl-late' : daysLeft <= 7 ? 'cl-soon' : undefined}>
              {' · '}
              {daysLeft < 0 ? `termine scaduto da ${formatNumber(-daysLeft)} gg` : `termine ${formatRelativeDays(daysLeft)}`}
            </span>
          )}
        </span>
      </div>
      <Pill tone={CASE_STATUS_TONE[k.status]}>{CASE_STATUS_LABEL[k.status]}</Pill>
    </li>
  )
}

/**
 * Completando un'attività la riga sparisce: per non perdere il focus (tastiera)
 * lo si porta sulla casella successiva o precedente.
 */
function keepFocusInList(control: HTMLElement) {
  const list = control.closest('[data-cl-tasks]')
  if (!list) return
  const all = Array.from(list.querySelectorAll<HTMLElement>('[data-cl-toggle]'))
  const index = all.indexOf(control)
  const neighbor = all[index + 1] ?? all[index - 1]
  window.requestAnimationFrame(() => {
    if (control.isConnected) return
    if (neighbor?.isConnected) neighbor.focus()
    else (document.querySelector<HTMLElement>('.cl-detail-name') ?? undefined)?.focus()
  })
}
