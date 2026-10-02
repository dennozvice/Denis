import { FlaskConical, UserRound } from 'lucide-react'
import { GlobalSearch } from '../../features/shell/GlobalSearch'
import { NotificationsMenu } from '../../features/shell/NotificationsMenu'
import { capitalize, formatDateLong, greeting, initials } from '../../lib/format'
import { buildHref } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useAppData } from '../../store/StoreContext'
import { ThemeToggle } from './ThemeToggle'

export function Topbar() {
  const now = useNow()
  const { settings, isDemo } = useAppData()
  const name = settings.advisorName.trim().split(/\s+/)[0]
  return (
    <header className="topbar">
      <div className="topbar-greeting">
        <span className="topbar-title truncate">
          {greeting(now.minutes)}
          {name ? `, ${name}` : ''}
        </span>
        <p className="truncate">
          <time dateTime={now.date}>{capitalize(formatDateLong(now.date))}</time>
        </p>
      </div>
      <div className="topbar-actions">
        {isDemo && (
          <a className="pill topbar-demo" data-tone="warning" href={buildHref('impostazioni')} title="Clienti, attività e valori sono dimostrativi. Gestisci i dati da Impostazioni.">
            <FlaskConical size={12} aria-hidden="true" />
            Demo
            <span className="visually-hidden">: stai usando dati dimostrativi</span>
          </a>
        )}
        <GlobalSearch />
        <NotificationsMenu />
        <ThemeToggle />
        <a className="avatar" href={buildHref('impostazioni')} title={`${settings.advisorName} · Impostazioni`} aria-label="Profilo e impostazioni">
          {settings.advisorName.trim() ? initials(settings.advisorName) : <UserRound size={18} aria-hidden="true" />}
        </a>
      </div>
    </header>
  )
}
