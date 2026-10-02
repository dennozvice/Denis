import { BellPlus, Cake, CalendarCheck, CalendarClock, CalendarPlus, ChevronRight, CircleCheck, Phone, UserCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pill } from '../../components/ui/Pill'
import { Segmented } from '../../components/ui/Segmented'
import { POLICY_KIND_LABEL } from '../../domain/labels'
import type { Client, Deadline, Task } from '../../domain/types'
import { diffDays, timeToMinutes } from '../../lib/dates'
import { capitalize, formatDateLong, formatNumber, formatRelativeDays, formatRelativeDaysChip } from '../../lib/format'
import { buildHref } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useAppData, type NewAppointment, type NewTask } from '../../store/StoreContext'
import {
  clientFullName,
  clientsToRecontact,
  computeDeadlines,
  findTaskForDeadline,
  indexById,
  isOpen,
  recurrenceDeadlines,
} from '../../store/selectors'
import { AppointmentFormModal } from '../agenda/AppointmentFormModal'
import { TaskFormModal } from '../tasks/TaskFormModal'
import { yearsAtAnniversary } from './clientUtils'
import './clients.css'

type Tab = 'ricorrenze' | 'ricontatti'
type WidgetModal = { kind: 'task'; defaults: Partial<NewTask> } | { kind: 'appointment'; defaults: Partial<NewAppointment> } | null

const MAX_ROWS = 6
const HORIZON_DAYS = 30

/** Widget della home: compleanni e anniversari di polizza nei prossimi 30 giorni, clienti da ricontattare. */
export function RecurrencesWidget() {
  const data = useAppData()
  const now = useNow()
  const today = now.date
  const [tab, setTab] = useState<Tab>('ricorrenze')
  const [modal, setModal] = useState<WidgetModal>(null)
  const [expanded, setExpanded] = useState(false)

  const clientIndex = useMemo(() => indexById(data.clients), [data.clients])
  const recurrences = useMemo(
    () => recurrenceDeadlines(computeDeadlines(data, today, { horizonDays: HORIZON_DAYS })),
    [data, today],
  )
  const recontact = useMemo(
    () => clientsToRecontact(data.clients, today, data.settings.recontactAfterDays),
    [data.clients, today, data.settings.recontactAfterDays],
  )

  /**
   * Attività aperta già collegata a ciascuna ricorrenza: prima per `deadlineId` (bday-…, ann-…);
   * per i promemoria creati a mano o prima del collegamento, attività "ricorrenza" dello stesso cliente e giorno.
   */
  const reminders = useMemo(() => {
    const legacy = new Map<string, Task>()
    for (const t of data.tasks) {
      if (t.category === 'ricorrenza' && t.clientId && !t.deadlineId && isOpen(t)) legacy.set(`${t.clientId}|${t.dueDate}`, t)
    }
    const map = new Map<string, Task>()
    for (const d of recurrences) {
      const task = findTaskForDeadline(data.tasks, d) ?? legacy.get(`${d.clientId}|${d.date}`)
      if (task) map.set(d.id, task)
    }
    return map
  }, [data.tasks, recurrences])

  /** Prossimo appuntamento in agenda per ciascun cliente (per non pianificarne un altro). */
  const nextMeeting = useMemo(() => {
    const map = new Map<string, { date: string; start: string }>()
    for (const a of data.appointments) {
      if (!a.clientId || a.status === 'annullato' || a.status === 'svolto') continue
      if (a.date < today || (a.date === today && timeToMinutes(a.end) <= now.minutes)) continue
      const current = map.get(a.clientId)
      if (!current || a.date < current.date || (a.date === current.date && a.start < current.start)) {
        map.set(a.clientId, { date: a.date, start: a.start })
      }
    }
    return map
  }, [data.appointments, today, now.minutes])

  const list = tab === 'ricorrenze' ? recurrences : recontact
  const total = list.length
  const limit = expanded ? total : MAX_ROWS
  const close = () => setModal(null)
  const changeTab = (next: Tab) => {
    setTab(next)
    setExpanded(false)
  }

  return (
    <Card
      id="cl-ricorrenze"
      className="cl-widget"
      title="Ricorrenze e ricontatti"
      subtitle={tab === 'ricorrenze' ? `Prossimi ${HORIZON_DAYS} giorni` : `Nessun contatto da oltre ${formatNumber(data.settings.recontactAfterDays)} giorni`}
      actions={
        <a className="card-link" href={buildHref('clienti', tab === 'ricontatti' ? { ordina: 'contatto' } : {})}>
          Vedi tutti
          {total > MAX_ROWS && <span className="visually-hidden"> ({formatNumber(total)})</span>}
          <ChevronRight size={14} aria-hidden="true" />
        </a>
      }
    >
      <Segmented<Tab>
        ariaLabel="Mostra"
        value={tab}
        onChange={changeTab}
        options={[
          { value: 'ricorrenze', label: `Ricorrenze (${formatNumber(recurrences.length)})` },
          { value: 'ricontatti', label: `Da ricontattare (${formatNumber(recontact.length)})` },
        ]}
      />

      {tab === 'ricorrenze' ? (
        recurrences.length === 0 ? (
          <EmptyState icon={Cake} title="Nessuna ricorrenza" text={`Nessun compleanno o anniversario di polizza nei prossimi ${HORIZON_DAYS} giorni.`} />
        ) : (
          <ul className="cl-wlist">
            {recurrences.slice(0, limit).map((d) => {
              const client = d.clientId ? clientIndex.get(d.clientId) : undefined
              if (!client) return null
              return (
                <RecurrenceRow
                  key={d.id}
                  deadline={d}
                  client={client}
                  reminder={reminders.get(d.id)}
                  onCreate={(defaults) => setModal({ kind: 'task', defaults })}
                />
              )
            })}
          </ul>
        )
      ) : recontact.length === 0 ? (
        <EmptyState icon={UserCheck} title="Tutti sentiti di recente" text="Nessun cliente con polizze attende un contatto." />
      ) : (
        <ul className="cl-wlist">
          {recontact.slice(0, limit).map(({ client, daysSince }) => {
            const name = clientFullName(client)
            const meeting = nextMeeting.get(client.id)
            return (
              <li key={client.id} className="cl-wrow cl-wrow-contact">
                <span className="cl-wicon" data-tone="warning" aria-hidden="true">
                  <Phone size={16} />
                </span>
                <a className="cl-wname" href={buildHref('clienti', { id: client.id })}>
                  {name}
                </a>
                <span className="cl-wmeta num">
                  {daysSince === undefined ? 'Mai contattato' : `Ultimo contatto ${formatNumber(daysSince)} gg fa`}
                </span>
                {meeting && (
                  <span className="cl-planned" title={`${capitalize(formatDateLong(meeting.date))} alle ${meeting.start}`}>
                    <CalendarCheck size={14} aria-hidden="true" />
                    In agenda {formatRelativeDays(diffDays(today, meeting.date))}
                    <span className="visually-hidden">
                      : {formatDateLong(meeting.date)} alle {meeting.start}
                    </span>
                  </span>
                )}
                {!meeting && (
                  <button
                    type="button"
                    className="btn cl-plan-btn"
                    aria-haspopup="dialog"
                    onClick={() =>
                      setModal({
                        kind: 'appointment',
                        defaults: { clientId: client.id, type: 'revisione_portafoglio', title: 'Revisione portafoglio' },
                      })
                    }
                  >
                    <CalendarPlus size={16} aria-hidden="true" />
                    Pianifica
                    <span className="visually-hidden">: {name}</span>
                  </button>
                )}
                {client.phone && (
                  <a
                    className="icon-btn cl-icon-btn cl-wcall"
                    href={`tel:${client.phone.replace(/[^\d+]/g, '')}`}
                    aria-label={`Chiama ${name}`}
                    title={`Chiama ${client.phone}`}
                  >
                    <Phone size={18} aria-hidden="true" />
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {total > MAX_ROWS && (
        <button type="button" className="btn btn-ghost cl-wmore" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Mostra meno' : `Mostra ${tab === 'ricorrenze' ? 'tutte' : 'tutti'} (${formatNumber(total)})`}
        </button>
      )}

      <TaskFormModal open={modal?.kind === 'task'} onClose={close} defaults={modal?.kind === 'task' ? modal.defaults : undefined} />
      <AppointmentFormModal
        open={modal?.kind === 'appointment'}
        onClose={close}
        defaults={modal?.kind === 'appointment' ? modal.defaults : undefined}
      />
    </Card>
  )
}

function RecurrenceRow({
  deadline: d,
  client,
  reminder,
  onCreate,
}: {
  deadline: Deadline
  client: Client
  reminder?: Task
  onCreate(defaults: Partial<NewTask>): void
}) {
  const name = clientFullName(client)
  const birthday = d.kind === 'compleanno'
  const policy = birthday ? undefined : client.policies.find((p) => d.id === `ann-${p.id}-${d.date}`)
  const Icon = birthday ? Cake : CalendarClock

  let title: string
  let detail: string | undefined
  if (birthday) {
    const age = client.birthDate ? yearsAtAnniversary(client.birthDate, d.date) : undefined
    title = age !== undefined ? `Compie ${age} anni` : 'Compleanno'
    detail = d.detail
  } else {
    const years = policy ? yearsAtAnniversary(policy.startDate, d.date) : undefined
    title = years ? `Anniversario · ${years} ${years === 1 ? 'anno' : 'anni'}` : 'Anniversario polizza'
    detail = policy ? `${POLICY_KIND_LABEL[policy.kind]} ${policy.ref}` : d.detail
  }
  const reminderTitle = birthday ? `Auguri a ${name}` : `Anniversario polizza: ${name}`
  const days = d.daysLeft

  return (
    <li className="cl-wrow cl-wrow-rec">
      <span className="cl-wicon" data-tone={birthday ? 'violet' : 'accent'} aria-hidden="true">
        <Icon size={16} />
      </span>
      <a className="cl-wname" href={buildHref('clienti', { id: client.id })}>
        {name}
      </a>
      <span className="cl-wmeta">{title}</span>
      {detail && <span className="cl-wdetail">{detail}</span>}
      <span className="cl-wwhen" title={capitalize(formatDateLong(d.date))}>
        <Pill tone={days === 0 ? 'primary' : 'neutral'}>{formatRelativeDaysChip(days)}</Pill>
        <span className="visually-hidden">, {formatDateLong(d.date)}</span>
      </span>
      {reminder ? (
        <a
          className="icon-btn cl-icon-btn cl-wact cl-reminder-done"
          href={buildHref('attivita', { id: reminder.id })}
          aria-label={`Attività presente: ${reminder.title}`}
          title="Attività presente: apri il promemoria"
        >
          <CircleCheck size={18} aria-hidden="true" />
        </a>
      ) : (
        <button
          type="button"
          className="icon-btn cl-icon-btn cl-wact"
          aria-haspopup="dialog"
          aria-label={`Crea promemoria: ${reminderTitle}`}
          title="Crea promemoria"
          onClick={() =>
            onCreate({
              title: reminderTitle,
              category: 'ricorrenza',
              clientId: client.id,
              deadlineId: d.id,
              dueDate: d.date,
              priority: 'media',
            })
          }
        >
          <BellPlus size={18} aria-hidden="true" />
        </button>
      )}
    </li>
  )
}
