import { buildHref, type PageId } from '../../router/router'
import { useAppData } from '../../store/StoreContext'
import { initials } from '../../lib/format'
import { NAV_ITEMS, SETTINGS_ITEM, type NavItem } from './nav'
import { useNavCounts } from './useNavCounts'

function NavLink({ item, current, count }: { item: NavItem; current: boolean; count?: { count: number; alert: boolean } }) {
  const Icon = item.icon
  return (
    <a
      className="nav-link"
      href={buildHref(item.page)}
      aria-current={current ? 'page' : undefined}
      title={item.label}
      aria-label={count && count.count > 0 ? `${item.label} (${count.count})` : undefined}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      <span className="nav-label">{item.label}</span>
      {count && count.count > 0 && (
        <span className="nav-badge" data-alert={count.alert} aria-hidden="true">
          {count.count}
        </span>
      )}
    </a>
  )
}

export function Sidebar({ page }: { page: PageId }) {
  const { settings } = useAppData()
  const counts = useNavCounts()
  return (
    <aside className="sidebar" aria-label="Navigazione principale">
      <a className="brand" href={buildHref('home')}>
        <span className="brand-mark" aria-hidden="true">
          {initials(settings.brandName)}
        </span>
        <span className="brand-text">
          <span className="brand-name truncate">{settings.brandName}</span>
          <span className="brand-sub truncate">{settings.agencyName || 'Area consulente'}</span>
        </span>
      </a>
      <nav className="nav">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.page} item={item} current={item.page === page} count={counts[item.page]} />
        ))}
      </nav>
      <nav className="nav nav-section" aria-label="Impostazioni">
        <NavLink item={SETTINGS_ITEM} current={page === 'impostazioni'} />
      </nav>
      <p className="sidebar-foot">Dati salvati solo in questo browser</p>
    </aside>
  )
}
