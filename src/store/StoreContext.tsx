/**
 * Stato globale dell'app (attività, appuntamenti, clienti, pratiche, obiettivi, impostazioni)
 * con salvataggio automatico nel browser.
 *
 * Uso nei componenti:
 *   const data = useAppData()              // lettura
 *   const actions = useActions()           // scrittura: actions.addTask({...}), actions.toggleTask(id)…
 */
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { createDemoData } from '../data/demoSeed'
import { loadAppData, saveAppData, type SaveResult } from '../data/persistence'
import type { AppData, Appointment, Case, Client, Goal, Settings, Task, Training } from '../domain/types'
import { createId } from '../lib/id'
import { nowInRome, nowIso } from '../lib/dates'
import { appReducer, type Action } from './reducer'

const DataContext = createContext<AppData | null>(null)
const DispatchContext = createContext<React.Dispatch<Action> | null>(null)
const SaveStatusContext = createContext<SaveResult>({ ok: true })

function initialState(): AppData {
  return loadAppData() ?? createDemoData(nowInRome().date)
}

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: AppData }) {
  const [state, dispatch] = useReducer(appReducer, undefined, () => initial ?? initialState())
  const [saveStatus, setSaveStatus] = useState<SaveResult>({ ok: true })

  // Salvataggio con debounce: evita di scrivere a ogni tasto premuto nei campi di testo.
  useEffect(() => {
    const timer = window.setTimeout(() => setSaveStatus(saveAppData(state)), 300)
    return () => window.clearTimeout(timer)
  }, [state])

  // Salva subito anche se la pagina viene chiusa durante il debounce.
  const latest = useRef(state)
  useEffect(() => {
    latest.current = state
  }, [state])
  useEffect(() => {
    const flush = () => saveAppData(latest.current)
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  return (
    <DataContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        <SaveStatusContext.Provider value={saveStatus}>{children}</SaveStatusContext.Provider>
      </DispatchContext.Provider>
    </DataContext.Provider>
  )
}

export function useAppData(): AppData {
  const v = useContext(DataContext)
  if (!v) throw new Error('useAppData deve essere usato dentro <StoreProvider>')
  return v
}

export function useDispatch(): React.Dispatch<Action> {
  const v = useContext(DispatchContext)
  if (!v) throw new Error('useDispatch deve essere usato dentro <StoreProvider>')
  return v
}

/** Esito dell'ultimo salvataggio (per mostrare un avviso se il browser non salva). */
export function useSaveStatus(): SaveResult {
  return useContext(SaveStatusContext)
}

export type NewTask = Omit<Task, 'id' | 'createdAt' | 'status'> & Partial<Pick<Task, 'status'>>
export type NewAppointment = Omit<Appointment, 'id' | 'status'> & Partial<Pick<Appointment, 'status'>>
export type NewClient = Omit<Client, 'id'>
export type NewCase = Omit<Case, 'id'>

export interface Actions {
  addTask(task: NewTask): Task
  updateTask(id: string, patch: Partial<Omit<Task, 'id'>>): void
  toggleTask(id: string): void
  deleteTask(id: string): void
  /** Re-inserisce un record eliminato (per "Annulla"). */
  restoreTask(task: Task): void
  addAppointment(appointment: NewAppointment): Appointment
  updateAppointment(id: string, patch: Partial<Omit<Appointment, 'id'>>): void
  deleteAppointment(id: string): void
  restoreAppointment(appointment: Appointment): void
  importAppointments(appointments: Appointment[]): void
  addClient(client: NewClient): Client
  updateClient(id: string, patch: Partial<Omit<Client, 'id'>>): void
  deleteClient(id: string): void
  addCase(c: NewCase): Case
  updateCase(id: string, patch: Partial<Omit<Case, 'id'>>): void
  deleteCase(id: string): void
  restoreCase(c: Case): void
  updateGoal(id: string, patch: Partial<Omit<Goal, 'id'>>): void
  setTraining(training: Training): void
  updateSettings(patch: Partial<Settings>): void
  setQuickNote(text: string): void
  replaceData(data: AppData): void
}

export function useActions(): Actions {
  const dispatch = useDispatch()
  return useMemo<Actions>(
    () => ({
      addTask(input) {
        const task: Task = { status: 'da_fare', ...input, id: createId('t'), createdAt: nowIso() }
        dispatch({ type: 'task/add', task })
        return task
      },
      updateTask: (id, patch) => dispatch({ type: 'task/update', id, patch }),
      toggleTask: (id) => dispatch({ type: 'task/toggle', id, at: nowIso() }),
      deleteTask: (id) => dispatch({ type: 'task/delete', id }),
      restoreTask: (task) => dispatch({ type: 'task/add', task }),
      addAppointment(input) {
        const appointment: Appointment = { status: 'confermato', source: 'manuale', ...input, id: createId('a') }
        dispatch({ type: 'appointment/add', appointment })
        return appointment
      },
      updateAppointment: (id, patch) => dispatch({ type: 'appointment/update', id, patch }),
      deleteAppointment: (id) => dispatch({ type: 'appointment/delete', id }),
      restoreAppointment: (appointment) => dispatch({ type: 'appointment/add', appointment }),
      importAppointments: (appointments) => dispatch({ type: 'appointment/import', appointments }),
      addClient(input) {
        const client: Client = { ...input, id: createId('c') }
        dispatch({ type: 'client/add', client })
        return client
      },
      updateClient: (id, patch) => dispatch({ type: 'client/update', id, patch }),
      deleteClient: (id) => dispatch({ type: 'client/delete', id }),
      addCase(input) {
        const c: Case = { ...input, id: createId('k') }
        dispatch({ type: 'case/add', case: c })
        return c
      },
      updateCase: (id, patch) => dispatch({ type: 'case/update', id, patch }),
      deleteCase: (id) => dispatch({ type: 'case/delete', id }),
      restoreCase: (c) => dispatch({ type: 'case/add', case: c }),
      updateGoal: (id, patch) => dispatch({ type: 'goal/update', id, patch }),
      setTraining: (training) => dispatch({ type: 'training/set', training }),
      updateSettings: (patch) => dispatch({ type: 'settings/update', patch }),
      setQuickNote: (text) => dispatch({ type: 'quickNote/set', text }),
      replaceData: (data) => dispatch({ type: 'data/replace', data }),
    }),
    [dispatch],
  )
}
