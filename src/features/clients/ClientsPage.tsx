import { AlertCircle, ArrowLeft, Clock, Search, ShieldCheck, UserPlus, UserRound, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pill } from '../../components/ui/Pill'
import { CLIENT_SEGMENT_LABEL } from '../../domain/labels'
import type { Client, ClientSegment, Deadline } from '../../domain/types'
import { formatDateShort, formatNumber, initials, plural } from '../../lib/format'
import { buildHref, navigate, useRoute } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useAppData } from '../../store/StoreContext'
import { clientsToRecontact, complianceDeadlines, computeDeadlines } from '../../store/selectors'
import { ClientDetail } from './ClientDetail'
import { ClientFormModal } from './ClientFormModal'
import {
  CLIENT_SORT_OPTIONS,
  clientSortName,
  deadlineShortLabel,
  deadlineTone,
  isClientSort,
  lastContactInfo,
  matchesClientSearch,
  nearestDeadlineByClient,
  sortClients,
  tagTone,
  type ClientSort,
} from './clientUtils'
import './clients.css'

/** Orizzonte della pillola "prossima scadenza" nell'elenco. */
const PILL_HORIZON_DAYS = 60
/** Orizzonte usato solo per ordinare per prossima scadenza (dieci anni: copre ogni documento). */
const SORT_HORIZON_DAYS = 3660
const NARROW_QUERY = '(max-width: 1199px)'
const SEGMENTS = Object.entries(CLIENT_SEGMENT_LABEL) as [ClientSegment, string][]

/** Rubrica clienti: elenco con ricerca, filtri e ordinamento + scheda di dettaglio (#/clienti?id=…). */
export function ClientsPage() {
  const data = useAppData()
  const { clients, settings } = data
  const { date: today } = useNow()
  const { params } = useRoute()
  const selectedId = params.id || undefined
  const selected = selectedId ? clients.find((c) => c.id === selectedId) : undefined

  const [query, setQuery] = useState('')
  const [segment, setSegment] = useState<ClientSegment | ''>('')
  const [sort, setSort] = useState<ClientSort>(() => (isClientSort(params.ordina) ? params.ordina : 'cognome'))
  const [creating, setCreating] = useState(false)

  const nearest = useMemo(
    () => nearestDeadlineByClient(complianceDeadlines(computeDeadlines(data, today, { horizonDays: SORT_HORIZON_DAYS }))),
    [data, today],
  )
  const recontactCount = useMemo(
    () => clientsToRecontact(clients, today, settings.recontactAfterDays).length,
    [clients, today, settings.recontactAfterDays],
  )
  const urgentCount = useMemo(() => {
    let n = 0
    for (const d of nearest.values()) if (d.daysLeft <= 30) n += 1
    return n
  }, [nearest])

  const visible = useMemo(() => {
    const filtered = clients.filter((c) => (!segment || c.segment === segment) && matchesClientSearch(c, query))
    return sortClients(filtered, sort, nearest)
  }, [clients, segment, query, sort, nearest])

  const filtersActive = query.trim() !== '' || segment !== ''

  // ---------------------------------------------------------------- focus e scroll al cambio di selezione
  const detailRef = useRef<HTMLDivElement>(null)
  const lastSelected = useRef<string | undefined>(undefined)
  useEffect(() => {
    const narrow = window.matchMedia(NARROW_QUERY).matches
    if (selectedId) {
      lastSelected.current = selectedId
      detailRef.current?.scrollTo?.({ top: 0 })
      if (narrow) {
        window.scrollTo(0, 0)
        detailRef.current?.querySelector<HTMLElement>('.cl-detail-name')?.focus({ preventScroll: true })
      }
    } else if (lastSelected.current) {
      // Tornando all'elenco, il focus va sulla riga del cliente appena chiuso.
      const id = lastSelected.current
      lastSelected.current = undefined
      if (narrow) document.querySelector<HTMLElement>(`[data-cl-row="${CSS.escape(id)}"]`)?.focus()
    }
  }, [selectedId])

  const backToList = () => navigate('clienti', {})
  const resetFilters = () => {
    setQuery('')
    setSegment('')
  }

  const summary = [
    recontactCount > 0 ? `${formatNumber(recontactCount)} da ricontattare` : undefined,
    urgentCount > 0 ? `${plural(urgentCount, 'cliente', 'clienti')} con scadenze entro 30 giorni` : undefined,
  ].filter(Boolean)

  return (
    <div className="page cl-page">
      <header className="page-header">
        <div>
          <h1 className="cl-title">
            Clienti <span className="cl-title-count num">{formatNumber(clients.length)}</span>
          </h1>
          {summary.length > 0 && <p>{summary.join(' · ')}</p>}
        </div>
        <button type="button" className="btn btn-primary cl-new" onClick={() => setCreating(true)} aria-haspopup="dialog">
          <UserPlus size={18} aria-hidden="true" />
          Nuovo cliente
        </button>
      </header>

      <div className="cl-layout" data-selected={selectedId ? 'true' : undefined}>
        <section className="card cl-list-panel" aria-labelledby="cl-list-title">
          <h2 id="cl-list-title" className="visually-hidden">
            Elenco clienti
          </h2>
          {clients.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nessun cliente"
              text="La rubrica è vuota. Inizia aggiungendo nome, contatti e scadenze dei tuoi clienti."
              action={
                <button type="button" className="btn btn-primary" onClick={() => setCreating(true)} aria-haspopup="dialog">
                  <UserPlus size={16} aria-hidden="true" />
                  Aggiungi il primo cliente
                </button>
              }
            />
          ) : (
            <>
              <div className="cl-toolbar">
                <label className="cl-search">
                  <span className="visually-hidden">Cerca cliente</span>
                  <Search size={18} className="cl-search-icon" aria-hidden="true" />
                  <input
                    type="search"
                    className="input cl-search-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Nome, città, etichetta, telefono"
                    autoComplete="off"
                    enterKeyHint="search"
                  />
                  {query && (
                    <button type="button" className="icon-btn cl-search-clear" onClick={() => setQuery('')} aria-label="Cancella ricerca">
                      <X size={16} aria-hidden="true" />
                    </button>
                  )}
                </label>
                <div className="cl-toolbar-row">
                  <label className="field cl-filter">
                    <span>Segmento</span>
                    <select className="select" value={segment} onChange={(e) => setSegment(e.target.value as ClientSegment | '')}>
                      <option value="">Tutti</option>
                      {SEGMENTS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field cl-filter">
                    <span>Ordina per</span>
                    <select className="select" value={sort} onChange={(e) => setSort(e.target.value as ClientSort)}>
                      {CLIENT_SORT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <p className="cl-result-count" aria-live="polite">
                {filtersActive
                  ? `${formatNumber(visible.length)} di ${plural(clients.length, 'cliente', 'clienti')}`
                  : plural(clients.length, 'cliente', 'clienti')}
              </p>

              {visible.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="Nessun cliente trovato"
                  text="Prova a cambiare la ricerca o il segmento."
                  action={
                    <button type="button" className="btn" onClick={resetFilters}>
                      Azzera filtri
                    </button>
                  }
                />
              ) : (
                <ul className="cl-list">
                  {visible.map((c) => (
                    <ClientRow
                      key={c.id}
                      client={c}
                      selected={c.id === selectedId}
                      today={today}
                      recontactAfterDays={settings.recontactAfterDays}
                      deadline={nearest.get(c.id)}
                    />
                  ))}
                </ul>
              )}

              <p className="cl-privacy-hint">
                <ShieldCheck size={14} aria-hidden="true" />
                Non salvare dati sanitari, codici fiscali o numeri di polizza completi.
              </p>
            </>
          )}
        </section>

        <div className="cl-detail-panel" ref={detailRef}>
          {selected ? (
            <ClientDetail key={selected.id} client={selected} onBack={backToList} onDeleted={() => navigate('clienti', {}, true)} />
          ) : selectedId ? (
            <div className="card cl-detail-empty">
              <div className="cl-back-bar">
                <button type="button" className="btn btn-ghost cl-back" onClick={backToList}>
                  <ArrowLeft size={18} aria-hidden="true" />
                  Tutti i clienti
                </button>
              </div>
              <EmptyState
                icon={UserRound}
                title="Cliente non trovato"
                text="Potrebbe essere stato eliminato. Scegli un cliente dall'elenco."
              />
            </div>
          ) : (
            clients.length > 0 && (
              <div className="card cl-detail-empty cl-detail-placeholder">
                <EmptyState
                  icon={UserRound}
                  title="Seleziona un cliente"
                  text="Scegli un nome dall'elenco per vedere contatti, adempimenti, polizze, attività e appuntamenti."
                />
              </div>
            )
          )}
        </div>
      </div>

      <ClientFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(c) => navigate('clienti', { id: c.id })}
      />
    </div>
  )
}

function ClientRow({
  client: c,
  selected,
  today,
  recontactAfterDays,
  deadline,
}: {
  client: Client
  selected: boolean
  today: string
  recontactAfterDays: number
  deadline?: Deadline
}) {
  const contact = lastContactInfo(c, today, recontactAfterDays)
  const showDeadline = deadline !== undefined && deadline.daysLeft <= PILL_HORIZON_DAYS
  const tags = c.tags ?? []
  const meta = [
    c.segment ? CLIENT_SEGMENT_LABEL[c.segment] : undefined,
    c.city,
    c.policies.length === 0 ? 'nessuna polizza' : plural(c.policies.length, 'polizza', 'polizze'),
  ].filter(Boolean)

  return (
    <li>
      <a
        className="cl-row"
        href={buildHref('clienti', { id: c.id })}
        aria-current={selected ? 'true' : undefined}
        data-cl-row={c.id}
      >
        <span className="cl-avatar" aria-hidden="true">
          {initials(`${c.firstName} ${c.lastName}`)}
        </span>
        <span className="cl-row-main">
          <span className="cl-row-name">
            <span className="cl-name truncate">{clientSortName(c)}</span>
            {tags.slice(0, 2).map((tag) => (
              <Pill key={tag} tone={tagTone(tag)}>
                {tag}
              </Pill>
            ))}
            {tags.length > 2 && <span className="cl-more-tags">+{tags.length - 2}</span>}
          </span>
          <span className="cl-row-meta truncate">{meta.join(' · ')}</span>
        </span>
        <span className="cl-row-side">
          <span
            className="cl-last-contact num"
            data-stale={contact.stale || undefined}
            title={c.lastContact ? `Ultimo contatto: ${formatDateShort(c.lastContact)}` : 'Nessun contatto registrato'}
          >
            {contact.stale ? <AlertCircle size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
            <span className="visually-hidden">Ultimo contatto: </span>
            {contact.label}
            {contact.stale && <span className="visually-hidden"> (da ricontattare)</span>}
          </span>
          {showDeadline && (
            <Pill tone={deadlineTone(deadline)} title={`${deadline.title} · ${formatDateShort(deadline.date)}`}>
              {deadlineShortLabel(deadline)}
            </Pill>
          )}
        </span>
      </a>
    </li>
  )
}
