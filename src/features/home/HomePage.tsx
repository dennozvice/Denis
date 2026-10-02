import { CalendarPlus, ListPlus, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AgendaTodayWidget } from '../agenda/AgendaTodayWidget'
import { AppointmentFormModal } from '../agenda/AppointmentFormModal'
import { OpenCasesWidget } from '../cases/OpenCasesWidget'
import { ClientFormModal } from '../clients/ClientFormModal'
import { RecurrencesWidget } from '../clients/RecurrencesWidget'
import { DeadlinesWidget } from '../deadlines/DeadlinesWidget'
import { FundsWidget } from '../funds/FundsWidget'
import { TaskFormModal } from '../tasks/TaskFormModal'
import { TodayTasksWidget } from '../tasks/TodayTasksWidget'
import { plural } from '../../lib/format'
import { useNow } from '../../store/NowContext'
import { useAppData } from '../../store/StoreContext'
import { computeKpis } from '../../store/selectors'
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
 * obiettivi, scadenze, formazione, ricorrenze, pratiche, note.
 * Su desktop la seconda fascia ha due colonne indipendenti (fondi + obiettivi | scadenze + formazione)
 * così le card si impilano senza vuoti, invece di allungarsi tutte all'altezza della più alta.
 */
export function HomePage() {
  const data = useAppData()
  const now = useNow()
  const [modal, setModal] = useState<QuickModal | null>(null)
  const close = () => setModal(null)
  const kpis = useMemo(() => computeKpis(data, now), [data, now])

  return (
    <div className="page hm-page">
      <header className="page-header hm-header">
        <div className="hm-heading">
          <h1>Panoramica</h1>
          {/* Stessi conteggi dei KPI; la data è già nella barra in alto */}
          <p>
            Oggi: {plural(kpis.tasksOpenToday, 'attività', 'attività')} ·{' '}
            {plural(kpis.appointmentsToday, 'appuntamento', 'appuntamenti')}
          </p>
        </div>
        <div className="hm-quick" role="group" aria-label="Azioni rapide">
          <QuickAction icon={ListPlus} label="Nuova attività" short="Attività" primary onClick={() => setModal('task')} />
          <QuickAction icon={CalendarPlus} label="Nuovo appuntamento" short="Appuntamento" onClick={() => setModal('appointment')} />
          <QuickAction icon={UserPlus} label="Nuovo cliente" short="Cliente" onClick={() => setModal('client')} />
        </div>
      </header>

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
          <GoalsWidget />
        </div>
        <div className="col-4 col-md-12 hm-cell hm-pair">
          <DeadlinesWidget />
          <TrainingWidget />
        </div>

        <div className="col-4 col-md-6 hm-cell">
          <RecurrencesWidget />
        </div>
        <div className="col-4 col-md-6 hm-cell">
          <OpenCasesWidget />
        </div>
        <div className="col-4 col-md-12 hm-cell">
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
