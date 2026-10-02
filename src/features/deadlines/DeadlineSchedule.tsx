import { CalendarCheck, ListFilter, SearchX, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Segmented } from '../../components/ui/Segmented'
import { formatNumber } from '../../lib/format'
import { buildHref, navigate, useRoute } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useAppData } from '../../store/StoreContext'
import { computeDeadlines } from '../../store/selectors'
import { DeadlineList, useDeadlineTaskModal } from './DeadlineList'
import {
  DEADLINE_FILTER_OPTIONS,
  countByBucket,
  countByFilter,
  deadlineFilterFromParam,
  groupDeadlinesByMonth,
  matchesDeadlineFilter,
  type DeadlineFilter,
} from './deadlineUtils'
import './deadlines.css'

type Horizon = '30' | '60' | '90' | '180'

const HORIZON_OPTIONS: { value: Horizon; label: string; title: string }[] = [
  { value: '30', label: '30 gg', title: 'Prossimi 30 giorni' },
  { value: '60', label: '60 gg', title: 'Prossimi 60 giorni' },
  { value: '90', label: '90 gg', title: 'Prossimi 90 giorni' },
  { value: '180', label: '180 gg', title: 'Prossimi 180 giorni' },
]

/**
 * Scheda "Scadenzario" della pagina Pratiche: tutte le scadenze calcolate, raggruppate per mese.
 * Con ?tipo=adempimenti (link del riquadro "Scadenze 30 gg" della home) parte filtrata sulle
 * scadenze operative a 30 giorni: lo stesso elenco, e lo stesso totale, della home.
 */
export function DeadlineSchedule({ caseParams }: { caseParams?: Record<string, string | undefined> }) {
  const data = useAppData()
  const { date: today } = useNow()
  const { params } = useRoute()
  const { openTaskFor, taskModal } = useDeadlineTaskModal()
  const preset = deadlineFilterFromParam(params.tipo)
  const [horizon, setHorizon] = useState<Horizon>('30')
  const [filter, setFilter] = useState<DeadlineFilter>(preset ?? 'tutte')
  const chipsRef = useRef<HTMLDivElement>(null)

  // Un link con ?tipo=… mentre lo scadenzario è già aperto riapplica il filtro e l'orizzonte di 30 giorni.
  const [appliedPreset, setAppliedPreset] = useState(preset)
  if (preset !== appliedPreset) {
    setAppliedPreset(preset)
    if (preset) {
      setFilter(preset)
      setHorizon('30')
    }
  }

  const chooseFilter = (next: DeadlineFilter) => {
    setFilter(next)
    // cambiato il filtro, il parametro del link non vale più (un ricaricamento non deve riapplicarlo)
    if (params.tipo) navigate('pratiche', { ...params, tipo: undefined }, true)
  }

  /** "Mostra tutte": il pulsante sparisce, quindi il focus passa al filtro "Tutte". */
  const clearFilter = () => {
    chipsRef.current?.querySelector<HTMLButtonElement>('[data-filter="tutte"]')?.focus()
    chooseFilter('tutte')
  }

  const all = useMemo(() => computeDeadlines(data, today, { horizonDays: Number(horizon) }), [data, today, horizon])
  const counts = useMemo(() => countByFilter(all), [all])
  const filtered = useMemo(() => all.filter((d) => matchesDeadlineFilter(d, filter)), [all, filter])
  const groups = useMemo(() => groupDeadlinesByMonth(filtered), [filtered])
  const buckets = countByBucket(filtered)
  const activeFilter = filter !== 'tutte' ? DEADLINE_FILTER_OPTIONS.find((o) => o.value === filter) : undefined

  const months = data.settings.iddValidityMonths

  return (
    <div className="cs-schedule">
      <p className="cs-explain">
        Le scadenze sono calcolate dai dati dei clienti: documento d&apos;identità, rinnovo dell&apos;adeguata verifica,
        validità del questionario di adeguatezza ({formatNumber(months)} mesi, modificabile in{' '}
        <a href={buildHref('impostazioni')}>Impostazioni</a>), scadenze e anniversari delle polizze, compleanni; in più i
        termini delle pratiche aperte. Gli adempimenti già scaduti restano in elenco finché non aggiorni la scheda del cliente.
      </p>

      <section className="card cs-toolbar" aria-label="Filtri scadenzario">
        <div className="cs-toolbar-row">
          <span className="cs-toolbar-label" aria-hidden="true">
            Orizzonte (giorni)
          </span>
          <Segmented<Horizon> options={HORIZON_OPTIONS} value={horizon} onChange={setHorizon} ariaLabel="Orizzonte temporale in giorni" />
        </div>
        <div className="cs-chips" role="group" aria-label="Tipo di scadenza" ref={chipsRef}>
          {DEADLINE_FILTER_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="chip cs-chip"
              data-filter={o.value}
              aria-pressed={filter === o.value}
              title={o.title}
              onClick={() => chooseFilter(o.value)}
            >
              {o.label}
              <span className="cs-chip-count num">{formatNumber(counts[o.value])}</span>
            </button>
          ))}
        </div>
        {activeFilter && (
          <div className="cs-filter-note">
            <ListFilter size={16} aria-hidden="true" className="cs-filter-note-icon" />
            <p className="grow">
              <strong>Filtro attivo: {activeFilter.label}</strong>
              {activeFilter.title && <> · {activeFilter.title}</>}
            </p>
            <button type="button" className="btn btn-ghost btn-sm cs-filter-clear" onClick={clearFilter}>
              <X size={16} aria-hidden="true" />
              Mostra tutte
            </button>
          </div>
        )}
      </section>

      <p className="cs-schedule-summary" aria-live="polite">
        <strong className="num">{formatNumber(filtered.length)}</strong>{' '}
        {filtered.length === 1 ? 'scadenza' : 'scadenze'}
        {buckets.scadute > 0 && (
          <>
            {' · '}
            <span className="negative strong">{formatNumber(buckets.scadute)} scadute</span>
          </>
        )}
        {buckets.settimana > 0 && (
          <>
            {' · '}
            <span className="cs-text-warning strong">{formatNumber(buckets.settimana)} entro 7 giorni</span>
          </>
        )}
      </p>

      {groups.length === 0 ? (
        <div className="card">
          {all.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title={`Nessuna scadenza nei prossimi ${horizon} giorni`}
              text="Prova ad allargare l'orizzonte temporale."
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="Nessuna scadenza di questo tipo"
              text="Cambia il tipo selezionato o allarga l'orizzonte temporale."
              action={
                <button type="button" className="btn" onClick={clearFilter}>
                  Mostra tutte
                </button>
              }
            />
          )}
        </div>
      ) : (
        <div className="card cs-schedule-card">
          {groups.map((g) => (
            <section key={g.id} className="cs-group" aria-labelledby={`cs-g-${g.id}`}>
              <h2 id={`cs-g-${g.id}`} className="cs-group-title" data-tone={g.id === 'scadute' ? 'negative' : undefined}>
                {g.label}
                <span className="cs-count num">{formatNumber(g.items.length)}</span>
              </h2>
              <DeadlineList deadlines={g.items} onCreateTask={openTaskFor} caseParams={caseParams} />
            </section>
          ))}
        </div>
      )}
      {taskModal}
    </div>
  )
}
