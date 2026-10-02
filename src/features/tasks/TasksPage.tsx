import { CircleCheckBig, ListTodo, Plus, Search, SearchX, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Segmented } from '../../components/ui/Segmented'
import { PRIORITY_LABEL, TASK_CATEGORY_LABEL } from '../../domain/labels'
import type { Priority, Task, TaskCategory } from '../../domain/types'
import { formatNumber } from '../../lib/format'
import { navigate, useRoute } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useAppData } from '../../store/StoreContext'
import { clientNameById, indexById, isOpen } from '../../store/selectors'
import { TaskFormModal } from './TaskFormModal'
import { TaskRow } from './TaskRow'
import {
  clientSortName,
  countTasks,
  groupForPage,
  matchesSearch,
  sortClientsByLastName,
  type PageGroupId,
} from './taskUtils'
import { useTaskCommands } from './useTaskCommands'
import './tasks.css'

type StatusFilter = 'aperte' | 'completate' | 'tutte'
type ModalState = { mode: 'new' } | { mode: 'edit'; id: string } | null

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'aperte', label: 'Aperte' },
  { value: 'completate', label: 'Completate' },
  { value: 'tutte', label: 'Tutte' },
]
const CATEGORY_OPTIONS = Object.entries(TASK_CATEGORY_LABEL) as [TaskCategory, string][]
const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABEL) as [Priority, string][]
const NO_CLIENT = '__nessuno'
/** Quante attività completate mostrare prima del pulsante "Mostra altre". */
const DONE_PAGE = 20

/** Pagina Attività: elenco completo con ricerca, filtri e raggruppamento per scadenza. */
export function TasksPage() {
  const { tasks, clients } = useAppData()
  const { date: today } = useNow()
  const { params } = useRoute()
  const commands = useTaskCommands()

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('aperte')
  const [category, setCategory] = useState<TaskCategory | ''>('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [clientFilter, setClientFilter] = useState('')
  const [doneLimit, setDoneLimit] = useState(DONE_PAGE)
  const [modal, setModal] = useState<ModalState>(null)

  const clientIndex = useMemo(() => indexById(clients), [clients])

  // Il filtro cliente propone solo i clienti che hanno almeno un'attività.
  const clientOptions = useMemo(() => {
    const withTasks = new Set(tasks.map((t) => t.clientId).filter(Boolean))
    return sortClientsByLastName(clients.filter((c) => withTasks.has(c.id)))
  }, [tasks, clients])

  // Stessi selettori del KPI e del widget della Panoramica: i numeri coincidono.
  const counts = useMemo(() => countTasks(tasks, today), [tasks, today])

  const filtered = useMemo(
    () =>
      tasks.filter((t) => {
        if (status === 'aperte' && !isOpen(t)) return false
        if (status === 'completate' && isOpen(t)) return false
        if (category && t.category !== category) return false
        if (priority && t.priority !== priority) return false
        if (clientFilter === NO_CLIENT && t.clientId) return false
        if (clientFilter && clientFilter !== NO_CLIENT && t.clientId !== clientFilter) return false
        return matchesSearch(t, query, clientNameById(clientIndex, t.clientId))
      }),
    [tasks, status, category, priority, clientFilter, query, clientIndex],
  )
  const groups = useMemo(() => groupForPage(filtered, today), [filtered, today])

  const filtersActive = query.trim() !== '' || status !== 'aperte' || category !== '' || priority !== '' || clientFilter !== ''
  const resetFilters = () => {
    setQuery('')
    setStatus('aperte')
    setCategory('')
    setPriority('')
    setClientFilter('')
  }

  // Modale: aperta da un clic nella pagina oppure da un link diretto (#/attivita?id=…).
  const routeId = params.id
  const editId = modal?.mode === 'edit' ? modal.id : modal === null ? routeId : undefined
  const editing = editId ? tasks.find((t) => t.id === editId) : undefined
  const modalOpen = modal?.mode === 'new' || editing !== undefined
  const closeModal = () => {
    setModal(null)
    if (routeId) navigate('attivita', {}, true)
  }
  const openEdit = (task: Task) => setModal({ mode: 'edit', id: task.id })

  const subtitleParts = [
    `${formatNumber(counts.open)} aperte`,
    counts.late > 0 ? `${formatNumber(counts.late)} in ritardo` : null,
    `${formatNumber(counts.dueToday)} in scadenza oggi`,
    counts.doneToday > 0 ? `${formatNumber(counts.doneToday)} completate oggi` : null,
  ].filter(Boolean)

  return (
    <div className="page tk-page">
      <header className="page-header">
        <div>
          <h1>Attività</h1>
          <p>{tasks.length === 0 ? 'Nessuna attività registrata' : subtitleParts.join(' · ')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setModal({ mode: 'new' })}>
          <Plus size={18} aria-hidden="true" />
          Nuova attività
        </button>
      </header>

      <section className="card tk-toolbar" aria-label="Filtri attività">
        <div className="tk-toolbar-row">
          <div className="tk-search">
            <Search size={16} aria-hidden="true" className="tk-search-icon" />
            <label htmlFor="tk-search-input" className="visually-hidden">
              Cerca attività
            </label>
            <input
              id="tk-search-input"
              type="search"
              className="input tk-search-input"
              placeholder="Cerca per titolo, note o cliente…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
          <Segmented<StatusFilter>
            options={STATUS_OPTIONS}
            value={status}
            onChange={setStatus}
            ariaLabel="Stato delle attività"
          />
        </div>
        <div className="tk-toolbar-row">
          <label className="tk-filter">
            <span className="visually-hidden">Categoria</span>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value as TaskCategory | '')}>
              <option value="">Tutte le categorie</option>
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="tk-filter">
            <span className="visually-hidden">Priorità</span>
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')}>
              <option value="">Tutte le priorità</option>
              {PRIORITY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  Priorità {label.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="tk-filter">
            <span className="visually-hidden">Cliente</span>
            <select className="select" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="">Tutti i clienti</option>
              <option value={NO_CLIENT}>Senza cliente</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {clientSortName(c)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-ghost tk-reset" onClick={resetFilters} disabled={!filtersActive}>
            <X size={16} aria-hidden="true" />
            Azzera filtri
          </button>
        </div>
      </section>

      <p className="visually-hidden" aria-live="polite">
        {filtered.length === 1 ? '1 attività trovata' : `${formatNumber(filtered.length)} attività trovate`}
      </p>

      {groups.length === 0 ? (
        <div className="card">
          <PageEmpty
            hasTasks={tasks.length > 0}
            status={status}
            filtersActive={query.trim() !== '' || category !== '' || priority !== '' || clientFilter !== ''}
            onReset={resetFilters}
            onNew={() => setModal({ mode: 'new' })}
          />
        </div>
      ) : (
        <div className="card tk-list-card" data-tk-container>
          {groups.map((g) => {
            const limited = g.id === 'completate' ? g.tasks.slice(0, doneLimit) : g.tasks
            const hidden = g.tasks.length - limited.length
            return (
              <section key={g.id} className="tk-group tk-page-group" aria-labelledby={`tk-g-${g.id}`}>
                <h2 id={`tk-g-${g.id}`} className="tk-group-title" data-tone={groupTone(g.id)}>
                  {g.label} <span className="tk-count num">{g.tasks.length}</span>
                </h2>
                <ul className="tk-list">
                  {limited.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      today={today}
                      clientName={clientNameById(clientIndex, t.clientId)}
                      variant="full"
                      onEdit={openEdit}
                      commands={commands}
                    />
                  ))}
                </ul>
                {hidden > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm tk-more" onClick={() => setDoneLimit((n) => n + DONE_PAGE)}>
                    Mostra altre {formatNumber(Math.min(hidden, DONE_PAGE))} di {formatNumber(hidden)}
                  </button>
                )}
              </section>
            )
          })}
        </div>
      )}

      <TaskFormModal open={modalOpen} task={editing} onClose={closeModal} />
    </div>
  )
}

function groupTone(id: PageGroupId): string | undefined {
  if (id === 'ritardo') return 'late'
  if (id === 'oggi') return 'today'
  if (id === 'completate') return 'done'
  return undefined
}

function PageEmpty({
  hasTasks,
  status,
  filtersActive,
  onReset,
  onNew,
}: {
  hasTasks: boolean
  status: StatusFilter
  filtersActive: boolean
  onReset(): void
  onNew(): void
}) {
  if (!hasTasks) {
    return (
      <EmptyState
        icon={ListTodo}
        title="Nessuna attività"
        text="Crea la prima attività: richiami, documenti da raccogliere, pratiche da seguire."
        action={
          <button type="button" className="btn btn-primary" onClick={onNew}>
            <Plus size={16} aria-hidden="true" />
            Nuova attività
          </button>
        }
      />
    )
  }
  if (filtersActive) {
    return (
      <EmptyState
        icon={SearchX}
        title="Nessuna attività corrisponde ai filtri"
        text="Prova a cambiare la ricerca o ad azzerare i filtri."
        action={
          <button type="button" className="btn" onClick={onReset}>
            Azzera filtri
          </button>
        }
      />
    )
  }
  if (status === 'aperte') {
    return (
      <EmptyState
        icon={CircleCheckBig}
        title="Nessuna attività aperta"
        text="Hai completato tutto. Ottimo lavoro!"
        action={
          <button type="button" className="btn" onClick={onNew}>
            <Plus size={16} aria-hidden="true" />
            Nuova attività
          </button>
        }
      />
    )
  }
  return <EmptyState icon={ListTodo} title="Nessuna attività completata" text="Le attività completate compariranno qui." />
}
