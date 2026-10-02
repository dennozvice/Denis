import type { LucideIcon } from 'lucide-react'
import { ArrowLeftRight, Banknote, Forward, HandCoins, Hourglass, MessageSquareWarning, PiggyBank, Umbrella, Users, Wallet } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Pill } from '../../components/ui/Pill'
import { CASE_STATUS_LABEL, CASE_STATUS_TONE } from '../../domain/labels'
import type { Case, CaseStatus, CaseType, DateKey } from '../../domain/types'
import { diffDays } from '../../lib/dates'
import { formatCurrency, formatNumber, formatRelativeDaysChip } from '../../lib/format'
import { caseDueDate } from '../../store/selectors'
import { formatDeadlineDate, toneVars } from '../deadlines/deadlineUtils'
import { CASE_TYPE_TONE, caseDueHint, caseDueTone } from './caseUtils'
import './cases.css'

export const CASE_TYPE_ICON: Record<CaseType, LucideIcon> = {
  riscatto: HandCoins,
  sinistro: Umbrella,
  liquidazione_scadenza: Banknote,
  variazione_beneficiario: Users,
  versamento_aggiuntivo: PiggyBank,
  switch: ArrowLeftRight,
  anticipazione: Wallet,
  trasferimento: Forward,
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
  return formatRelativeDaysChip(daysLeft)
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
    <Pill tone={days <= 7 ? 'negative' : 'warning'} title={caseDueHint('reclamo')}>
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

/**
 * Cambio rapido dello stato dall'elenco.
 * Con la tastiera le frecce scorrono gli stati senza applicarli (il valore resta "in sospeso"):
 * si conferma con Invio o uscendo dal campo, Esc annulla. Con mouse o tocco la scelta dal menu
 * si applica subito. Così scorrendo fino a "Chiusa" la pratica non sparisce dall'elenco per sbaglio.
 */
export function CaseStatusSelect({ caseItem, onCommit }: { caseItem: Case; onCommit(next: CaseStatus): void }) {
  const uid = useId()
  const [pending, setPending] = useState<CaseStatus | null>(null)
  // true se l'ultima interazione con il campo è stata da tastiera (le frecce cambiano il valore senza aprire il menu)
  const fromKeyboard = useRef(false)
  const value = pending ?? caseItem.status

  const commit = (next: CaseStatus) => {
    setPending(null)
    if (next !== caseItem.status) onCommit(next)
  }

  return (
    <span className="cs-status" style={toneVars(CASE_STATUS_TONE[value])}>
      <label htmlFor={`${uid}-status`} className="visually-hidden">
        Stato della pratica {caseItem.title}
      </label>
      <select
        id={`${uid}-status`}
        className="select cs-status-select"
        value={value}
        data-pending={pending !== null ? '' : undefined}
        aria-describedby={`${uid}-hint`}
        onPointerDown={() => {
          fromKeyboard.current = false
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && pending !== null) {
            e.preventDefault()
            commit(pending)
          } else if (e.key === 'Escape' && pending !== null) {
            e.preventDefault()
            setPending(null)
          } else if (e.key !== 'Tab') {
            fromKeyboard.current = true
          }
        }}
        onChange={(e) => {
          const next = e.target.value as CaseStatus
          if (fromKeyboard.current) setPending(next === caseItem.status ? null : next)
          else commit(next)
        }}
        onBlur={() => {
          if (pending !== null) commit(pending)
        }}
      >
        {CASE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {CASE_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <span id={`${uid}-hint`} className="visually-hidden">
        Con la tastiera conferma con Invio, Esc annulla
      </span>
    </span>
  )
}
