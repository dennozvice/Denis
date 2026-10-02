import { FolderOpen, Pencil, Plus, Search, SearchX, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Segmented } from '../../components/ui/Segmented'
import { useToast } from '../../components/ui/Toast'
import { CASE_TYPE_LABEL } from '../../domain/labels'
import type { Case, CaseStatus, CaseType, DateKey } from '../../domain/types'
import { formatDateShort, formatNumber } from '../../lib/format'
import { buildHref } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useActions, useAppData } from '../../store/StoreContext'
import { clientNameById, indexById } from '../../store/selectors'
import { CaseDue, CaseStatusSelect, CaseTypeIcon, formatCaseAmount } from './CaseBits'
import {
  caseAgeDays,
  caseAgeShort,
  casesCountLabel,
  isCaseOpen,
  matchesCaseSearch,
  matchesStatusFilter,
  neighbourCaseId,
  sortCasesForList,
  statusChangeMessage,
  type CaseStatusFilter,
} from './caseUtils'
import './cases.css'

const STATUS_OPTIONS: { value: CaseStatusFilter; label: string }[] = [
  { value: 'aperte', label: 'Aperte' },
  { value: 'chiuse', label: 'Chiuse' },
  { value: 'tutte', label: 'Tutte' },
]
const TYPE_OPTIONS = Object.entries(CASE_TYPE_LABEL) as [CaseType, string][]

/** Il focus è andato perso (l'elemento attivo è stato tolto dalla pagina)? */
const focusLost = () => !document.activeElement || document.activeElement === document.body

/** Scheda "Pratiche": ricerca, filtri e elenco (tabella su schermi larghi, schede su mobile). */
export function CasesList({ onEdit, onNew }: { onEdit(c: Case): void; onNew(): void }) {
  const { cases, clients } = useAppData()
  const { date: today } = useNow()
  const actions = useActions()
  const toast = useToast()

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<CaseStatusFilter>('aperte')
  const [type, setType] = useState<CaseType | ''>('')
  const listRef = useRef<HTMLDivElement>(null)
  /** Intestazione dell'elenco (o riquadro "nessuna pratica"): ripiego per il focus. */
  const resultsRef = useRef<HTMLElement>(null)

  const clientIndex = useMemo(() => indexById(clients), [clients])
  const filtered = useMemo(
    () =>
      sortCasesForList(
        cases.filter(
          (c) =>
            matchesStatusFilter(c, status) &&
            (!type || c.type === type) &&
            matchesCaseSearch(c, query, clientNameById(clientIndex, c.clientId)),
        ),
      ),
    [cases, status, type, query, clientIndex],
  )

  const filtersActive = query.trim() !== '' || status !== 'aperte' || type !== ''

  /**
   * Dopo il prossimo aggiornamento, se il focus è andato perso (riga sparita, pulsante nascosto),
   * lo porta su un controllo della pratica `id` (nella vista visibile: tabella o schede) oppure sull'intestazione.
   */
  const restoreFocus = (id: string | undefined, selector = '.cs-status-select') => {
    window.requestAnimationFrame(() => {
      if (!focusLost()) return
      const candidates = id ? listRef.current?.querySelectorAll<HTMLElement>(`[data-case-id="${id}"] ${selector}`) : undefined
      const target = candidates ? [...candidates].find((el) => el.getClientRects().length > 0) : undefined
      ;(target ?? resultsRef.current)?.focus()
    })
  }

  const resetFilters = () => {
    setQuery('')
    setStatus('aperte')
    setType('')
    restoreFocus(undefined)
  }

  const showAll = () => {
    setStatus('tutte')
    restoreFocus(undefined)
  }

  const remove = (c: Case) => {
    actions.deleteCase(c.id)
    toast({
      message: 'Pratica eliminata',
      actionLabel: 'Annulla',
      onAction: () => {
        actions.restoreCase(c)
        restoreFocus(c.id, '.cs-case-title')
      },
    })
    restoreFocus(neighbourCaseId(filtered, c.id), '.cs-case-title')
  }

  /** Cambio di stato dall'elenco: se la pratica esce dal filtro il focus passa alla riga successiva. */
  const changeStatus = (c: Case, next: CaseStatus) => {
    const prev = c.status
    const leaves = !matchesStatusFilter({ status: next }, status)
    actions.updateCase(c.id, { status: next })
    toast({
      message: statusChangeMessage(c.title, next, status),
      actionLabel: 'Annulla',
      onAction: () => {
        actions.updateCase(c.id, { status: prev })
        restoreFocus(c.id)
      },
    })
    if (leaves) restoreFocus(neighbourCaseId(filtered, c.id))
  }

  const rowProps = (c: Case) => ({
    caseItem: c,
    today,
    clientName: clientNameById(clientIndex, c.clientId),
    onEdit,
    onDelete: remove,
    onStatusChange: changeStatus,
  })

  return (
    <>
      <section className="card cs-toolbar" aria-label="Filtri pratiche">
        <div className="cs-toolbar-row">
          <div className="cs-search">
            <Search size={16} aria-hidden="true" className="cs-search-icon" />
            <label htmlFor="cs-search-input" className="visually-hidden">
              Cerca pratiche
            </label>
            <input
              id="cs-search-input"
              type="search"
              className="input cs-search-input"
              placeholder="Cerca per titolo, cliente o note…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
          <Segmented<CaseStatusFilter> options={STATUS_OPTIONS} value={status} onChange={setStatus} ariaLabel="Stato delle pratiche" />
          <label className="cs-filter">
            <span className="visually-hidden">Tipo di pratica</span>
            <select className="select" value={type} onChange={(e) => setType(e.target.value as CaseType | '')}>
              <option value="">Tutti i tipi</option>
              {TYPE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-ghost cs-reset" onClick={resetFilters} disabled={!filtersActive}>
            <X size={16} aria-hidden="true" />
            Azzera filtri
          </button>
        </div>
      </section>

      <p className="visually-hidden" aria-live="polite">
        {filtered.length === 1 ? '1 pratica trovata' : `${formatNumber(filtered.length)} pratiche trovate`}
      </p>

      {filtered.length === 0 ? (
        <div className="card cs-empty" ref={(el) => void (resultsRef.current = el)} tabIndex={-1}>
          {cases.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="Nessuna pratica"
              text="Registra riscatti, sinistri, liquidazioni, variazioni di beneficiario, switch, anticipazioni, trasferimenti e reclami per seguirne lo stato."
              action={
                <button type="button" className="btn btn-primary" onClick={onNew}>
                  <Plus size={16} aria-hidden="true" />
                  Nuova pratica
                </button>
              }
            />
          ) : query.trim() !== '' || type !== '' ? (
            <EmptyState
              icon={SearchX}
              title="Nessuna pratica corrisponde ai filtri"
              text="Prova a cambiare la ricerca o ad azzerare i filtri."
              action={
                <button type="button" className="btn" onClick={resetFilters}>
                  Azzera filtri
                </button>
              }
            />
          ) : status === 'aperte' ? (
            <EmptyState
              icon={FolderOpen}
              title="Nessuna pratica aperta"
              text="Tutte le pratiche sono chiuse."
              action={
                <button type="button" className="btn" onClick={showAll}>
                  Mostra tutte
                </button>
              }
            />
          ) : (
            <EmptyState icon={FolderOpen} title="Nessuna pratica chiusa" text="Le pratiche chiuse compariranno qui." />
          )}
        </div>
      ) : (
        <div className="cs-cases" ref={listRef}>
          <h2 className="cs-results-title" ref={(el) => void (resultsRef.current = el)} tabIndex={-1}>
            {casesCountLabel(filtered.length, status)}
          </h2>
          <div className="cs-cases-inner">
            <div className="cs-table-view">
              <table className="table cs-table">
                <caption className="visually-hidden">Elenco pratiche</caption>
                <thead>
                  <tr>
                    <th scope="col">Pratica</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Aperta il</th>
                    <th scope="col">Scadenza</th>
                    <th scope="col">Stato</th>
                    <th scope="col" className="num">
                      Importo
                    </th>
                    <th scope="col">
                      <span className="visually-hidden">Azioni</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <CaseTableRow key={c.id} {...rowProps(c)} />
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="cs-card-view" aria-label="Elenco pratiche">
              {filtered.map((c) => (
                <CaseCardItem key={c.id} {...rowProps(c)} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}

interface RowProps {
  caseItem: Case
  today: DateKey
  clientName: string
  onEdit(c: Case): void
  onDelete(c: Case): void
  onStatusChange(c: Case, next: CaseStatus): void
}

function ClientLink({ clientId, clientName }: { clientId?: string; clientName: string }) {
  if (!clientId || !clientName) {
    return (
      <span className="muted">
        <span aria-hidden="true">—</span>
        <span className="visually-hidden">Nessun cliente</span>
      </span>
    )
  }
  return (
    <a className="cs-client-link" href={buildHref('clienti', { id: clientId })}>
      {clientName}
    </a>
  )
}

function RowActions({ caseItem, onEdit, onDelete }: Pick<RowProps, 'caseItem' | 'onEdit' | 'onDelete'>) {
  return (
    <div className="cs-row-actions">
      <button
        type="button"
        className="icon-btn cs-icon-btn"
        onClick={() => onEdit(caseItem)}
        aria-label={`Modifica: ${caseItem.title}`}
        title="Modifica"
        aria-haspopup="dialog"
      >
        <Pencil size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-btn cs-icon-btn cs-icon-danger"
        onClick={() => onDelete(caseItem)}
        aria-label={`Elimina: ${caseItem.title}`}
        title="Elimina"
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

function CaseTableRow({ caseItem: c, today, clientName, onEdit, onDelete, onStatusChange }: RowProps) {
  const open = isCaseOpen(c)
  return (
    <tr data-case-id={c.id} data-closed={open ? undefined : 'true'}>
      <td className="cs-td-case">
        <div className="cs-case-cell">
          <CaseTypeIcon type={c.type} />
          <div className="cs-case-text">
            <span className="cs-case-type">{CASE_TYPE_LABEL[c.type]}</span>
            <button type="button" className="cs-case-title" onClick={() => onEdit(c)} aria-haspopup="dialog">
              {c.title}
            </button>
          </div>
        </div>
      </td>
      <td className="cs-td-client">
        <ClientLink clientId={c.clientId} clientName={clientName} />
      </td>
      <td className="cs-td-opened">
        <span className="num">{formatDateShort(c.openedOn)}</span>
        {open && <span className="cs-sub">{caseAgeShort(caseAgeDays(c, today))}</span>}
      </td>
      <td className="cs-td-due">
        <CaseDue caseItem={c} today={today} />
      </td>
      <td className="cs-td-status">
        <CaseStatusSelect caseItem={c} onCommit={(next) => onStatusChange(c, next)} />
      </td>
      <td className="num cs-td-amount">
        {c.amount !== undefined ? (
          formatCaseAmount(c.amount)
        ) : (
          <span className="muted">
            <span aria-hidden="true">—</span>
            <span className="visually-hidden">Nessun importo</span>
          </span>
        )}
      </td>
      <td className="cs-td-actions">
        <RowActions caseItem={c} onEdit={onEdit} onDelete={onDelete} />
      </td>
    </tr>
  )
}

function CaseCardItem({ caseItem: c, today, clientName, onEdit, onDelete, onStatusChange }: RowProps) {
  const open = isCaseOpen(c)
  return (
    <li className="cs-card" data-case-id={c.id} data-closed={open ? undefined : 'true'}>
      <div className="cs-card-head">
        <CaseTypeIcon type={c.type} />
        <span className="cs-case-type grow">{CASE_TYPE_LABEL[c.type]}</span>
        {c.amount !== undefined && <span className="cs-card-amount num">{formatCaseAmount(c.amount)}</span>}
      </div>
      <button type="button" className="cs-case-title" onClick={() => onEdit(c)} aria-haspopup="dialog">
        {c.title}
      </button>
      <dl className="cs-card-facts">
        <div>
          <dt>Cliente</dt>
          <dd>
            <ClientLink clientId={c.clientId} clientName={clientName} />
          </dd>
        </div>
        <div>
          <dt>Aperta il</dt>
          <dd>
            <span className="num">{formatDateShort(c.openedOn)}</span>
            {open && <span className="cs-sub-inline"> · {caseAgeShort(caseAgeDays(c, today))}</span>}
          </dd>
        </div>
        <div>
          <dt>Scadenza</dt>
          <dd>
            <CaseDue caseItem={c} today={today} />
          </dd>
        </div>
      </dl>
      <div className="cs-card-foot">
        <CaseStatusSelect caseItem={c} onCommit={(next) => onStatusChange(c, next)} />
        <RowActions caseItem={c} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </li>
  )
}
