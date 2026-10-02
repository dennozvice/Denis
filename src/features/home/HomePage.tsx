import { CalendarPlus, ListPlus, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { AgendaTodayWidget } from '../agenda/AgendaTodayWidget'
import { AppointmentFormModal } from '../agenda/AppointmentFormModal'
import { OpenCasesWidget } from '../cases/OpenCasesWidget'
import { ClientFormModal } from '../clients/ClientFormModal'
import { RecurrencesWidget } from '../clients/RecurrencesWidget'
import { DeadlinesWidget } from '../deadlines/DeadlinesWidget'
import { FundsWidget } from '../funds/FundsWidget'
import { TaskFormModal } from '../tasks/TaskFormModal'
import { TodayTasksWidget } from '../tasks/TodayTasksWidget'
import { useNow } from '../../store/NowContext'
import { GoalsWidget } from './GoalsWidget'
import { KpiTiles } from './KpiTiles'
import { MarketStrip } from './MarketStrip'
import { QuickNoteWidget } from './QuickNoteWidget'
import { TrainingWidget } from './TrainingWidget'
import './home.css'

type QuickModal = 'task' | 'appointment' | 'client'

/**
 * Panoramica: la giornata del consulente in una schermata.
 * Ordine nel DOM = ordine su mobile (colonna singola): mercati, KPI, attività, agenda, fondi,
 * scadenze, obiettivi, ricorrenze, pratiche, formazione, note.
 */
export function HomePage() {
  const now = useNow()
  const [modal, setModal] = useState<QuickModal | null>(null)
  const close = () => setModal(null)

  return (
    <div className="page hm-page">
      <div className="hm-header">
        <h1 className="hm-title">Panoramica</h1>
        <div className="hm-quick" role="group" aria-label="Azioni rapide">
          <QuickAction icon={ListPlus} label="Nuova attività" short="Attività" primary onClick={() => setModal('task')} />
          <QuickAction icon={CalendarPlus} label="Nuovo appuntamento" short="Appuntamento" onClick={() => setModal('appointment')} />
          <QuickAction icon={UserPlus} label="Nuovo cliente" short="Cliente" onClick={() => setModal('client')} />
        </div>
      </div>

      <MarketStrip />
      <KpiTiles />

      <div className="grid-12 hm-grid">
        <div className="col-5 col-md-6 hm-cell">
          <TodayTasksWidget />
        </div>
        <div className="col-7 col-md-6 hm-cell">
          <AgendaTodayWidget />
        </div>

        <div className="col-8 col-md-12 hm-cell">
          <FundsWidget />
        </div>
        <div className="col-4 col-md-12 hm-cell hm-pair">
          <DeadlinesWidget />
          <GoalsWidget />
        </div>

        <div className="col-4 col-md-6 hm-cell">
          <RecurrencesWidget />
        </div>
        <div className="col-4 col-md-6 hm-cell">
          <OpenCasesWidget />
        </div>
        <div className="col-4 col-md-12 hm-cell hm-pair">
          <TrainingWidget />
          <QuickNoteWidget />
        </div>
      </div>

      <TaskFormModal open={modal === 'task'} onClose={close} defaults={{ dueDate: now.date }} />
      <AppointmentFormModal open={modal === 'appointment'} onClose={close} defaults={{ date: now.date }} />
      <ClientFormModal open={modal === 'client'} onClose={close} />
    </div>
  )
}

function QuickAction({
  icon: Icon,
  label,
  short,
  primary = false,
  onClick,
}: {
  icon: LucideIcon
  label: string
  /** Etichetta breve mostrata su mobile. */
  short: string
  primary?: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      className={`btn hm-qa${primary ? ' btn-primary' : ''}`}
      aria-label={label}
      aria-haspopup="dialog"
      onClick={onClick}
    >
      <Icon size={18} aria-hidden="true" />
      <span className="hm-qa-long" aria-hidden="true">
        {label}
      </span>
      <span className="hm-qa-short" aria-hidden="true">
        {short}
      </span>
    </button>
  )
}
