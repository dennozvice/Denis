import { Check, History, Pencil, RotateCcw, Target } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Meter } from '../../components/ui/Meter'
import { Pill } from '../../components/ui/Pill'
import { useToast } from '../../components/ui/Toast'
import type { Tone } from '../../domain/labels'
import type { DateKey, Goal } from '../../domain/types'
import { goalPeriodKey } from '../../data/demoSeed'
import { formatNumber } from '../../lib/format'
import { useNow } from '../../store/NowContext'
import { useActions, useAppData } from '../../store/StoreContext'
import {
  formatGoalValue,
  goalRollover,
  goalStatus,
  isGoalStale,
  monthName,
  parseItalianNumber,
  toInputValue,
  type GoalPace,
  type GoalRollover,
} from './homeLogic'
import './home.css'

const PACE: Record<GoalPace, { label: string; tone: Tone; meter: 'primary' | 'positive' | 'warning' }> = {
  raggiunto: { label: 'Raggiunto', tone: 'positive', meter: 'positive' },
  in_linea: { label: 'In linea', tone: 'positive', meter: 'primary' },
  sotto_ritmo: { label: 'Sotto il ritmo', tone: 'warning', meter: 'warning' },
  non_impostato: { label: 'Da impostare', tone: 'neutral', meter: 'primary' },
}

/** Obiettivo con i valori del periodo precedente. */
const STALE: (typeof PACE)[GoalPace] = { label: 'Da aggiornare', tone: 'neutral', meter: 'primary' }

interface GoalGroup {
  key: Goal['period']
  title: string
  goals: Goal[]
  /** Presente se alcuni valori sono ancora del periodo precedente (mese o anno appena concluso). */
  rollover?: GoalRollover
}

function groupGoals(goals: Goal[], today: DateKey, year: number): GoalGroup[] {
  const groups: GoalGroup[] = [
    { key: 'mese', title: `Questo mese (${monthName(today)})`, goals: goals.filter((g) => g.period === 'mese') },
    { key: 'anno', title: `Anno ${year}`, goals: goals.filter((g) => g.period === 'anno') },
  ]
  return groups
    .filter((g) => g.goals.length > 0)
    .map((g) => ({ ...g, rollover: goalRollover(g.goals, g.key, today) }))
}

/**
 * Obiettivi commerciali del mese e dell'anno, con confronto rispetto al ritmo atteso.
 * I valori si aggiornano a mano ("Aggiorna"): non c'è un collegamento ai sistemi della compagnia.
 */
export function GoalsWidget() {
  const { goals } = useAppData()
  const { updateGoal } = useActions()
  const toast = useToast()
  const now = useNow()
  const [editing, setEditing] = useState(false)
  const editButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)

  // Uscendo dalla modifica il focus torna sul bottone "Aggiorna".
  useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false
      editButton.current?.focus()
    }
  }, [editing])

  const finishEditing = () => {
    restoreFocus.current = true
    setEditing(false)
  }

  const groups = groupGoals(goals, now.date, now.year)

  // Nuovo mese (o anno): i valori del periodo concluso si azzerano, con possibilità di annullare.
  const startNewPeriod = (rollover: GoalRollover) => {
    const previous = rollover.goals.map((g) => ({ id: g.id, current: g.current, periodKey: g.periodKey }))
    for (const g of rollover.goals) updateGoal(g.id, { current: 0, periodKey: rollover.periodKey })
    toast({
      message: rollover.goals.length === 1 ? 'Obiettivo azzerato' : 'Obiettivi azzerati',
      actionLabel: 'Annulla',
      onAction: () => {
        for (const p of previous) updateGoal(p.id, { current: p.current, periodKey: p.periodKey })
      },
    })
    // L'avviso sparisce: il focus va su "Aggiorna", il passo successivo naturale.
    editButton.current?.focus()
  }

  return (
    <Card
      id="obiettivi"
      className="hm-goals"
      title="Obiettivi"
      subtitle="Valori aggiornati manualmente"
      actions={
        goals.length > 0 && !editing ? (
          <button ref={editButton} type="button" className="btn btn-sm btn-ghost hm-tap" onClick={() => setEditing(true)}>
            <Pencil size={14} aria-hidden="true" />
            Aggiorna
          </button>
        ) : undefined
      }
    >
      {goals.length === 0 ? (
        <EmptyState icon={Target} title="Nessun obiettivo" text="Gli obiettivi di produzione compariranno qui." />
      ) : editing ? (
        <GoalsEditor groups={groups} today={now.date} onDone={finishEditing} />
      ) : (
        <>
          <div className="hm-goal-columns">
            {groups.map((group) => (
              <div key={group.key} className="hm-goal-group">
                <h3 className="hm-group-title">{group.title}</h3>
                {group.rollover && <RolloverNotice rollover={group.rollover} onStart={startNewPeriod} />}
                <ul className="hm-goal-list">
                  {group.goals.map((goal) => (
                    <GoalRow key={goal.id} goal={goal} today={now.date} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="hm-goal-legend">
            <span className="hm-goal-legend-tick" aria-hidden="true" />
            La tacca indica il ritmo atteso a oggi
          </p>
        </>
      )}
    </Card>
  )
}

/** Avviso "I valori si riferiscono a settembre 2026" con il pulsante per iniziare il periodo nuovo. */
function RolloverNotice({ rollover, onStart }: { rollover: GoalRollover; onStart(rollover: GoalRollover): void }) {
  return (
    <div className="hm-goal-stale">
      <p className="hm-goal-stale-text">
        <History size={14} aria-hidden="true" />
        {rollover.notice}
      </p>
      <button type="button" className="btn btn-sm hm-tap" onClick={() => onStart(rollover)}>
        <RotateCcw size={14} aria-hidden="true" />
        {rollover.action}
      </button>
    </div>
  )
}

function GoalRow({ goal, today }: { goal: Goal; today: DateKey }) {
  const { progress, expected, pace } = goalStatus(goal, today)
  // Valori del periodo precedente: il confronto con il ritmo di oggi non avrebbe senso.
  const stale = isGoalStale(goal, today)
  const style = stale ? STALE : PACE[pace]
  const pct = Math.round(progress * 100)
  const expectedPct = Math.round(expected * 100)
  return (
    <li className="hm-goal">
      <div className="hm-goal-top">
        <span className="hm-goal-label">{goal.label}</span>
        <Pill tone={style.tone}>
          {!stale && pace === 'raggiunto' && <Check size={12} aria-hidden="true" />}
          {style.label}
        </Pill>
      </div>
      <div className="hm-goal-track">
        <Meter value={progress} label={`Avanzamento: ${goal.label}`} tone={style.meter} />
        {!stale && pace !== 'non_impostato' && (
          <span className="hm-goal-tick" style={{ left: `${Math.min(100, expected * 100)}%` }} aria-hidden="true" />
        )}
      </div>
      <div className="hm-goal-nums">
        <span>
          <span className="num strong">{formatGoalValue(goal.current, goal.unit)}</span>
          <span className="muted"> di </span>
          <span className="num">{formatGoalValue(goal.target, goal.unit)}</span>
        </span>
        <span className="num muted">
          {formatNumber(pct)}%
          {!stale && <span className="visually-hidden">, ritmo atteso {formatNumber(expectedPct)}%</span>}
        </span>
      </div>
    </li>
  )
}

interface DraftValue {
  current: string
  target: string
}

function GoalsEditor({ groups, today, onDone }: { groups: GoalGroup[]; today: DateKey; onDone(): void }) {
  const { updateGoal } = useActions()
  const toast = useToast()
  const formId = useId()
  const allGoals = groups.flatMap((g) => g.goals)
  const [draft, setDraft] = useState<Record<string, DraftValue>>(() =>
    Object.fromEntries(allGoals.map((g) => [g.id, { current: toInputValue(g.current), target: toInputValue(g.target) }])),
  )
  const [invalid, setInvalid] = useState<Set<string>>(() => new Set())

  const valueOf = (id: string, field: keyof DraftValue) => draft[id]?.[field] ?? ''

  const setField = (id: string, field: keyof DraftValue, value: string) => {
    setDraft((d) => {
      const prev: DraftValue = d[id] ?? { current: '', target: '' }
      return { ...d, [id]: { ...prev, [field]: value } }
    })
    if (invalid.has(`${id}:${field}`)) {
      setInvalid((s) => {
        const next = new Set(s)
        next.delete(`${id}:${field}`)
        return next
      })
    }
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const errors = new Set<string>()
    const parsed: { goal: Goal; current: number; target: number }[] = []
    for (const goal of allGoals) {
      const current = parseItalianNumber(valueOf(goal.id, 'current'))
      const target = parseItalianNumber(valueOf(goal.id, 'target'))
      if (current === undefined || current < 0) errors.add(`${goal.id}:current`)
      if (target === undefined || target <= 0) errors.add(`${goal.id}:target`)
      if (current !== undefined && target !== undefined) parsed.push({ goal, current, target })
    }
    if (errors.size > 0) {
      setInvalid(errors)
      const first = [...errors][0]
      document.getElementById(`${formId}-${first.replace(':', '-')}`)?.focus()
      return
    }
    // Salvando, i valori inseriti diventano quelli del periodo in corso.
    let changed = 0
    for (const { goal, current, target } of parsed) {
      const periodKey = goalPeriodKey(goal.period, today)
      if (goal.current !== current || goal.target !== target || goal.periodKey !== periodKey) {
        updateGoal(goal.id, { current, target, periodKey })
        changed++
      }
    }
    if (changed > 0) toast({ message: changed === 1 ? 'Obiettivo aggiornato' : 'Obiettivi aggiornati' })
    onDone()
  }

  return (
    <form
      className="hm-goal-form"
      onSubmit={submit}
      noValidate
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onDone()
        }
      }}
    >
      <div className="hm-goal-columns">
        {groups.map((group) => (
          <fieldset key={group.key} className="hm-goal-fieldset">
            <legend className="hm-group-title">{group.title}</legend>
            {group.rollover && <p className="hm-goal-stale-hint">{group.rollover.editHint}</p>}
            {group.goals.map((goal, index) => {
              const suffix = goal.unit === 'EUR' ? ' (€)' : ''
              return (
                <div key={goal.id} className="hm-goal-edit">
                  <span className="hm-goal-label">{goal.label}</span>
                  <div className="hm-goal-inputs">
                    {(['current', 'target'] as const).map((field) => {
                      const key = `${goal.id}:${field}`
                      const isInvalid = invalid.has(key)
                      const inputId = `${formId}-${goal.id}-${field}`
                      return (
                        <div key={field} className="field">
                          <label htmlFor={inputId} className="field-label">
                            <span className="visually-hidden">{goal.label}: </span>
                            {field === 'current' ? 'Attuale' : 'Obiettivo'}
                            {suffix}
                          </label>
                          <input
                            id={inputId}
                            className="input num"
                            type="text"
                            inputMode={goal.unit === 'EUR' ? 'decimal' : 'numeric'}
                            autoComplete="off"
                            autoFocus={group === groups[0] && index === 0 && field === 'current'}
                            value={valueOf(goal.id, field)}
                            aria-invalid={isInvalid || undefined}
                            aria-describedby={isInvalid ? `${inputId}-err` : undefined}
                            onChange={(e) => setField(goal.id, field, e.target.value)}
                          />
                          {isInvalid && (
                            <span id={`${inputId}-err`} className="hm-field-error">
                              {field === 'target' ? 'Inserisci un numero maggiore di zero' : 'Inserisci un numero valido'}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </fieldset>
        ))}
      </div>
      <div className="hm-form-actions">
        <button type="button" className="btn btn-sm hm-tap" onClick={onDone}>
          Annulla
        </button>
        <button type="submit" className="btn btn-sm btn-primary hm-tap">
          <Check size={14} aria-hidden="true" />
          Salva
        </button>
      </div>
    </form>
  )
}
