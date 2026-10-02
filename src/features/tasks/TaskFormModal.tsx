import type { Task } from '../../domain/types'
import type { NewTask } from '../../store/StoreContext'

export interface TaskFormModalProps {
  open: boolean
  onClose(): void
  /** Se presente: modifica di un'attività esistente. */
  task?: Task
  /** Valori iniziali per una nuova attività (es. clientId, dueDate, category, title). */
  defaults?: Partial<NewTask>
}

/** STUB — da implementare: form crea/modifica attività. */
export function TaskFormModal(props: TaskFormModalProps) {
  void props
  return null
}
