import { CalendarClock, Flag, Pencil, Trash2 } from 'lucide-react'
import type { CSSProperties } from 'react'
import { PRIORITY_LABEL, PRIORITY_TONE, TASK_CATEGORY_LABEL, TONE_COLOR } from '../../domain/labels'
import type { DateKey, Task } from '../../domain/types'
import { diffDays } from '../../lib/dates'
import { capitalize, formatRelativeDays } from '../../lib/format'
import { buildHref } from '../../router/router'
import { completedOn, daysOverdue } from '../../store/selectors'
import { formatDueForMessage, formatDueShort, postponedDate } from './taskUtils'
import type { TaskCommands } from './useTaskCommands'
import './tasks.css'

interface TaskRowProps {
  task: Task
  today: DateKey
  clientName: string
  /** 'compact' = widget della home; 'full' = pagina Attività (colonna scadenza e più azioni). */
  variant: 'compact' | 'full'
  onEdit(task: Task): void
  commands: TaskCommands
}

/** Riga di un'attività: casella di completamento, titolo, cliente, categoria, ritardo, azioni rapide. */
export function TaskRow({ task, today, clientName, variant, onEdit, commands }: TaskRowProps) {
  const done = task.status === 'completata'
  const late = daysOverdue(task, today)
  const style = { '--tk-prio': TONE_COLOR[PRIORITY_TONE[task.priority]] } as CSSProperties
  const doneOn = done ? completedOn(task) : undefined
  const priorityLabel = `Priorità ${PRIORITY_LABEL[task.priority].toLowerCase()}`

  return (
    <li className={`tk-row tk-row-${variant}`} data-done={done || undefined} style={style}>
      <label className="tk-check">
        <input
          type="checkbox"
          className="checkbox"
          checked={done}
          data-tk-action="toggle"
          onChange={(e) => {
            keepFocusNearby(e.currentTarget, 'toggle')
            commands.toggle(task)
          }}
        />
        <span className="visually-hidden">{task.title}</span>
      </label>

      <div className="tk-main">
        <button type="button" className="tk-title" onClick={() => onEdit(task)}>
          {task.title}
        </button>
        <div className="tk-meta">
          <span className="visually-hidden">{priorityLabel}</span>
          {/* Indizio non solo cromatico: bandierina piena = alta, vuota = media, nessuna = bassa */}
          {task.priority !== 'bassa' && (
            <span className="tk-flag" data-priority={task.priority} title={priorityLabel} aria-hidden="true">
              <Flag size={12} fill={task.priority === 'alta' ? 'currentColor' : 'none'} />
            </span>
          )}
          <span className="tk-meta-clip">
            <span className="tk-meta-list">
              {task.clientId && clientName && (
                <a className="tk-client tk-sep" href={buildHref('clienti', { id: task.clientId })}>
                  {clientName}
                </a>
              )}
              <span className="tk-cat tk-sep">{TASK_CATEGORY_LABEL[task.category]}</span>
              {task.status === 'in_attesa' && <span className="tk-waiting tk-sep">In attesa</span>}
              {late > 0 && <span className="tk-late tk-sep">in ritardo da {late} gg</span>}
              {done && doneOn && variant === 'full' && (
                <span className="tk-done-on tk-sep">Completata {formatCompletion(doneOn, today)}</span>
              )}
            </span>
          </span>
        </div>
      </div>

      {variant === 'compact' ? (
        <div className="tk-slot">
          {task.dueTime && (
            <span className="tk-time num">
              <span className="visually-hidden">alle </span>
              {task.dueTime}
            </span>
          )}
          {!done && (
            <div className="tk-hover-actions">
              <button
                type="button"
                className="icon-btn tk-icon-btn"
                data-tk-action="postpone-1"
                onClick={(e) => {
                  keepFocusNearby(e.currentTarget, 'postpone-1')
                  commands.postpone(task, 1)
                }}
                aria-label={`Rimanda a domani: ${task.title}`}
                title="Rimanda a domani"
              >
                <CalendarClock size={18} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="tk-due num" data-late={late > 0 || undefined}>
            <span className="visually-hidden">Scadenza </span>
            <span className="tk-due-date">{formatDueShort(task.dueDate)}</span>
            {task.dueTime && <span className="tk-due-time">{task.dueTime}</span>}
          </div>
          <div className="tk-actions">
            {!done && (
              <>
                {/* Il nome accessibile inizia con il testo visibile (WCAG 2.5.3, comandi vocali) */}
                <button
                  type="button"
                  className="tk-postpone"
                  data-tk-action="postpone-1"
                  onClick={(e) => {
                    keepFocusNearby(e.currentTarget, 'postpone-1')
                    commands.postpone(task, 1)
                  }}
                  aria-label={`+1 g: ${postponeHint(task, 1, today)}, ${task.title}`}
                  title={capitalize(postponeHint(task, 1, today))}
                >
                  +1 g
                </button>
                <button
                  type="button"
                  className="tk-postpone"
                  data-tk-action="postpone-7"
                  onClick={(e) => {
                    keepFocusNearby(e.currentTarget, 'postpone-7')
                    commands.postpone(task, 7)
                  }}
                  aria-label={`+1 sett.: ${postponeHint(task, 7, today)}, ${task.title}`}
                  title={capitalize(postponeHint(task, 7, today))}
                >
                  +1 sett.
                </button>
              </>
            )}
            <button
              type="button"
              className="icon-btn tk-icon-btn"
              onClick={() => onEdit(task)}
              aria-label={`Modifica: ${task.title}`}
              title="Modifica"
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-btn tk-icon-btn tk-delete"
              data-tk-action="delete"
              onClick={(e) => {
                keepFocusNearby(e.currentTarget, 'delete')
                commands.remove(task)
              }}
              aria-label={`Elimina: ${task.title}`}
              title="Elimina"
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </li>
  )
}

/** "rimanda a domani", "rimanda a ven 9 ott": la data che si otterrà rimandando. */
function postponeHint(task: Task, days: number, today: DateKey): string {
  return `rimanda a ${formatDueForMessage(postponedDate(task, days, today), today)}`
}

function formatCompletion(day: DateKey, today: DateKey): string {
  const diff = diffDays(today, day)
  if (diff === 0 || diff === -1) return formatRelativeDays(diff)
  return `il ${formatDueShort(day)}`
}

/**
 * Dopo un'azione la riga può spostarsi in un altro gruppo o sparire: per non perdere il focus
 * (utenti da tastiera) lo si porta sullo stesso controllo della riga successiva (o precedente).
 */
function keepFocusNearby(control: HTMLElement, action: string) {
  const container = control.closest('[data-tk-container]') ?? document
  const controls = Array.from(container.querySelectorAll<HTMLElement>(`[data-tk-action="${action}"]`))
  const index = controls.indexOf(control)
  const neighbor = index >= 0 ? (controls[index + 1] ?? controls[index - 1]) : undefined
  window.requestAnimationFrame(() => {
    if (document.activeElement === control && control.isConnected) return
    if (document.activeElement && document.activeElement !== document.body) return
    if (neighbor?.isConnected) neighbor.focus()
    else if (control.isConnected) control.focus()
  })
}
