/**
 * Mantiene "fresca" la demo: se i dati dimostrativi sono stati generati giorni fa,
 * tutte le date vengono spostate in avanti dello stesso numero di giorni.
 * Così aprendo l'app una settimana dopo non risulta tutto "in ritardo".
 * Si applica solo finché l'utente lavora sui dati dimostrativi (isDemo = true).
 */
import type { AppData, DateKey, IsoInstant } from '../domain/types'
import { addDays, diffDays, isDateKey } from '../lib/dates'

const shiftKey = <T extends DateKey | undefined>(key: T, days: number): T =>
  (key && isDateKey(key) ? addDays(key, days) : key) as T

function shiftInstant(instant: IsoInstant | undefined, days: number): IsoInstant | undefined {
  if (!instant) return instant
  const ms = Date.parse(instant)
  return Number.isNaN(ms) ? instant : new Date(ms + days * 86_400_000).toISOString()
}

export function shiftDemoData(data: AppData, today: DateKey): AppData {
  if (!data.isDemo || !data.demoGeneratedOn || !isDateKey(data.demoGeneratedOn)) return data
  const days = diffDays(data.demoGeneratedOn, today)
  if (days <= 0) return data
  return {
    ...data,
    demoGeneratedOn: today,
    tasks: data.tasks.map((t) => ({
      ...t,
      dueDate: shiftKey(t.dueDate, days),
      createdAt: shiftInstant(t.createdAt, days) ?? t.createdAt,
      completedAt: shiftInstant(t.completedAt, days),
    })),
    appointments: data.appointments.map((a) => ({ ...a, date: shiftKey(a.date, days) })),
    clients: data.clients.map((c) => ({
      ...c,
      birthDate: shiftKey(c.birthDate, days),
      docExpiry: shiftKey(c.docExpiry, days),
      amlReviewDue: shiftKey(c.amlReviewDue, days),
      iddQuestionnaireDate: shiftKey(c.iddQuestionnaireDate, days),
      lastContact: shiftKey(c.lastContact, days),
      policies: c.policies.map((p) => ({
        ...p,
        startDate: shiftKey(p.startDate, days),
        maturityDate: shiftKey(p.maturityDate, days),
      })),
    })),
    cases: data.cases.map((k) => ({ ...k, openedOn: shiftKey(k.openedOn, days), dueDate: shiftKey(k.dueDate, days) })),
    training: {
      ...data.training,
      courses: data.training.courses.map((c) => ({ ...c, dueDate: shiftKey(c.dueDate, days) })),
    },
  }
}
