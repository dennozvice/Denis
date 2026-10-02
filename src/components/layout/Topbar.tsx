import { GlobalSearch } from '../../features/shell/GlobalSearch'
import { NotificationsMenu } from '../../features/shell/NotificationsMenu'
import { capitalize, formatDateLong, greeting, initials } from '../../lib/format'
import { buildHref } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useAppData } from '../../store/StoreContext'
import { ThemeToggle } from './ThemeToggle'

export function Topbar() {
  const now = useNow()
  const { settings } = useAppData()
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
        <GlobalSearch />
        <NotificationsMenu />
        <ThemeToggle />
        <a className="avatar" href={buildHref('impostazioni')} title={`${settings.advisorName} · Impostazioni`} aria-label="Profilo e impostazioni">
          {initials(settings.advisorName || '?')}
        </a>
      </div>
    </header>
  )
}
