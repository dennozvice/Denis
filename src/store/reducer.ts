/** Reducer dello stato applicativo: tutte le modifiche ai dati passano da qui. */
import type {
  AppData,
  Appointment,
  Case,
  Client,
  Goal,
  IsoInstant,
  Settings,
  Task,
  Training,
} from '../domain/types'

export type Action =
  | { type: 'task/add'; task: Task }
  | { type: 'task/update'; id: string; patch: Partial<Omit<Task, 'id'>> }
  /** Segna come completata / riapre. `at` = istante del completamento. */
  | { type: 'task/toggle'; id: string; at: IsoInstant }
  | { type: 'task/delete'; id: string }
  | { type: 'appointment/add'; appointment: Appointment }
  | { type: 'appointment/update'; id: string; patch: Partial<Omit<Appointment, 'id'>> }
  | { type: 'appointment/delete'; id: string }
  /** Import da calendario: aggiorna per externalId, aggiunge i nuovi. */
  | { type: 'appointment/import'; appointments: Appointment[] }
  | { type: 'client/add'; client: Client }
  | { type: 'client/update'; id: string; patch: Partial<Omit<Client, 'id'>> }
  /** Elimina il cliente e scollega attività, appuntamenti e pratiche che lo citavano. */
  | { type: 'client/delete'; id: string }
  | { type: 'case/add'; case: Case }
  | { type: 'case/update'; id: string; patch: Partial<Omit<Case, 'id'>> }
  | { type: 'case/delete'; id: string }
  | { type: 'goal/update'; id: string; patch: Partial<Omit<Goal, 'id'>> }
  | { type: 'training/set'; training: Training }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'quickNote/set'; text: string }
  /** Sostituisce tutto (ripristino backup, reset demo, dati vuoti). */
  | { type: 'data/replace'; data: AppData }

function patchById<T extends { id: string }>(list: T[], id: string, patch: Partial<Omit<T, 'id'>>): T[] {
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item))
}

const without = <T extends { id: string }>(list: T[], id: string): T[] => list.filter((item) => item.id !== id)

/** Rimuove `clientId` (opzionale) dai record collegati a un cliente eliminato. */
function unlinkClient<T extends { clientId?: string }>(list: T[], clientId: string): T[] {
  return list.map((item) => {
    if (item.clientId !== clientId) return item
    const copy = { ...item }
    delete copy.clientId
    return copy
  })
}

/**
 * Azioni con cui l'utente modifica i record: da quel momento la demo non viene più
 * "spostata" in avanti ogni giorno (altrimenti si sposterebbero anche le date inserite a mano).
 */
const USER_EDITS = new Set<Action['type']>([
  'task/add',
  'task/update',
  'task/toggle',
  'task/delete',
  'appointment/add',
  'appointment/update',
  'appointment/delete',
  'appointment/import',
  'client/add',
  'client/update',
  'client/delete',
  'case/add',
  'case/update',
  'case/delete',
])

export function appReducer(state: AppData, action: Action): AppData {
  const next = reduce(state, action)
  if (next !== state && next.demoGeneratedOn && USER_EDITS.has(action.type)) {
    const frozen = { ...next }
    delete frozen.demoGeneratedOn
    return frozen
  }
  return next
}

function reduce(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'task/add':
      return { ...state, tasks: [...state.tasks, action.task] }
    case 'task/update':
      return { ...state, tasks: patchById(state.tasks, action.id, action.patch) }
    case 'task/toggle':
      return {
        ...state,
        tasks: state.tasks.map((t) => {
          if (t.id !== action.id) return t
          if (t.status === 'completata') {
            const reopened: Task = { ...t, status: 'da_fare' }
            delete reopened.completedAt
            return reopened
          }
          return { ...t, status: 'completata', completedAt: action.at }
        }),
      }
    case 'task/delete':
      return { ...state, tasks: without(state.tasks, action.id) }

    case 'appointment/add':
      return { ...state, appointments: [...state.appointments, action.appointment] }
    case 'appointment/update':
      return { ...state, appointments: patchById(state.appointments, action.id, action.patch) }
    case 'appointment/delete':
      return { ...state, appointments: without(state.appointments, action.id) }
    case 'appointment/import': {
      const byExternal = new Map(action.appointments.filter((a) => a.externalId).map((a) => [a.externalId!, a]))
      const updated = state.appointments.map((a) => {
        const incoming = a.externalId ? byExternal.get(a.externalId) : undefined
        if (!incoming) return a
        byExternal.delete(a.externalId!)
        // dal calendario si aggiornano solo titolo, data, orari e luogo; tipo, stato, esito, note e
        // cliente restano quelli decisi nell'app
        return {
          ...a,
          title: incoming.title,
          date: incoming.date,
          start: incoming.start,
          end: incoming.end,
          location: incoming.location,
          locationDetail: incoming.locationDetail,
          clientId: a.clientId ?? incoming.clientId,
        }
      })
      const fresh = action.appointments.filter((a) => !a.externalId || byExternal.has(a.externalId))
      return { ...state, appointments: [...updated, ...fresh] }
    }

    case 'client/add':
      return { ...state, clients: [...state.clients, action.client] }
    case 'client/update':
      return { ...state, clients: patchById(state.clients, action.id, action.patch) }
    case 'client/delete':
      return {
        ...state,
        clients: without(state.clients, action.id),
        tasks: unlinkClient(state.tasks, action.id),
        appointments: unlinkClient(state.appointments, action.id),
        cases: unlinkClient(state.cases, action.id),
      }

    case 'case/add':
      return { ...state, cases: [...state.cases, action.case] }
    case 'case/update':
      return { ...state, cases: patchById(state.cases, action.id, action.patch) }
    case 'case/delete':
      return { ...state, cases: without(state.cases, action.id) }

    case 'goal/update':
      return { ...state, goals: patchById(state.goals, action.id, action.patch) }
    case 'training/set':
      return { ...state, training: action.training }
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'quickNote/set':
      return { ...state, quickNote: action.text }
    case 'data/replace':
      return action.data
  }
}
