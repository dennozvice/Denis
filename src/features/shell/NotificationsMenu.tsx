import { Bell, CalendarClock, ChevronRight, CircleCheck, ListChecks, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { TONE_BG, TONE_COLOR } from '../../domain/labels'
import { buildHref, useRoute } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { computeNotifications, type NotificationItem } from '../../store/selectors'
import { useAppData } from '../../store/StoreContext'
import './shell.css'

type Kind = NotificationItem['kind']

const GROUPS: { kind: Kind; label: string }[] = [
  { kind: 'appuntamento', label: 'Tra poco' },
  { kind: 'attivita', label: 'Attività in ritardo' },
  { kind: 'scadenza', label: 'Scadenze entro 7 giorni' },
]

const KIND_ICON: Record<Kind, LucideIcon> = {
  appuntamento: CalendarClock,
  attivita: ListChecks,
  scadenza: TriangleAlert,
}

/** Le attività in ritardo puntano alla singola attività, non solo all'elenco. */
function itemHref(item: NotificationItem): string {
  if (item.kind === 'attivita' && item.href === buildHref('attivita') && item.id.startsWith('task-')) {
    return buildHref('attivita', { id: item.id.slice('task-'.length) })
  }
  return item.href
}

/** Campanella nella topbar con il numero di elementi da non perdere e il relativo pannello. */
export function NotificationsMenu() {
  const data = useAppData()
  const now = useNow()
  const route = useRoute()
  const items = useMemo(() => computeNotifications(data, now), [data, now])
  const groups = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.kind === g.kind) })).filter((g) => g.items.length > 0),
    [items],
  )

  // Il pannello è "aperto" solo sulla pagina in cui è stato aperto: cambiando pagina si chiude da solo.
  const routeKey = buildHref(route.page, route.params)
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === routeKey
  const close = () => setOpenOn(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const headingId = `${panelId}-title`

  // Chiusura con clic fuori dal pannello o con Esc (il focus torna sulla campanella).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) setOpenOn(null)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return
      setOpenOn(null)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const count = items.length

  return (
    <div
      className="sh-notif"
      ref={wrapRef}
      onBlur={(e) => {
        // Uscendo dal pannello con Tab si chiude; un clic su un'area non focalizzabile non conta.
        if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) close()
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn sh-icon-btn"
        aria-label={`Notifiche: ${count}`}
        title="Notifiche"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenOn(open ? null : routeKey)}
      >
        <Bell size={20} aria-hidden="true" />
        {count > 0 && (
          <span className="badge-count" aria-hidden="true">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      <section id={panelId} className="sh-notif-panel" aria-labelledby={headingId} hidden={!open}>
        <header className="sh-notif-head">
          <h2 id={headingId}>Da non perdere</h2>
          {count > 0 && (
            <span className="pill" data-tone="negative">
              {count === 1 ? '1 elemento' : `${count} elementi`}
            </span>
          )}
        </header>

        {count === 0 ? (
          <div className="sh-notif-empty">
            <span className="sh-notif-empty-icon" aria-hidden="true">
              <CircleCheck size={22} />
            </span>
            <h3>Tutto in ordine</h3>
            <p>Nessuna attività in ritardo, nessuna scadenza nei prossimi 7 giorni e nessun appuntamento imminente.</p>
          </div>
        ) : (
          <div className="sh-notif-body">
            {groups.map((g) => (
              <div key={g.kind} className="sh-notif-group">
                <h3 className="sh-notif-group-label">
                  {g.label} <span className="sh-notif-group-count">({g.items.length})</span>
                </h3>
                <ul>
                  {g.items.map((item) => {
                    const Icon = KIND_ICON[item.kind]
                    return (
                      <li key={item.id}>
                        <a className="sh-notif-item" href={itemHref(item)} onClick={close}>
                          <span
                            className="sh-notif-icon"
                            style={{ color: TONE_COLOR[item.tone], background: TONE_BG[item.tone] }}
                            aria-hidden="true"
                          >
                            <Icon size={16} />
                          </span>
                          <span className="sh-notif-text">
                            <span className="sh-notif-title">{item.title}</span>
                            <span className="sh-notif-detail" data-tone={item.tone}>
                              {item.detail}
                            </span>
                          </span>
                          <ChevronRight className="sh-notif-chevron" size={16} aria-hidden="true" />
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        <footer className="sh-notif-foot">
          <a href={buildHref('attivita')} onClick={close}>
            Tutte le attività
          </a>
          <a href={buildHref('pratiche', { vista: 'scadenze' })} onClick={close}>
            Tutte le scadenze
          </a>
        </footer>
      </section>
    </div>
  )
}
