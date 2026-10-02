import {
  ArrowDown,
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  CircleCheck,
  History,
  ListChecks,
  ShieldAlert,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Pill } from '../../components/ui/Pill'
import { addDays } from '../../lib/dates'
import { formatCurrency, formatDayMonth, formatNumber } from '../../lib/format'
import { buildHref } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useAppData } from '../../store/StoreContext'
import { clientNameById, computeKpis, currentAppointment, goalProgress } from '../../store/selectors'
import { goalRollover } from './homeLogic'
import './home.css'

/** Porta in vista il widget Obiettivi (id="obiettivi") e gli sposta il focus. */
function scrollToGoals() {
  const target = document.getElementById('obiettivi')
  if (!target) return
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
}

/** Quattro indicatori del giorno: attività, appuntamenti, produzione del mese, scadenze a 30 giorni. */
export function KpiTiles() {
  const data = useAppData()
  const now = useNow()
  const kpis = useMemo(() => computeKpis(data, now), [data, now])
  const current = useMemo(() => currentAppointment(data.appointments, now), [data.appointments, now])

  // ---- appuntamenti: in corso / prossimo di oggi
  let appointmentMeta: ReactNode
  if (current) {
    appointmentMeta = (
      <span className="hm-kpi-note truncate">
        <span className="hm-live-dot" aria-hidden="true" />
        In corso: {current.title}
      </span>
    )
  } else if (kpis.nextAppointment && kpis.nextAppointment.date === now.date) {
    const next = kpis.nextAppointment
    const who = clientNameById(data.clients, next.clientId) || next.title
    appointmentMeta = (
      <span className="hm-kpi-note truncate">
        Prossimo: <span className="num strong">{next.start}</span> · {who}
      </span>
    )
  } else {
    appointmentMeta = (
      <span className="hm-kpi-note">{kpis.appointmentsToday > 0 ? 'Nessun altro oggi' : 'Nessuno in programma'}</span>
    )
  }

  // ---- produzione del mese (se il valore è ancora del mese scorso non lo si spaccia per quello di questo mese)
  const production = kpis.productionMonth
  const productionStale = production ? goalRollover([production], 'mese', now.date) : undefined
  const productionPct = production ? Math.round(goalProgress(production) * 100) : 0

  let productionMeta: ReactNode
  if (production && productionStale) {
    productionMeta = (
      <span className="hm-kpi-meta">
        <Pill tone="warning">
          <History size={12} aria-hidden="true" />
          Da aggiornare
        </Pill>
        <span className="hm-kpi-note">ultimo dato: {productionStale.periodLabel}</span>
      </span>
    )
  } else if (production && production.target > 0) {
    productionMeta = (
      <span className="hm-kpi-meta hm-kpi-meta-stack">
        <span
          className="meter hm-kpi-meter"
          data-tone={productionPct >= 100 ? 'positive' : undefined}
          role="progressbar"
          aria-label="Avanzamento della produzione del mese"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, productionPct)}
        >
          <span style={{ width: `${Math.min(100, productionPct)}%` }} />
        </span>
        <span className="hm-kpi-note">
          <span className="num strong">{formatNumber(productionPct)}%</span> di{' '}
          <span className="num">{formatCurrency(production.target)}</span>
        </span>
      </span>
    )
  } else {
    productionMeta = (
      <span className="hm-kpi-meta">
        <span className="hm-kpi-note">Nessun obiettivo impostato</span>
      </span>
    )
  }

  return (
    <section className="hm-kpis" aria-labelledby="hm-kpis-title">
      <h2 id="hm-kpis-title" className="visually-hidden">
        Indicatori del giorno
      </h2>
      <ul className="hm-kpi-grid">
        <li>
          <a className="hm-kpi" href={buildHref('attivita')}>
            <TileHead icon={ListChecks} label="Attività di oggi" />
            <span className="hm-kpi-value num">{formatNumber(kpis.tasksOpenToday)}</span>
            <span className="hm-kpi-meta">
              {kpis.tasksOverdue > 0 ? (
                <Pill tone="negative">
                  <TriangleAlert size={12} aria-hidden="true" />
                  {formatNumber(kpis.tasksOverdue)} in ritardo
                </Pill>
              ) : (
                <Pill tone="positive">
                  <CircleCheck size={12} aria-hidden="true" />
                  Tutto in regola
                </Pill>
              )}
              <span className="hm-kpi-note">
                {formatNumber(kpis.tasksDoneToday)} {kpis.tasksDoneToday === 1 ? 'completata' : 'completate'}
              </span>
            </span>
          </a>
        </li>

        <li>
          <a className="hm-kpi" href={buildHref('agenda', { giorno: now.date, vista: 'giorno' })}>
            <TileHead icon={CalendarDays} label="Appuntamenti oggi" />
            <span className="hm-kpi-value num">{formatNumber(kpis.appointmentsToday)}</span>
            <span className="hm-kpi-meta">{appointmentMeta}</span>
          </a>
        </li>

        <li>
          <button type="button" className="hm-kpi" onClick={scrollToGoals}>
            <TileHead icon={TrendingUp} label="Produzione del mese" arrow="scroll" />
            <span className="hm-kpi-value num">
              {production && !productionStale ? formatCurrency(production.current) : '—'}
            </span>
            {productionMeta}
            <span className="visually-hidden"> · Mostra gli obiettivi</span>
          </button>
        </li>

        <li>
          {/* Stesso perimetro del KPI (adempimenti, scadute incluse): la pagina Pratiche filtra con tipo=adempimenti */}
          <a className="hm-kpi" href={buildHref('pratiche', { vista: 'scadenze', tipo: 'adempimenti' })}>
            <TileHead icon={CalendarClock} label={"Scadenze 30\u00a0gg"} />
            <span className="hm-kpi-value num">{formatNumber(kpis.deadlines30)}</span>
            <span className="hm-kpi-meta">
              {kpis.deadlinesUrgent > 0 ? (
                <Pill tone="negative">
                  <ShieldAlert size={12} aria-hidden="true" />
                  {formatNumber(kpis.deadlinesUrgent)} {kpis.deadlinesUrgent === 1 ? 'scaduta o urgente' : 'scadute o urgenti'}
                </Pill>
              ) : (
                <Pill tone="positive">
                  <CircleCheck size={12} aria-hidden="true" />
                  Nessuna scaduta o urgente
                </Pill>
              )}
              <span className="hm-kpi-note">fino al {formatDayMonth(addDays(now.date, 30))}</span>
            </span>
          </a>
        </li>
      </ul>
    </section>
  )
}

function TileHead({ icon: Icon, label, arrow = 'link' }: { icon: LucideIcon; label: string; arrow?: 'link' | 'scroll' }) {
  const Arrow = arrow === 'scroll' ? ArrowDown : ArrowUpRight
  return (
    <span className="hm-kpi-head">
      <span className="hm-kpi-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="hm-kpi-label">{label}</span>
      <Arrow className="hm-kpi-arrow" size={16} aria-hidden="true" />
    </span>
  )
}
