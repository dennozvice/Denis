import { ChevronRight, FolderOpen, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pill } from '../../components/ui/Pill'
import { CASE_STATUS_LABEL, CASE_STATUS_TONE, CASE_TYPE_LABEL } from '../../domain/labels'
import type { Case, DateKey } from '../../domain/types'
import { diffDays } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { buildHref } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useAppData } from '../../store/StoreContext'
import { caseDueDate, clientNameById, indexById } from '../../store/selectors'
import { formatDeadlineDate } from '../deadlines/deadlineUtils'
import { CaseTypeIcon, ReclamoDuePill, caseDaysLabel, formatCaseAmount } from './CaseBits'
import { CaseFormModal } from './CaseFormModal'
import { caseAgeDays, caseAgeLabel, caseDueTone, sortOpenCases } from './caseUtils'
import './cases.css'

/** Righe mostrate nel widget. */
const MAX_ROWS = 5

/** Widget della home: pratiche aperte, le più urgenti in testa. */
export function OpenCasesWidget() {
  const { cases, clients } = useAppData()
  const { date: today } = useNow()
  const [modalOpen, setModalOpen] = useState(false)

  const open = useMemo(() => sortOpenCases(cases), [cases])
  const clientIndex = useMemo(() => indexById(clients), [clients])
  const shown = open.slice(0, MAX_ROWS)
  const reclami = open.filter((c) => c.type === 'reclamo').length
  const waitingDocs = open.filter((c) => c.status === 'attesa_documenti').length

  const subtitle =
    open.length === 0
      ? 'Nessuna pratica aperta'
      : [
          reclami > 0 ? `${formatNumber(reclami)} ${reclami === 1 ? 'reclamo' : 'reclami'}` : null,
          waitingDocs > 0 ? `${formatNumber(waitingDocs)} in attesa documenti` : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'Ordinate per scadenza'

  return (
    <Card
      id="pratiche-in-corso"
      className="cs-oc-widget"
      title="Pratiche in corso"
      badge={
        open.length > 0 ? (
          <span className="cs-count num">
            {formatNumber(open.length)}
            <span className="visually-hidden"> aperte</span>
          </span>
        ) : undefined
      }
      subtitle={subtitle}
      actions={
        <button
          type="button"
          className="icon-btn cs-icon-btn"
          onClick={() => setModalOpen(true)}
          aria-label="Nuova pratica"
          title="Nuova pratica"
          aria-haspopup="dialog"
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      }
      footer={
        <a className="card-link cs-footer-link" href={buildHref('pratiche')}>
          {open.length > MAX_ROWS ? `Tutte le pratiche (${formatNumber(open.length)} aperte)` : 'Tutte le pratiche'}
          <ChevronRight size={14} aria-hidden="true" />
        </a>
      }
    >
      {open.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Nessuna pratica in corso"
          text="Riscatti, sinistri, liquidazioni e reclami da seguire compariranno qui."
          action={
            <button type="button" className="btn" onClick={() => setModalOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              Nuova pratica
            </button>
          }
        />
      ) : (
        <ul className="cs-oc-list">
          {shown.map((c) => (
            <OpenCaseRow key={c.id} caseItem={c} today={today} clientName={clientNameById(clientIndex, c.clientId)} />
          ))}
        </ul>
      )}
      <CaseFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </Card>
  )
}

function OpenCaseRow({ caseItem: c, today, clientName }: { caseItem: Case; today: DateKey; clientName: string }) {
  const due = caseDueDate(c)
  const days = due ? diffDays(today, due) : undefined
  return (
    <li>
      <a className="cs-oc-row" href={buildHref('pratiche', { id: c.id })}>
        <CaseTypeIcon type={c.type} />
        <span className="cs-oc-body">
          <span className="cs-oc-top">
            <span className="cs-oc-type">{CASE_TYPE_LABEL[c.type]}</span>
            <Pill tone={CASE_STATUS_TONE[c.status]}>{CASE_STATUS_LABEL[c.status]}</Pill>
          </span>
          <span className="cs-oc-title">{c.title}</span>
          <span className="cs-oc-meta">
            <span className="cs-oc-meta-text">
              {[clientName, caseAgeLabel(caseAgeDays(c, today))].filter(Boolean).join(' · ')}
            </span>
            {c.amount !== undefined && <span className="cs-oc-amount num">{formatCaseAmount(c.amount)}</span>}
          </span>
          {c.type === 'reclamo' ? (
            <span className="cs-oc-flag">
              <ReclamoDuePill caseItem={c} today={today} />
            </span>
          ) : (
            due !== undefined &&
            days !== undefined && (
              <span className="cs-oc-due">
                Scadenza {formatDeadlineDate(due, today)}
                <Pill tone={caseDueTone(c.type, days)}>{caseDaysLabel(days)}</Pill>
              </span>
            )
          )}
        </span>
      </a>
    </li>
  )
}
