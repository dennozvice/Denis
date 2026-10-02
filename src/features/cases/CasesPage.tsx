import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Segmented } from '../../components/ui/Segmented'
import type { Case } from '../../domain/types'
import { formatNumber } from '../../lib/format'
import { navigate, useRoute } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useAppData } from '../../store/StoreContext'
import { complianceDeadlines, computeDeadlines } from '../../store/selectors'
import { DeadlineSchedule } from '../deadlines/DeadlineSchedule'
import { CaseFormModal } from './CaseFormModal'
import { CasesList } from './CasesList'
import { isCaseOpen } from './caseUtils'
import './cases.css'

type Tab = 'pratiche' | 'scadenze'
type ModalState = { mode: 'new' } | { mode: 'edit'; id: string } | null

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'pratiche', label: 'Pratiche' },
  { value: 'scadenze', label: 'Scadenzario' },
]

/** Pagina Pratiche (#/pratiche): elenco delle pratiche e scadenzario degli adempimenti. */
export function CasesPage() {
  const data = useAppData()
  const { cases } = data
  const { date: today } = useNow()
  const { params } = useRoute()
  const [modal, setModal] = useState<ModalState>(null)

  const tab: Tab = params.vista === 'scadenze' ? 'scadenze' : 'pratiche'
  const vista = tab === 'scadenze' ? 'scadenze' : undefined
  const setTab = (next: Tab) => navigate('pratiche', { vista: next === 'scadenze' ? 'scadenze' : undefined })

  // Modale: aperta da un clic nella pagina oppure da un link diretto (#/pratiche?id=…).
  const routeId = params.id
  const editId = modal?.mode === 'edit' ? modal.id : modal === null ? routeId : undefined
  const editing = editId ? cases.find((c) => c.id === editId) : undefined
  const modalOpen = modal?.mode === 'new' || editing !== undefined
  const closeModal = () => {
    setModal(null)
    if (routeId) navigate('pratiche', { vista }, true)
  }
  const openEdit = (c: Case) => setModal({ mode: 'edit', id: c.id })
  const openNew = () => setModal({ mode: 'new' })

  const summary = useMemo(() => {
    const open = cases.filter(isCaseOpen)
    const deadlines = complianceDeadlines(computeDeadlines(data, today, { horizonDays: 30 }))
    return {
      open: open.length,
      reclami: open.filter((c) => c.type === 'reclamo').length,
      expired: deadlines.filter((d) => d.daysLeft < 0).length,
      upcoming: deadlines.filter((d) => d.daysLeft >= 0).length,
    }
  }, [cases, data, today])

  const subtitle = [
    summary.open === 1 ? '1 pratica aperta' : `${formatNumber(summary.open)} pratiche aperte`,
    summary.reclami > 0 ? `${formatNumber(summary.reclami)} ${summary.reclami === 1 ? 'reclamo' : 'reclami'} in corso` : null,
    summary.expired > 0 ? `${formatNumber(summary.expired)} adempimenti scaduti` : null,
    `${formatNumber(summary.upcoming)} scadenze nei prossimi 30 giorni`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="page cs-page">
      <header className="page-header">
        <div>
          <h1>Pratiche e scadenze</h1>
          <p>{subtitle}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openNew} aria-haspopup="dialog">
          <Plus size={18} aria-hidden="true" />
          Nuova pratica
        </button>
      </header>

      <div className="cs-tabs">
        <Segmented<Tab> options={TAB_OPTIONS} value={tab} onChange={setTab} ariaLabel="Sezione" />
      </div>

      {tab === 'pratiche' ? (
        <CasesList onEdit={openEdit} onNew={openNew} />
      ) : (
        <DeadlineSchedule caseParams={{ vista: 'scadenze' }} />
      )}

      <CaseFormModal open={modalOpen} caseItem={editing} onClose={closeModal} />
    </div>
  )
}
