import { Check, Pencil, Target } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Meter } from '../../components/ui/Meter'
import { Pill } from '../../components/ui/Pill'
import { useToast } from '../../components/ui/Toast'
import type { Tone } from '../../domain/labels'
import type { DateKey, Goal } from '../../domain/types'
import { formatMonthYear, formatNumber } from '../../lib/format'
import { useNow } from '../../store/NowContext'
import { useActions, useAppData } from '../../store/StoreContext'
import { formatGoalValue, goalStatus, parseItalianNumber, toInputValue, type GoalPace } from './homeLogic'
import './home.css'

const PACE: Record<GoalPace, { label: string; tone: Tone; meter: 'primary' | 'positive' | 'warning' }> = {
  raggiunto: { label: 'Raggiunto', tone: 'positive', meter: 'positive' },
  in_linea: { label: 'In linea', tone: 'positive', meter: 'primary' },
  sotto_ritmo: { label: 'Sotto il ritmo', tone: 'warning', meter: 'warning' },
  non_impostato: { label: 'Da impostare', tone: 'neutral', meter: 'primary' },
}

interface GoalGroup {
  key: Goal['period']
  title: string
  goals: Goal[]
}

function groupGoals(goals: Goal[], today: DateKey, year: number): GoalGroup[] {
  const month = formatMonthYear(today).replace(/\s*\d{4}$/, '')
  const groups: GoalGroup[] = [
    { key: 'mese', title: `Questo mese (${month})`, goals: goals.filter((g) => g.period === 'mese') },
    { key: 'anno', title: `Anno ${year}`, goals: goals.filter((g) => g.period === 'anno') },
  ]
  return groups.filter((g) => g.goals.length > 0)
}

/**
 * Obiettivi commerciali del mese e dell'anno, con confronto rispetto al ritmo atteso.
 * I valori si aggiornano a mano ("Aggiorna"): non c'è un collegamento ai sistemi della compagnia.
 */
export function GoalsWidget() {
  const { goals } = useAppData()
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
        <GoalsEditor groups={groups} onDone={finishEditing} />
      ) : (
        <>
          {groups.map((group) => (
            <div key={group.key} className="hm-goal-group">
              <h3 className="hm-group-title">{group.title}</h3>
              <ul className="hm-goal-list">
                {group.goals.map((goal) => (
                  <GoalRow key={goal.id} goal={goal} today={now.date} />
                ))}
              </ul>
            </div>
          ))}
          <p className="hm-goal-legend">
            <span className="hm-goal-legend-tick" aria-hidden="true" />
            La tacca indica il ritmo atteso a oggi
          </p>
        </>
      )}
    </Card>
  )
}

function GoalRow({ goal, today }: { goal: Goal; today: DateKey }) {
  const { progress, expected, pace } = goalStatus(goal, today)
  const style = PACE[pace]
  const pct = Math.round(progress * 100)
  const expectedPct = Math.round(expected * 100)
  return (
    <li className="hm-goal">
      <div className="hm-goal-top">
        <span className="hm-goal-label">{goal.label}</span>
        <Pill tone={style.tone}>
          {pace === 'raggiunto' && <Check size={12} aria-hidden="true" />}
          {style.label}
        </Pill>
      </div>
      <div className="hm-goal-track">
        <Meter value={progress} label={`Avanzamento: ${goal.label}`} tone={style.meter} />
        {pace !== 'non_impostato' && (
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
          {formatNumber(pct)}%<span className="visually-hidden">, ritmo atteso {formatNumber(expectedPct)}%</span>
        </span>
      </div>
    </li>
  )
}

interface DraftValue {
  current: string
  target: string
}

function GoalsEditor({ groups, onDone }: { groups: GoalGroup[]; onDone(): void }) {
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
    let changed = 0
    for (const { goal, current, target } of parsed) {
      if (goal.current !== current || goal.target !== target) {
        updateGoal(goal.id, { current, target })
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
      {groups.map((group) => (
        <fieldset key={group.key} className="hm-goal-fieldset">
          <legend className="hm-group-title">{group.title}</legend>
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
