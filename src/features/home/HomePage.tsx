import { AgendaTodayWidget } from '../agenda/AgendaTodayWidget'
import { OpenCasesWidget } from '../cases/OpenCasesWidget'
import { RecurrencesWidget } from '../clients/RecurrencesWidget'
import { DeadlinesWidget } from '../deadlines/DeadlinesWidget'
import { FundsWidget } from '../funds/FundsWidget'
import { TodayTasksWidget } from '../tasks/TodayTasksWidget'
import { GoalsWidget } from './GoalsWidget'
import { KpiTiles } from './KpiTiles'
import { MarketStrip } from './MarketStrip'
import { QuickNoteWidget } from './QuickNoteWidget'
import { TrainingWidget } from './TrainingWidget'

/** Panoramica: la giornata del consulente in una schermata. */
export function HomePage() {
  return (
    <div className="page">
      <h1 className="visually-hidden">Panoramica</h1>
      <MarketStrip />
      <KpiTiles />
      <div className="grid-12">
        <div className="col-5 col-md-12 stretch">
          <TodayTasksWidget />
        </div>
        <div className="col-7 col-md-12 stretch">
          <AgendaTodayWidget />
        </div>
        <div className="col-8 col-md-12">
          <FundsWidget />
        </div>
        <div className="col-4 col-md-12 stack">
          <DeadlinesWidget />
          <GoalsWidget />
        </div>
        <div className="col-4 col-md-6">
          <RecurrencesWidget />
        </div>
        <div className="col-4 col-md-6">
          <OpenCasesWidget />
        </div>
        <div className="col-4 col-md-12 stack">
          <TrainingWidget />
          <QuickNoteWidget />
        </div>
      </div>
    </div>
  )
}
