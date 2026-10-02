import { ChevronRight, GraduationCap, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Meter } from '../../components/ui/Meter'
import { useToast } from '../../components/ui/Toast'
import type { DateKey, Training } from '../../domain/types'
import { formatDayMonth } from '../../lib/format'
import { createId } from '../../lib/id'
import { useNow } from '../../store/NowContext'
import { useActions, useAppData } from '../../store/StoreContext'
import { formatHours, parseItalianNumber, trainingSummary } from './homeLogic'
import './home.css'

type Course = Training['courses'][number]

/** Aggiornamento professionale IVASS: ore svolte rispetto all'obbligo annuale e corsi pianificati. */
export function TrainingWidget() {
  const { training } = useAppData()
  const { setTraining } = useActions()
  const now = useNow()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const addButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)

  // Riferimento sempre aggiornato al piano formativo, per l'"Annulla" del toast.
  const latest = useRef(training)
  useEffect(() => {
    latest.current = training
  }, [training])

  useEffect(() => {
    if (!adding && restoreFocus.current) {
      restoreFocus.current = false
      addButton.current?.focus()
    }
  }, [adding])

  // Dopo una spunta il corso cambia elenco: il focus va su un elemento che esiste ancora.
  const baseId = useId()
  const checkboxId = (courseId: string) => `${baseId}-cb-${courseId}`
  const summaryId = `${baseId}-done`
  const addId = `${baseId}-add`
  const focusTarget = useRef<string | null>(null)
  useEffect(() => {
    const target = focusTarget.current
    if (!target) return
    focusTarget.current = null
    document.getElementById(target)?.focus()
  }, [training])

  const summary = trainingSummary(training)
  const outdated = training.year < now.year
  const pending = training.courses
    .filter((c) => !c.done)
    .sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31'))
  const completed = training.courses.filter((c) => c.done)
  const completedHours = summary.done

  const setDone = (id: string, done: boolean, base: Training) =>
    setTraining({ ...base, courses: base.courses.map((c) => (c.id === id ? { ...c, done } : c)) })

  const toggle = (course: Course) => {
    if (course.done) {
      focusTarget.current = checkboxId(course.id)
      setDone(course.id, false, training)
      return
    }
    const index = pending.findIndex((c) => c.id === course.id)
    const next = pending[index + 1] ?? pending[index - 1]
    focusTarget.current = next ? checkboxId(next.id) : summaryId
    setDone(course.id, true, training)
    toast({
      message: `«${course.title}» segnato come svolto`,
      actionLabel: 'Annulla',
      onAction: () => setDone(course.id, false, latest.current),
    })
  }

  const remove = (course: Course) => {
    const index = training.courses.findIndex((c) => c.id === course.id)
    const list = course.done ? completed : pending
    const position = list.findIndex((c) => c.id === course.id)
    const neighbor = list[position + 1] ?? list[position - 1]
    focusTarget.current = neighbor ? checkboxId(neighbor.id) : addId
    setTraining({ ...training, courses: training.courses.filter((c) => c.id !== course.id) })
    toast({
      message: `Corso «${course.title}» eliminato`,
      actionLabel: 'Annulla',
      onAction: () => {
        const current = latest.current
        if (current.courses.some((c) => c.id === course.id)) return
        const courses = [...current.courses]
        courses.splice(Math.min(index, courses.length), 0, course)
        setTraining({ ...current, courses })
      },
    })
  }

  const closeForm = () => {
    restoreFocus.current = true
    setAdding(false)
  }

  const add = (course: Omit<Course, 'id' | 'done'>) => {
    setTraining({ ...training, courses: [...training.courses, { ...course, id: createId('tr'), done: false }] })
    toast({ message: 'Corso aggiunto' })
    closeForm()
  }

  const startNewYear = () => {
    const previous = training
    setTraining({ year: now.year, hoursRequired: training.hoursRequired, courses: [] })
    toast({
      message: `Nuovo anno formativo ${now.year}`,
      actionLabel: 'Annulla',
      onAction: () => setTraining(previous),
    })
  }

  return (
    <Card
      className="hm-training"
      title={`Formazione IVASS ${training.year}`}
      subtitle={`Obbligo annuale: ${formatHours(training.hoursRequired)} ore`}
    >
      {outdated && (
        <div className="banner hm-training-banner">
          <span className="grow">
            Il piano si riferisce al {training.year}. Vuoi iniziare il {now.year}?
          </span>
          <button type="button" className="btn btn-sm hm-tap" onClick={startNewYear}>
            Inizia il {now.year}
          </button>
        </div>
      )}

      <div className="hm-train-summary">
        <div className="hm-train-hours">
          <span className="hm-train-big num">{formatHours(summary.done)}</span>
          <span className="text-2">
            / <span className="num">{formatHours(training.hoursRequired)}</span> ore svolte
          </span>
          <span className="hm-train-pct num">{Math.round(summary.progress * 100)}%</span>
        </div>
        <Meter
          value={summary.progress}
          label="Ore di formazione svolte rispetto all'obbligo annuale"
          tone={summary.remaining === 0 ? 'positive' : 'primary'}
        />
        <p className="small text-2">
          {summary.remaining > 0 ? (
            <>
              Mancano <strong className="num">{formatHours(summary.remaining)} ore</strong> entro il 31/12
              {summary.planned > 0 && (
                <span className="muted">
                  {' '}
                  · <span className="num">{formatHours(summary.planned)}</span> già pianificate
                </span>
              )}
            </>
          ) : (
            <span className="positive strong">Obbligo annuale completato</span>
          )}
        </p>
      </div>

      {training.courses.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Nessun corso" text="Aggiungi i corsi svolti o pianificati per tenere il conto delle ore." />
      ) : (
        <div className="hm-courses">
          {pending.length > 0 && (
            <div className="hm-course-group">
              <h3 className="hm-group-title">Da svolgere</h3>
              <ul className="hm-course-list" aria-label="Corsi da svolgere">
                {pending.map((course) => (
                  <CourseRow
                    key={course.id}
                    inputId={checkboxId(course.id)}
                    course={course}
                    today={now.date}
                    onToggle={toggle}
                    onRemove={remove}
                  />
                ))}
              </ul>
            </div>
          )}
          {completed.length > 0 && (
            <details className="hm-course-done">
              <summary id={summaryId} className="hm-course-summary">
                <ChevronRight className="hm-course-chevron" size={16} aria-hidden="true" />
                <span className="grow">Corsi svolti</span>
                <span className="xsmall muted num">
                  {completed.length} · {formatHours(completedHours)} ore
                </span>
              </summary>
              <ul className="hm-course-list" aria-label="Corsi svolti">
                {completed.map((course) => (
                  <CourseRow
                    key={course.id}
                    inputId={checkboxId(course.id)}
                    course={course}
                    today={now.date}
                    onToggle={toggle}
                    onRemove={remove}
                  />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {adding ? (
        <AddCourseForm onAdd={add} onCancel={closeForm} />
      ) : (
        <button ref={addButton} id={addId} type="button" className="btn btn-sm btn-ghost hm-tap hm-add-btn" onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden="true" />
          Aggiungi corso
        </button>
      )}
    </Card>
  )
}

function CourseRow({
  inputId,
  course,
  today,
  onToggle,
  onRemove,
}: {
  inputId: string
  course: Course
  today: DateKey
  onToggle(course: Course): void
  onRemove(course: Course): void
}) {
  let due: { text: string; className: string } | undefined
  if (course.dueDate && !course.done) {
    if (course.dueDate < today) due = { text: `scaduto il ${formatDayMonth(course.dueDate)}`, className: 'negative' }
    else if (course.dueDate === today) due = { text: 'entro oggi', className: 'hm-warning-text' }
    else due = { text: `entro il ${formatDayMonth(course.dueDate)}`, className: 'muted' }
  }
  return (
    <li className="hm-course" data-done={course.done || undefined}>
      <input
        id={inputId}
        type="checkbox"
        className="checkbox"
        checked={course.done}
        onChange={() => onToggle(course)}
      />
      <label htmlFor={inputId} className="hm-course-body">
        <span className="hm-course-title">{course.title}</span>
        <span className="hm-course-meta">
          <span className="num">{formatHours(course.hours)} h</span>
          {due && <span className={due.className}> · {due.text}</span>}
        </span>
      </label>
      <button
        type="button"
        className="icon-btn hm-course-remove"
        aria-label={`Elimina il corso ${course.title}`}
        title="Elimina corso"
        onClick={() => onRemove(course)}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </li>
  )
}

function AddCourseForm({ onAdd, onCancel }: { onAdd(course: Omit<Course, 'id' | 'done'>): void; onCancel(): void }) {
  const id = useId()
  const [title, setTitle] = useState('')
  const [hours, setHours] = useState('')
  const [errors, setErrors] = useState<{ title?: string; hours?: string }>({})

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const parsedHours = parseItalianNumber(hours)
    const next: typeof errors = {}
    if (!title.trim()) next.title = 'Inserisci il titolo'
    if (parsedHours === undefined || parsedHours <= 0 || parsedHours > 200) next.hours = 'Ore non valide'
    if (next.title || next.hours) {
      setErrors(next)
      document.getElementById(next.title ? `${id}-title` : `${id}-hours`)?.focus()
      return
    }
    onAdd({ title: title.trim(), hours: parsedHours as number })
  }

  return (
    <form
      className="hm-course-form"
      onSubmit={submit}
      noValidate
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
    >
      <div className="hm-course-form-fields">
        <div className="field grow">
          <label htmlFor={`${id}-title`} className="field-label">
            Titolo del corso
          </label>
          <input
            id={`${id}-title`}
            className="input"
            type="text"
            autoFocus
            autoComplete="off"
            value={title}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? `${id}-title-err` : undefined}
            onChange={(e) => {
              setTitle(e.target.value)
              if (errors.title) setErrors((x) => ({ ...x, title: undefined }))
            }}
          />
          {errors.title && (
            <span id={`${id}-title-err`} className="hm-field-error">
              {errors.title}
            </span>
          )}
        </div>
        <div className="field hm-course-hours">
          <label htmlFor={`${id}-hours`} className="field-label">
            Ore
          </label>
          <input
            id={`${id}-hours`}
            className="input num"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={hours}
            aria-invalid={errors.hours ? true : undefined}
            aria-describedby={errors.hours ? `${id}-hours-err` : undefined}
            onChange={(e) => {
              setHours(e.target.value)
              if (errors.hours) setErrors((x) => ({ ...x, hours: undefined }))
            }}
          />
          {errors.hours && (
            <span id={`${id}-hours-err`} className="hm-field-error">
              {errors.hours}
            </span>
          )}
        </div>
      </div>
      <div className="hm-form-actions">
        <button type="button" className="btn btn-sm hm-tap" onClick={onCancel}>
          Annulla
        </button>
        <button type="submit" className="btn btn-sm btn-primary hm-tap">
          <Plus size={14} aria-hidden="true" />
          Aggiungi
        </button>
      </div>
    </form>
  )
}
