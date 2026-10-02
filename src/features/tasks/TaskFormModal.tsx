import { Trash2 } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Segmented } from '../../components/ui/Segmented'
import { useToast } from '../../components/ui/Toast'
import { PRIORITY_LABEL, TASK_CATEGORY_LABEL, TASK_STATUS_LABEL } from '../../domain/labels'
import type { Priority, Task, TaskCategory, TaskStatus } from '../../domain/types'
import { isDateKey, isTimeKey, nowIso } from '../../lib/dates'
import { useNow } from '../../store/NowContext'
import { useActions, useAppData, type NewTask } from '../../store/StoreContext'
import { clientSortName, sortClientsByLastName } from './taskUtils'
import './tasks.css'

export interface TaskFormModalProps {
  open: boolean
  onClose(): void
  /** Se presente: modifica di un'attività esistente. */
  task?: Task
  /** Valori iniziali per una nuova attività (es. clientId, dueDate, category, title). */
  defaults?: Partial<NewTask>
}

const FORM_ID = 'tk-task-form'

const CATEGORY_OPTIONS = Object.entries(TASK_CATEGORY_LABEL) as [TaskCategory, string][]
const PRIORITY_OPTIONS = (['alta', 'media', 'bassa'] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))
const STATUS_OPTIONS = (['da_fare', 'in_attesa', 'completata'] as TaskStatus[]).map((s) => ({
  value: s,
  label: TASK_STATUS_LABEL[s],
}))

/** Form crea/modifica attività in una finestra modale. */
export function TaskFormModal({ open, onClose, task, defaults }: TaskFormModalProps) {
  const actions = useActions()
  const toast = useToast()

  const remove = () => {
    if (!task) return
    actions.deleteTask(task.id)
    toast({ message: 'Attività eliminata', actionLabel: 'Annulla', onAction: () => actions.restoreTask(task) })
    onClose()
  }

  return (
    <Modal
      open={open}
      title={task ? 'Modifica attività' : 'Nuova attività'}
      onClose={onClose}
      footer={
        <>
          {task && (
            <button type="button" className="btn btn-danger tk-modal-delete" onClick={remove}>
              <Trash2 size={16} aria-hidden="true" />
              Elimina
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" form={FORM_ID} className="btn btn-primary">
            {task ? 'Salva' : 'Crea attività'}
          </button>
        </>
      }
    >
      {open && <TaskForm key={task?.id ?? 'new'} task={task} defaults={defaults} onDone={onClose} />}
    </Modal>
  )
}

interface FormState {
  title: string
  category: TaskCategory
  priority: Priority
  dueDate: string
  dueTime: string
  clientId: string
  status: TaskStatus
  notes: string
}

type Errors = Partial<Record<'title' | 'dueDate' | 'dueTime', string>>

function TaskForm({ task, defaults, onDone }: { task?: Task; defaults?: Partial<NewTask>; onDone(): void }) {
  const { clients } = useAppData()
  const actions = useActions()
  const toast = useToast()
  const { date: today } = useNow()
  const uid = useId()
  const titleRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>(() => {
    const src: Partial<NewTask> = task ?? defaults ?? {}
    return {
      title: src.title ?? '',
      category: src.category ?? 'altro',
      priority: src.priority ?? 'media',
      dueDate: src.dueDate ?? today,
      dueTime: src.dueTime ?? '',
      clientId: src.clientId ?? '',
      status: src.status ?? 'da_fare',
      notes: src.notes ?? '',
    }
  })
  const [errors, setErrors] = useState<Errors>({})

  const sortedClients = useMemo(() => sortClientsByLastName(clients), [clients])
  // Un cliente eliminato nel frattempo resta selezionabile solo come "Nessun cliente".
  const clientExists = form.clientId === '' || clients.some((c) => c.id === form.clientId)

  // Il <dialog> sposta il focus sul primo elemento all'apertura: lo riportiamo sul titolo subito dopo.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const validate = (f: FormState): Errors => {
    const e: Errors = {}
    if (!f.title.trim()) e.title = 'Inserisci un titolo.'
    else if (f.title.trim().length > 200) e.title = 'Il titolo può avere al massimo 200 caratteri.'
    if (!f.dueDate) e.dueDate = 'Inserisci la data di scadenza.'
    else if (!isDateKey(f.dueDate)) e.dueDate = 'Data non valida.'
    if (f.dueTime && !isTimeKey(f.dueTime)) e.dueTime = 'Orario non valido (formato hh:mm).'
    return e
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const found = validate(form)
    setErrors(found)
    const invalid = found.title ? titleRef : found.dueDate ? dateRef : found.dueTime ? timeRef : null
    if (invalid) {
      invalid.current?.focus()
      return
    }

    const clientId = form.clientId && clientExists ? form.clientId : undefined
    const base = {
      title: form.title.trim(),
      category: form.category,
      priority: form.priority,
      dueDate: form.dueDate,
      dueTime: form.dueTime || undefined,
      clientId,
      notes: form.notes.trim() || undefined,
    }

    if (task) {
      const statusPatch: Partial<Task> = { status: form.status }
      if (form.status === 'completata' && task.status !== 'completata') statusPatch.completedAt = nowIso()
      if (form.status !== 'completata') statusPatch.completedAt = undefined
      actions.updateTask(task.id, { ...base, ...statusPatch })
      toast({ message: 'Attività aggiornata' })
    } else {
      const input: NewTask = { ...base }
      if (defaults?.status) input.status = defaults.status
      actions.addTask(input)
      toast({ message: 'Attività creata' })
    }
    onDone()
  }

  const errId = (key: keyof Errors) => (errors[key] ? `${uid}-${key}-err` : undefined)

  return (
    <form id={FORM_ID} className="form tk-form" onSubmit={submit} noValidate>
      <div className="form-grid">
        <label className="field span-2">
          <span>
            Titolo <span className="tk-required" aria-hidden="true">*</span>
          </span>
          <input
            ref={titleRef}
            className="input"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Es. Richiamare per la revisione del portafoglio"
            required
            maxLength={200}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errId('title')}
            autoComplete="off"
          />
          {errors.title && (
            <span id={errId('title')} className="tk-error" role="alert">
              {errors.title}
            </span>
          )}
        </label>

        <label className="field">
          <span>Categoria</span>
          <select className="select" value={form.category} onChange={(e) => set('category', e.target.value as TaskCategory)}>
            {CATEGORY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span className="field-label" aria-hidden="true">
            Priorità
          </span>
          <Segmented
            options={PRIORITY_OPTIONS}
            value={form.priority}
            onChange={(v) => set('priority', v)}
            ariaLabel="Priorità"
          />
        </div>

        <label className="field">
          <span>
            Scadenza <span className="tk-required" aria-hidden="true">*</span>
          </span>
          <input
            ref={dateRef}
            type="date"
            className="input"
            value={form.dueDate}
            onChange={(e) => set('dueDate', e.target.value)}
            required
            aria-invalid={errors.dueDate ? true : undefined}
            aria-describedby={errId('dueDate')}
          />
          {errors.dueDate && (
            <span id={errId('dueDate')} className="tk-error" role="alert">
              {errors.dueDate}
            </span>
          )}
        </label>

        <label className="field">
          <span>Orario (facoltativo)</span>
          <input
            ref={timeRef}
            type="time"
            className="input"
            value={form.dueTime}
            onChange={(e) => set('dueTime', e.target.value)}
            aria-invalid={errors.dueTime ? true : undefined}
            aria-describedby={errId('dueTime')}
          />
          {errors.dueTime && (
            <span id={errId('dueTime')} className="tk-error" role="alert">
              {errors.dueTime}
            </span>
          )}
        </label>

        <label className="field span-2">
          <span>Cliente</span>
          <select
            className="select"
            value={clientExists ? form.clientId : ''}
            onChange={(e) => set('clientId', e.target.value)}
          >
            <option value="">Nessun cliente</option>
            {sortedClients.map((c) => (
              <option key={c.id} value={c.id}>
                {clientSortName(c)}
              </option>
            ))}
          </select>
        </label>

        {task && (
          <div className="field span-2">
            <span className="field-label" aria-hidden="true">
              Stato
            </span>
            <Segmented options={STATUS_OPTIONS} value={form.status} onChange={(v) => set('status', v)} ariaLabel="Stato" />
          </div>
        )}

        <label className="field span-2">
          <span>Note</span>
          <textarea
            className="textarea"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            placeholder="Dettagli utili, documenti da chiedere, esito della telefonata…"
          />
        </label>
      </div>
      <p className="field-hint">
        <span aria-hidden="true">*</span> Campi obbligatori
      </p>
    </form>
  )
}
