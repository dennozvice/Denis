/** Azioni sulle attività con conferma via toast e possibilità di annullare. */
import { useMemo } from 'react'
import { useToast } from '../../components/ui/Toast'
import type { Task } from '../../domain/types'
import { useNow } from '../../store/NowContext'
import { useActions } from '../../store/StoreContext'
import { formatDueForMessage, postponedDate } from './taskUtils'

export interface TaskCommands {
  /** Completa o riapre l'attività; il toast permette di annullare. */
  toggle(task: Task): void
  /** Sposta la scadenza di `days` giorni (da oggi se l'attività è in ritardo). */
  postpone(task: Task, days: number): void
  /** Elimina con "Annulla" nel toast. */
  remove(task: Task): void
}

export function useTaskCommands(): TaskCommands {
  const actions = useActions()
  const toast = useToast()
  const { date: today } = useNow()

  return useMemo<TaskCommands>(
    () => ({
      toggle(task) {
        const previous = { status: task.status, completedAt: task.completedAt }
        actions.toggleTask(task.id)
        toast({
          message: task.status === 'completata' ? 'Attività riaperta' : 'Attività completata',
          actionLabel: 'Annulla',
          onAction: () => actions.updateTask(task.id, previous),
        })
      },
      postpone(task, days) {
        const previousDate = task.dueDate
        const next = postponedDate(task, days, today)
        actions.updateTask(task.id, { dueDate: next })
        toast({
          message: `Attività rimandata a ${formatDueForMessage(next, today)}`,
          actionLabel: 'Annulla',
          onAction: () => actions.updateTask(task.id, { dueDate: previousDate }),
        })
      },
      remove(task) {
        actions.deleteTask(task.id)
        toast({
          message: 'Attività eliminata',
          actionLabel: 'Annulla',
          onAction: () => actions.restoreTask(task),
        })
      },
    }),
    [actions, toast, today],
  )
}
