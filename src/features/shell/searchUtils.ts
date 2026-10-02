/**
 * Ricerca globale: normalizzazione del testo (senza maiuscole né accenti), corrispondenza
 * su più parole e costruzione dei risultati raggruppati per sezione.
 * Funzioni pure, testate in searchUtils.test.ts.
 */
import type { AppData, Appointment, Case, Client, DateKey, Instrument, Task } from '../../domain/types'
import {
  APPOINTMENT_TYPE_LABEL,
  CASE_STATUS_LABEL,
  CASE_TYPE_LABEL,
  CLIENT_SEGMENT_LABEL,
  INSTRUMENT_GROUP_LABEL,
  LOCATION_LABEL,
  TASK_CATEGORY_LABEL,
} from '../../domain/labels'
import { addDays, compareKeys, parseKey, timeToMinutes } from '../../lib/dates'
import { formatDateShort, formatDayMonth, formatWeekdayShort } from '../../lib/format'
import { buildHref } from '../../router/router'
import { clientFullName, compareTasks, indexById } from '../../store/selectors'

export const MAX_PER_GROUP = 5

const DIACRITICS = /[̀-ͯ]/g

/** "Città di Rhò" → "citta di rho": minuscole e senza accenti, per confronti tolleranti. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(DIACRITICS, '').toLowerCase()
}

/** Parole della ricerca, già normalizzate. */
export function tokenize(query: string): string[] {
  return normalizeText(query).split(/\s+/).filter(Boolean)
}

/** true se TUTTE le parole compaiono nel testo (in qualunque ordine). */
export function matchesTokens(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false
  const h = normalizeText(haystack)
  return tokens.every((t) => h.includes(t))
}

/**
 * Intervalli [inizio, fine) del testo ORIGINALE che corrispondono alle parole cercate,
 * ignorando maiuscole e accenti; ordinati e fusi se sovrapposti o adiacenti.
 */
export function highlightRanges(text: string, tokens: string[]): Array<[number, number]> {
  let norm = ''
  const origin: number[] = [] // indice nel testo originale del carattere normalizzato i
  const width: number[] = [] // lunghezza (in unità UTF-16) del carattere originale corrispondente
  let index = 0
  for (const ch of text) {
    const n = normalizeText(ch)
    for (let k = 0; k < n.length; k++) {
      norm += n[k]
      origin.push(index)
      width.push(ch.length)
    }
    index += ch.length
  }
  const ranges: Array<[number, number]> = []
  for (const token of tokens) {
    if (!token) continue
    let from = norm.indexOf(token)
    while (from !== -1) {
      const last = from + token.length - 1
      ranges.push([origin[from], origin[last] + width[last]])
      from = norm.indexOf(token, from + token.length)
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: Array<[number, number]> = []
  for (const r of ranges) {
    const prev = merged[merged.length - 1]
    if (prev && r[0] <= prev[1]) prev[1] = Math.max(prev[1], r[1])
    else merged.push([r[0], r[1]])
  }
  return merged
}

/**
 * Pertinenza di un titolo (più alto = più pertinente): per ogni parola cercata
 * 2 punti se è l'inizio di una parola del titolo, 1 se compare dentro il titolo.
 */
export function titleScore(title: string, tokens: string[]): number {
  const t = normalizeText(title)
  const words = t.split(/[^a-z0-9]+/).filter(Boolean)
  let score = 0
  for (const tok of tokens) {
    if (words.some((w) => w.startsWith(tok))) score += 2
    else if (t.includes(tok)) score += 1
  }
  return score
}

// ---------------------------------------------------------------- risultati

export type SearchGroupId = 'clienti' | 'attivita' | 'appuntamenti' | 'pratiche' | 'fondi'

export interface SearchResult {
  /** Chiave unica tra tutti i gruppi. */
  key: string
  group: SearchGroupId
  title: string
  detail: string
  href: string
}

export interface SearchGroup {
  id: SearchGroupId
  label: string
  items: SearchResult[]
  /** Totale delle corrispondenze (gli elementi mostrati sono al massimo `MAX_PER_GROUP`). */
  total: number
}

export const SEARCH_GROUP_LABEL: Record<SearchGroupId, string> = {
  clienti: 'Clienti',
  attivita: 'Attività',
  appuntamenti: 'Appuntamenti',
  pratiche: 'Pratiche',
  fondi: 'Fondi e mercati',
}

const join = (parts: Array<string | undefined | false>) => parts.filter(Boolean).join(' · ')

/** "2 ott" nell'anno corrente, "02/10/2027" negli altri anni. */
function shortDate(key: DateKey, today: DateKey): string {
  return parseKey(key).year === parseKey(today).year ? formatDayMonth(key) : formatDateShort(key)
}

function taskWhen(task: Task, today: DateKey): string {
  if (task.status === 'completata') return 'Completata'
  const time = task.dueTime ? ` ${task.dueTime}` : ''
  if (task.dueDate < today) return `In ritardo (${shortDate(task.dueDate, today)})`
  if (task.dueDate === today) return `Oggi${time}`
  if (task.dueDate === addDays(today, 1)) return `Domani${time}`
  return `Entro ${shortDate(task.dueDate, today)}${time}`
}

function appointmentWhen(a: Appointment, today: DateKey): string {
  if (a.date === today) return `Oggi, ${a.start}`
  if (a.date === addDays(today, 1)) return `Domani, ${a.start}`
  return `${formatWeekdayShort(a.date)} ${shortDate(a.date, today)}, ${a.start}`
}

function limit<T>(list: T[], max: number): { shown: T[]; total: number } {
  return { shown: list.slice(0, max), total: list.length }
}

/**
 * Cerca in clienti, attività, appuntamenti, pratiche e strumenti finanziari.
 * Restituisce solo i gruppi con almeno un risultato, in ordine fisso.
 */
export function searchAll(
  data: AppData,
  instruments: Instrument[],
  query: string,
  today: DateKey,
  max: number = MAX_PER_GROUP,
): SearchGroup[] {
  const tokens = tokenize(query)
  if (tokens.length === 0) return []
  const clients = indexById(data.clients)
  const nameOf = (id?: string) => {
    const c = id ? clients.get(id) : undefined
    return c ? clientFullName(c) : ''
  }
  const groups: SearchGroup[] = []
  const push = (id: SearchGroupId, items: SearchResult[], total: number) => {
    if (items.length > 0) groups.push({ id, label: SEARCH_GROUP_LABEL[id], items, total })
  }

  // Clienti: prima chi ha nome o cognome che inizia con le parole cercate.
  {
    const found = data.clients
      .filter((c) =>
        matchesTokens(
          [
            c.firstName,
            c.lastName,
            c.city,
            c.email,
            c.phone,
            c.segment ? CLIENT_SEGMENT_LABEL[c.segment] : '',
            ...(c.tags ?? []),
          ].join(' '),
          tokens,
        ),
      )
      .map((c) => ({ c, score: titleScore(clientFullName(c), tokens) }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.c.lastName.localeCompare(b.c.lastName, 'it') ||
          a.c.firstName.localeCompare(b.c.firstName, 'it'),
      )
    const { shown, total } = limit(found, max)
    push(
      'clienti',
      shown.map(({ c }: { c: Client }) => ({
        key: `client-${c.id}`,
        group: 'clienti',
        title: clientFullName(c) || 'Cliente senza nome',
        detail: join([c.city, c.segment && CLIENT_SEGMENT_LABEL[c.segment]]) || 'Cliente',
        href: buildHref('clienti', { id: c.id }),
      })),
      total,
    )
  }

  // Attività: aperte prima, poi per scadenza (stesso ordine della pagina Attività).
  {
    const found = data.tasks
      .filter((t) =>
        matchesTokens([t.title, nameOf(t.clientId), TASK_CATEGORY_LABEL[t.category], t.notes].join(' '), tokens),
      )
      .sort(compareTasks)
    const { shown, total } = limit(found, max)
    push(
      'attivita',
      shown.map((t: Task) => ({
        key: `task-${t.id}`,
        group: 'attivita',
        title: t.title,
        detail: join([taskWhen(t, today), nameOf(t.clientId)]),
        href: buildHref('attivita', { id: t.id }),
      })),
      total,
    )
  }

  // Appuntamenti: i prossimi (dal più vicino) e poi i passati (dal più recente).
  {
    const found = data.appointments
      .filter((a) =>
        matchesTokens(
          [a.title, nameOf(a.clientId), APPOINTMENT_TYPE_LABEL[a.type], LOCATION_LABEL[a.location], a.locationDetail, a.notes].join(
            ' ',
          ),
          tokens,
        ),
      )
      .sort((a, b) => {
        const au = a.date >= today
        const bu = b.date >= today
        if (au !== bu) return au ? -1 : 1
        const byDate = compareKeys(a.date, b.date) || timeToMinutes(a.start) - timeToMinutes(b.start)
        return au ? byDate : -byDate
      })
    const { shown, total } = limit(found, max)
    push(
      'appuntamenti',
      shown.map((a: Appointment) => ({
        key: `appt-${a.id}`,
        group: 'appuntamenti',
        title: a.title,
        detail: join([appointmentWhen(a, today), nameOf(a.clientId), a.status === 'annullato' && 'Annullato']),
        href: buildHref('agenda', { giorno: a.date, vista: 'giorno' }),
      })),
      total,
    )
  }

  // Pratiche: aperte prima, poi le più recenti.
  {
    const found = data.cases
      .filter((k) =>
        matchesTokens(
          [k.title, nameOf(k.clientId), CASE_TYPE_LABEL[k.type], CASE_STATUS_LABEL[k.status], k.notes].join(' '),
          tokens,
        ),
      )
      .sort((a, b) => {
        const ao = a.status !== 'chiusa'
        const bo = b.status !== 'chiusa'
        if (ao !== bo) return ao ? -1 : 1
        return compareKeys(b.openedOn, a.openedOn)
      })
    const { shown, total } = limit(found, max)
    push(
      'pratiche',
      shown.map((k: Case) => ({
        key: `case-${k.id}`,
        group: 'pratiche',
        title: k.title,
        detail: join([CASE_STATUS_LABEL[k.status], nameOf(k.clientId)]),
        href: buildHref('pratiche', { id: k.id }),
      })),
      total,
    )
  }

  // Fondi e mercati: prima chi ha il nome che inizia con le parole cercate.
  {
    const found = instruments
      .map((ins, order) => ({ ins, order }))
      .filter(({ ins }) =>
        matchesTokens([ins.name, ins.category, INSTRUMENT_GROUP_LABEL[ins.group], ins.description].join(' '), tokens),
      )
      .map((x) => ({ ...x, score: titleScore(x.ins.name, tokens) }))
      .sort((a, b) => b.score - a.score || a.order - b.order)
    const { shown, total } = limit(found, max)
    push(
      'fondi',
      shown.map(({ ins }: { ins: Instrument }) => ({
        key: `ins-${ins.id}`,
        group: 'fondi',
        title: ins.name,
        detail: ins.category ?? INSTRUMENT_GROUP_LABEL[ins.group],
        href: buildHref('fondi', { id: ins.id }),
      })),
      total,
    )
  }

  return groups
}
