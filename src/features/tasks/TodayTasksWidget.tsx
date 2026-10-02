import { ChevronRight, CircleCheckBig, ListTodo, Plus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Meter } from '../../components/ui/Meter'
import { useToast } from '../../components/ui/Toast'
import type { Task } from '../../domain/types'
import { formatNumber } from '../../lib/format'
import { buildHref } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useActions, useAppData } from '../../store/StoreContext'
import { clientNameById, indexById } from '../../store/selectors'
import { TaskFormModal } from './TaskFormModal'
import { TaskRow } from './TaskRow'
import { CATEGORY_GROUP_OPTIONS, groupToday, matchesCategoryGroup, type CategoryGroup } from './taskUtils'
import { useTaskCommands } from './useTaskCommands'
import './tasks.css'

type ModalState = { mode: 'new' } | { mode: 'edit'; id: string } | null

/** Widget della home: attività in ritardo, di oggi e completate oggi, con aggiunta rapida. */
export function TodayTasksWidget() {
  const { tasks, clients } = useAppData()
  const { date: today } = useNow()
  const actions = useActions()
  const toast = useToast()
  const commands = useTaskCommands()

  const [filter, setFilter] = useState<CategoryGroup>('tutte')
  const [showDone, setShowDone] = useState(false)
  const [modal, setModal] = useState<ModalState>(null)
  const [quickTitle, setQuickTitle] = useState('')

  const clientIndex = useMemo(() => indexById(clients), [clients])
  const groups = useMemo(() => groupToday(tasks, today), [tasks, today])

  const total = groups.overdue.length + groups.today.length + groups.done.length
  const doneCount = groups.done.length
  const visible = (list: Task[]) => list.filter((t) => matchesCategoryGroup(t, filter))
  const overdue = visible(groups.overdue)
  const todayOpen = visible(groups.today)
  const done = visible(groups.done)

  const editing = modal?.mode === 'edit' ? tasks.find((t) => t.id === modal.id) : undefined
  const modalOpen = modal?.mode === 'new' || editing !== undefined

  const openEdit = (task: Task) => setModal({ mode: 'edit', id: task.id })

  const quickAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = quickTitle.trim()
    if (!title) return
    actions.addTask({ title, category: 'altro', priority: 'media', dueDate: today })
    setQuickTitle('')
    // La nuova attività è nella categoria "Altro": se il filtro la nasconderebbe, lo azzeriamo.
    if (filter !== 'tutte' && filter !== 'altro') setFilter('tutte')
    toast({ message: 'Attività aggiunta per oggi' })
  }

  const renderRows = (list: Task[]) =>
    list.map((t) => (
      <TaskRow
        key={t.id}
        task={t}
        today={today}
        clientName={clientNameById(clientIndex, t.clientId)}
        variant="compact"
        onEdit={openEdit}
        commands={commands}
      />
    ))

  const subtitle =
    total === 0 ? 'Nessuna attività in programma' : `${formatNumber(doneCount)} di ${formatNumber(total)} completate`
  const tomorrowCount = groups.tomorrow.length
  const nothingVisible = overdue.length + todayOpen.length + done.length === 0

  return (
    <Card
      id="tk-oggi"
      className="tk-widget"
      title="Attività di oggi"
      subtitle={subtitle}
      actions={
        <>
          <button
            type="button"
            className="icon-btn tk-icon-btn"
            onClick={() => setModal({ mode: 'new' })}
            aria-label="Nuova attività"
            title="Nuova attività"
          >
            <Plus size={18} aria-hidden="true" />
          </button>
          <a className="card-link tk-see-all" href={buildHref('attivita')}>
            Vedi tutte
            <ChevronRight size={14} aria-hidden="true" />
          </a>
        </>
      }
      footer={
        tomorrowCount > 0 ? (
          <a className="card-link tk-tomorrow" href={buildHref('attivita')}>
            Domani: {formatNumber(tomorrowCount)} attività
            <ChevronRight size={14} aria-hidden="true" />
          </a>
        ) : undefined
      }
    >
      {total > 0 && (
        <div className="tk-progress">
          <Meter
            value={doneCount / total}
            label={`Attività di oggi completate: ${doneCount} di ${total}`}
            tone={doneCount === total ? 'positive' : 'primary'}
          />
          <span className="tk-progress-pct num" aria-hidden="true">
            {Math.round((doneCount / total) * 100)}%
          </span>
        </div>
      )}

      {total > 0 && (
        <div className="tk-chips" role="group" aria-label="Filtra per area">
          {CATEGORY_GROUP_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="chip tk-chip"
              aria-pressed={filter === o.value}
              onClick={() => setFilter(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {total === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Nessuna attività per oggi"
          text="Aggiungi un promemoria qui sotto o pianifica la giornata dalla pagina Attività."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setModal({ mode: 'new' })}>
              <Plus size={16} aria-hidden="true" />
              Nuova attività
            </button>
          }
        />
      ) : (
        <div className="tk-scroll" data-tk-container>
          {nothingVisible && <p className="tk-filter-empty">Nessuna attività di quest’area per oggi.</p>}

          {overdue.length > 0 && (
            <section className="tk-group" aria-labelledby="tk-oggi-ritardo">
              <h3 id="tk-oggi-ritardo" className="tk-group-title" data-tone="late">
                In ritardo <span className="tk-count num">{overdue.length}</span>
              </h3>
              <ul className="tk-list">{renderRows(overdue)}</ul>
            </section>
          )}

          {todayOpen.length > 0 && (
            <section className="tk-group" aria-labelledby="tk-oggi-oggi">
              <h3 id="tk-oggi-oggi" className="tk-group-title">
                Oggi <span className="tk-count num">{todayOpen.length}</span>
              </h3>
              <ul className="tk-list">{renderRows(todayOpen)}</ul>
            </section>
          )}

          {groups.overdue.length + groups.today.length === 0 && doneCount > 0 && (
            <p className="tk-all-done">
              <CircleCheckBig size={16} aria-hidden="true" />
              Hai completato tutte le attività di oggi.
            </p>
          )}

          {done.length > 0 && (
            <section className="tk-group">
              <h3 className="tk-group-title">
                <button
                  type="button"
                  className="tk-collapse"
                  aria-expanded={showDone}
                  aria-controls="tk-oggi-completate"
                  onClick={() => setShowDone((v) => !v)}
                >
                  <ChevronRight size={16} aria-hidden="true" className="tk-chevron" />
                  Completate <span className="tk-count num">{done.length}</span>
                </button>
              </h3>
              <ul id="tk-oggi-completate" className="tk-list" hidden={!showDone}>
                {renderRows(done)}
              </ul>
            </section>
          )}
        </div>
      )}

      <form className="tk-quickadd" onSubmit={quickAdd}>
        <label htmlFor="tk-quickadd-input" className="visually-hidden">
          Aggiungi attività per oggi
        </label>
        <Plus size={16} aria-hidden="true" className="tk-quickadd-icon" />
        <input
          id="tk-quickadd-input"
          className="input tk-quickadd-input"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="Aggiungi attività per oggi…"
          maxLength={200}
          autoComplete="off"
          enterKeyHint="done"
        />
        {quickTitle.trim() && (
          <button type="submit" className="btn btn-primary btn-sm tk-quickadd-btn">
            Aggiungi
          </button>
        )}
      </form>

      <TaskFormModal open={modalOpen} task={editing} onClose={() => setModal(null)} />
    </Card>
  )
}
