import type { LucideIcon } from 'lucide-react'
import { Cake, CalendarHeart, Check, ClipboardCheck, FileClock, FolderClock, IdCard, ListPlus, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Pill } from '../../components/ui/Pill'
import { DEADLINE_KIND_LABEL, DEADLINE_KIND_TONE } from '../../domain/labels'
import type { DateKey, Deadline, DeadlineKind, Task } from '../../domain/types'
import { buildHref } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useAppData } from '../../store/StoreContext'
import { clientNameById, indexById } from '../../store/selectors'
import { TaskFormModal } from '../tasks/TaskFormModal'
import {
  deadlineDaysLabel,
  deadlineDaysTone,
  deadlineHref,
  formatDeadlineDate,
  linkedTasksByDeadline,
  taskDefaultsForDeadline,
  toneVars,
} from './deadlineUtils'
import '../cases/cases.css'
import './deadlines.css'

export const DEADLINE_ICON: Record<DeadlineKind, LucideIcon> = {
  documento: IdCard,
  antiriciclaggio: ShieldCheck,
  adeguatezza: ClipboardCheck,
  scadenza_polizza: FileClock,
  anniversario_polizza: CalendarHeart,
  compleanno: Cake,
  pratica: FolderClock,
}

interface DeadlineListProps {
  deadlines: Deadline[]
  /** "Crea attività" sulla riga. */
  onCreateTask(deadline: Deadline): void
  /** Parametri aggiunti al link delle pratiche (es. { vista: 'scadenze' } per restare nello scadenzario). */
  caseParams?: Record<string, string | undefined>
  /** Etichetta accessibile della lista. */
  ariaLabel?: string
}

/**
 * Elenco di scadenze. Si adatta alla larghezza del contenitore (container query):
 * compatto nel widget della home, a colonne nello scadenzario.
 */
export function DeadlineList({ deadlines, onCreateTask, caseParams, ariaLabel }: DeadlineListProps) {
  const { tasks, clients } = useAppData()
  const { date: today } = useNow()
  const linkedTasks = useMemo(() => linkedTasksByDeadline(tasks, deadlines), [tasks, deadlines])
  const clientIndex = useMemo(() => indexById(clients), [clients])

  return (
    <ul className="cs-dl-list" aria-label={ariaLabel}>
      {deadlines.map((d) => (
        <DeadlineRow
          key={d.id}
          deadline={d}
          today={today}
          clientName={clientNameById(clientIndex, d.clientId)}
          task={linkedTasks.get(d.id)}
          href={deadlineHref(d, caseParams)}
          onCreateTask={onCreateTask}
        />
      ))}
    </ul>
  )
}

function DeadlineRow({
  deadline: d,
  today,
  clientName,
  task,
  href,
  onCreateTask,
}: {
  deadline: Deadline
  today: DateKey
  clientName: string
  /** Attività aperta già collegata alla scadenza. */
  task?: Task
  href: string
  onCreateTask(deadline: Deadline): void
}) {
  const Icon = DEADLINE_ICON[d.kind]
  const tone = deadlineDaysTone(d)
  // Il titolo delle pratiche non contiene il nome del cliente: lo aggiungiamo sotto.
  const sub = [d.kind === 'pratica' ? ['Pratica', clientName].filter(Boolean).join(' · ') : null, d.detail]
    .filter(Boolean)
    .join(' · ')

  // Tutta la riga apre la scadenza (link esteso sul titolo); il link all'attività resta sopra.
  return (
    <li className="cs-dl-row" data-severity={d.severity}>
      <div className="cs-dl-main" data-nosub={sub ? undefined : ''}>
        <span className="cs-dl-icon" style={toneVars(DEADLINE_KIND_TONE[d.kind])} title={DEADLINE_KIND_LABEL[d.kind]} aria-hidden="true">
          <Icon size={16} strokeWidth={2} />
        </span>
        <span className="cs-dl-body">
          <a className="cs-dl-title" href={href}>
            {d.title}
          </a>
          <span className="cs-dl-meta">
            <span className="cs-dl-days">
              <Pill tone={tone}>{deadlineDaysLabel(d.daysLeft)}</Pill>
            </span>
            <span className="cs-dl-date num">
              <span className="visually-hidden">Data: </span>
              {formatDeadlineDate(d.date, today)}
            </span>
            {sub && <span className="cs-dl-sub">{sub}</span>}
            {task && (
              <a
                className="pill cs-dl-task"
                data-tone="positive"
                href={buildHref('attivita', { id: task.id })}
                title={`Apri l'attività collegata: ${task.title}`}
              >
                <Check size={12} aria-hidden="true" />
                Attività presente
                <span className="visually-hidden">: {task.title}</span>
              </a>
            )}
          </span>
        </span>
      </div>
      <div className="cs-dl-action">
        {!task && (
          <button
            type="button"
            className="icon-btn cs-dl-add"
            onClick={() => onCreateTask(d)}
            aria-label={`Crea attività: ${d.title}`}
            title="Crea attività"
            aria-haspopup="dialog"
          >
            <ListPlus size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * Stato e finestra "Nuova attività" precompilata da una scadenza.
 * Uso: const { openTaskFor, taskModal } = useDeadlineTaskModal(); … {taskModal}
 */
export function useDeadlineTaskModal() {
  const { date: today } = useNow()
  const [target, setTarget] = useState<Deadline | null>(null)
  const taskModal = (
    <TaskFormModal
      open={target !== null}
      onClose={() => setTarget(null)}
      defaults={target ? taskDefaultsForDeadline(target, today) : undefined}
    />
  )
  return { openTaskFor: setTarget, taskModal }
}
