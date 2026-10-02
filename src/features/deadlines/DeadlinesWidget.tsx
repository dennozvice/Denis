import { CalendarCheck, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import type { Tone } from '../../domain/labels'
import { formatNumber } from '../../lib/format'
import { buildHref } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useAppData } from '../../store/StoreContext'
import { complianceDeadlines, computeDeadlines } from '../../store/selectors'
import { DeadlineList, useDeadlineTaskModal } from './DeadlineList'
import { countByBucket, deadlineBucket, toneVars, type DeadlineBucket } from './deadlineUtils'
import './deadlines.css'

/** Righe visibili prima di "Mostra tutte". */
const PREVIEW = 6

const BUCKETS: { value: DeadlineBucket; label: string; title: string; tone: Tone }[] = [
  { value: 'scadute', label: 'Scadute', title: 'Adempimenti già scaduti', tone: 'negative' },
  { value: 'settimana', label: 'Entro 7 gg', title: 'In scadenza da oggi a 7 giorni', tone: 'warning' },
  { value: 'mese', label: 'Entro 30 gg', title: 'In scadenza tra 8 e 30 giorni', tone: 'neutral' },
]

/** Widget della home: adempimenti e scadenze operative dei prossimi 30 giorni, più quelle già scadute. */
export function DeadlinesWidget() {
  const data = useAppData()
  const { date: today } = useNow()
  const { openTaskFor, taskModal } = useDeadlineTaskModal()
  const [bucket, setBucket] = useState<DeadlineBucket | null>(null)
  const [expanded, setExpanded] = useState(false)

  const deadlines = useMemo(() => complianceDeadlines(computeDeadlines(data, today, { horizonDays: 30 })), [data, today])
  const counts = useMemo(() => countByBucket(deadlines), [deadlines])

  // Se la fascia selezionata si svuota (es. dopo aver aggiornato un cliente) si torna a "tutte".
  const activeBucket = bucket && counts[bucket] > 0 ? bucket : null
  const filtered = activeBucket ? deadlines.filter((d) => deadlineBucket(d) === activeBucket) : deadlines
  const visible = expanded ? filtered : filtered.slice(0, PREVIEW)
  const hiddenCount = filtered.length - PREVIEW

  return (
    <Card
      id="scadenze"
      className="cs-dl-widget"
      title="Scadenze e adempimenti"
      subtitle="Prossimi 30 giorni e scadute"
      footer={
        <a className="card-link cs-footer-link" href={buildHref('pratiche', { vista: 'scadenze' })}>
          Scadenzario completo
          <ChevronRight size={14} aria-hidden="true" />
        </a>
      }
    >
      {deadlines.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="Nessuna scadenza nei prossimi 30 giorni"
          text="Documenti, adeguata verifica e questionari dei clienti sono in regola."
        />
      ) : (
        <>
          <div className="cs-dl-summary" role="group" aria-label="Filtra per scadenza">
            {BUCKETS.map((b) => (
              <button
                key={b.value}
                type="button"
                className="cs-dl-stat"
                style={toneVars(b.tone)}
                aria-pressed={activeBucket === b.value}
                disabled={counts[b.value] === 0}
                title={b.title}
                onClick={() => {
                  setBucket(activeBucket === b.value ? null : b.value)
                  setExpanded(false)
                }}
              >
                <span className="cs-dl-stat-label">{b.label}</span>
                <span className="cs-dl-stat-value num">{formatNumber(counts[b.value])}</span>
              </button>
            ))}
          </div>

          <DeadlineList deadlines={visible} onCreateTask={openTaskFor} ariaLabel="Scadenze" />

          {hiddenCount > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm cs-more"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Mostra meno' : `Mostra tutte (${formatNumber(filtered.length)})`}
            </button>
          )}
        </>
      )}
      {taskModal}
    </Card>
  )
}
