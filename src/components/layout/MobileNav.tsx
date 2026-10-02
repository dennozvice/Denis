import { CalendarDays, Ellipsis, LayoutDashboard, ListChecks, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { buildHref, type PageId } from '../../router/router'
import { NAV_ITEMS, SETTINGS_ITEM } from './nav'
import { useNavCounts } from './useNavCounts'

const PRIMARY: { page: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { page: 'home', label: 'Panoramica', icon: LayoutDashboard },
  { page: 'agenda', label: 'Agenda', icon: CalendarDays },
  { page: 'attivita', label: 'Attività', icon: ListChecks },
  { page: 'clienti', label: 'Clienti', icon: Users },
]

const MORE = [...NAV_ITEMS.filter((i) => !PRIMARY.some((p) => p.page === i.page)), SETTINGS_ITEM]

/** Barra di navigazione inferiore per smartphone, con menu "Altro". */
export function MobileNav({ page }: { page: PageId }) {
  // Il menu si chiude da solo cambiando pagina: è "aperto" solo per la pagina in cui è stato aperto.
  const [openOn, setOpenOn] = useState<PageId | null>(null)
  const open = openOn === page
  const setOpen = (value: boolean | ((v: boolean) => boolean)) =>
    setOpenOn((prev) => {
      const next = typeof value === 'function' ? value(prev === page) : value
      return next ? page : null
    })
  const counts = useNavCounts()
  const inMore = MORE.some((i) => i.page === page)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    // tocco fuori dal menu (e fuori dal bottone "Altro") = chiudi
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (target && !target.closest('#more-sheet') && !target.closest('[aria-controls="more-sheet"]')) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  })

  return (
    <>
      <div className="more-sheet" id="more-sheet" hidden={!open}>
        {MORE.map((item) => {
          const Icon = item.icon
          return (
            <a key={item.page} href={buildHref(item.page)} aria-current={item.page === page ? 'page' : undefined} onClick={() => setOpen(false)}>
              <Icon size={20} aria-hidden="true" />
              {item.label}
            </a>
          )
        })}
      </div>
      <nav className="mobile-nav" aria-label="Navigazione">
        {PRIMARY.map((item) => {
          const Icon = item.icon
          const c = counts[item.page]
          return (
            <a key={item.page} href={buildHref(item.page)} aria-current={item.page === page ? 'page' : undefined}>
              <Icon size={22} aria-hidden="true" />
              {item.label}
              {c && c.count > 0 && <span className="nav-badge" aria-label={`${c.count} da fare`}>{c.count}</span>}
            </a>
          )
        })}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="more-sheet"
          aria-current={inMore && !open ? 'page' : undefined}
          onClick={() => setOpen((v) => !v)}
        >
          <Ellipsis size={22} aria-hidden="true" />
          Altro
        </button>
      </nav>
    </>
  )
}
