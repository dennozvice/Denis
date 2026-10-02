import { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { useApplyTheme } from './components/layout/useTheme'
import { ToastProvider } from './components/ui/Toast'
import { AgendaPage } from './features/agenda/AgendaPage'
import { CasesPage } from './features/cases/CasesPage'
import { ClientsPage } from './features/clients/ClientsPage'
import { FundsPage } from './features/funds/FundsPage'
import { HomePage } from './features/home/HomePage'
import { SettingsPage } from './features/settings/SettingsPage'
import { TasksPage } from './features/tasks/TasksPage'
import { useRoute, type PageId } from './router/router'
import { MarketProvider } from './store/MarketContext'
import { NowProvider } from './store/NowContext'
import { StoreProvider, useAppData } from './store/StoreContext'

const PAGES: Record<PageId, () => React.JSX.Element> = {
  home: HomePage,
  agenda: AgendaPage,
  attivita: TasksPage,
  clienti: ClientsPage,
  fondi: FundsPage,
  pratiche: CasesPage,
  impostazioni: SettingsPage,
}

const TITLES: Record<PageId, string> = {
  home: 'Panoramica',
  agenda: 'Agenda',
  attivita: 'Attività',
  clienti: 'Clienti',
  fondi: 'Fondi e mercati',
  pratiche: 'Pratiche',
  impostazioni: 'Impostazioni',
}

function Routed() {
  const { page } = useRoute()
  const { settings } = useAppData()
  useApplyTheme(settings.theme)

  useEffect(() => {
    document.title = `${TITLES[page]} · ${settings.brandName}`
  }, [page, settings.brandName])

  // Cambiando pagina si torna in cima.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page])

  const Page = PAGES[page]
  return (
    <AppShell page={page}>
      <Page />
    </AppShell>
  )
}

export function App() {
  return (
    <StoreProvider>
      <NowProvider>
        <MarketProvider>
          <ToastProvider>
            <Routed />
          </ToastProvider>
        </MarketProvider>
      </NowProvider>
    </StoreProvider>
  )
}
