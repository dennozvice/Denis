import type { LucideIcon } from 'lucide-react'
import { ArrowLeftRight, Banknote, HandCoins, Hourglass, MessageSquareWarning, PiggyBank, Umbrella, Users } from 'lucide-react'
import { Pill } from '../../components/ui/Pill'
import { useToast } from '../../components/ui/Toast'
import { CASE_STATUS_LABEL, CASE_STATUS_TONE, CASE_TYPE_LABEL } from '../../domain/labels'
import type { Case, CaseStatus, CaseType, DateKey } from '../../domain/types'
import { diffDays } from '../../lib/dates'
import { formatCurrency, formatNumber } from '../../lib/format'
import { useActions } from '../../store/StoreContext'
import { formatDeadlineDate, toneVars } from '../deadlines/deadlineUtils'
import { CASE_TYPE_TONE, caseDueDate, caseDueTone } from './caseUtils'
import './cases.css'

export const CASE_TYPE_ICON: Record<CaseType, LucideIcon> = {
  riscatto: HandCoins,
  sinistro: Umbrella,
  liquidazione_scadenza: Banknote,
  variazione_beneficiario: Users,
  versamento_aggiuntivo: PiggyBank,
  switch: ArrowLeftRight,
  reclamo: MessageSquareWarning,
}

export const CASE_STATUSES = Object.keys(CASE_STATUS_LABEL) as CaseStatus[]

/** Riquadro colorato con l'icona del tipo di pratica (decorativo: il tipo è sempre scritto accanto). */
export function CaseTypeIcon({ type, size = 'md' }: { type: CaseType; size?: 'sm' | 'md' }) {
  const Icon = CASE_TYPE_ICON[type]
  return (
    <span className="cs-type-icon" data-size={size} style={toneVars(CASE_TYPE_TONE[type])} aria-hidden="true">
      <Icon size={size === 'sm' ? 14 : 16} />
    </span>
  )
}

/** Importo in euro: senza decimali se intero. */
export function formatCaseAmount(amount: number): string {
  return formatCurrency(amount, Number.isInteger(amount) ? 0 : 2)
}

/** "Tra 10 gg", "Oggi", "Scaduta da 3 gg" per la scadenza di una pratica. */
export function caseDaysLabel(daysLeft: number): string {
  if (daysLeft < -1) return `Scaduta da ${formatNumber(-daysLeft)} gg`
  if (daysLeft === -1) return 'Scaduta ieri'
  if (daysLeft === 0) return 'Scade oggi'
  if (daysLeft === 1) return 'Domani'
  return `Tra ${formatNumber(daysLeft)} gg`
}

/**
 * Termine di risposta di un reclamo: "Risposta entro 12 ott (10 gg)".
 * Rosso entro 7 giorni o se già scaduto.
 */
export function ReclamoDuePill({ caseItem, today }: { caseItem: Case; today: DateKey }) {
  const due = caseDueDate(caseItem)
  if (!due) return null
  const days = diffDays(today, due)
  const date = formatDeadlineDate(due, today)
  const text =
    days < 0
      ? `Risposta scaduta il ${date} (da ${formatNumber(-days)} gg)`
      : days === 0
        ? `Risposta entro oggi`
        : `Risposta entro ${date} (${formatNumber(days)} gg)`
  return (
    <Pill tone={days <= 7 ? 'negative' : 'warning'} title="Termine di risposta al reclamo: 45 giorni dalla ricezione">
      <Hourglass size={12} aria-hidden="true" />
      {text}
    </Pill>
  )
}

/** Cella "Scadenza": data e giorni mancanti (solo per le pratiche aperte). */
export function CaseDue({ caseItem, today }: { caseItem: Case; today: DateKey }) {
  const due = caseDueDate(caseItem)
  if (!due) {
    return (
      <span className="muted">
        <span aria-hidden="true">—</span>
        <span className="visually-hidden">Nessuna scadenza</span>
      </span>
    )
  }
  const open = caseItem.status !== 'chiusa'
  const days = diffDays(today, due)
  return (
    <span className="cs-due">
      <span className={`cs-due-date num${open ? '' : ' muted'}`}>{formatDeadlineDate(due, today)}</span>
      {open && <Pill tone={caseDueTone(caseItem.type, days)}>{caseDaysLabel(days)}</Pill>}
      {open && caseItem.type === 'reclamo' && <span className="cs-due-note">Termine risposta reclamo</span>}
    </span>
  )
}

/** Cambio rapido dello stato, con "Annulla" nel messaggio di conferma. */
export function CaseStatusSelect({ caseItem }: { caseItem: Case }) {
  const actions = useActions()
  const toast = useToast()
  const change = (next: CaseStatus) => {
    const prev = caseItem.status
    if (next === prev) return
    actions.updateCase(caseItem.id, { status: next })
    toast({
      message: `${CASE_TYPE_LABEL[caseItem.type]}: stato «${CASE_STATUS_LABEL[next]}»`,
      actionLabel: 'Annulla',
      onAction: () => actions.updateCase(caseItem.id, { status: prev }),
    })
  }
  return (
    <label className="cs-status" style={toneVars(CASE_STATUS_TONE[caseItem.status])}>
      <span className="visually-hidden">Stato della pratica {caseItem.title}</span>
      <select className="select cs-status-select" value={caseItem.status} onChange={(e) => change(e.target.value as CaseStatus)}>
        {CASE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {CASE_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </label>
  )
}
