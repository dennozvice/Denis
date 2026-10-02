/** Funzioni pure per pratiche (riscatti, sinistri, liquidazioni, reclami…): ordinamento, filtri, form. */
import { CASE_DEFAULT_TERM_DAYS, CASE_STATUS_LABEL, CASE_TYPE_LABEL, type Tone } from '../../domain/labels'
import type { Case, CaseStatus, CaseType, Client, DateKey } from '../../domain/types'
import { addDays, diffDays, isDateKey } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { caseDueDate } from '../../store/selectors'

export const isCaseOpen = (c: Pick<Case, 'status'>) => c.status !== 'chiusa'

/** Colore dell'icona per tipo di pratica. */
export const CASE_TYPE_TONE: Record<CaseType, Tone> = {
  riscatto: 'violet',
  sinistro: 'accent',
  liquidazione_scadenza: 'positive',
  variazione_beneficiario: 'primary',
  versamento_aggiuntivo: 'positive',
  switch: 'primary',
  anticipazione: 'warning',
  trasferimento: 'accent',
  reclamo: 'negative',
}

/** Giorni trascorsi dall'apertura (mai negativi). */
export function caseAgeDays(c: Pick<Case, 'openedOn'>, today: DateKey): number {
  return Math.max(0, diffDays(c.openedOn, today))
}

/** "oggi", "ieri", "da 12 gg". */
export function caseAgeShort(days: number): string {
  if (days <= 0) return 'oggi'
  if (days === 1) return 'ieri'
  return `da ${formatNumber(days)} gg`
}

/** "aperta oggi", "aperta ieri", "aperta da 12 gg". */
export function caseAgeLabel(days: number): string {
  return `aperta ${caseAgeShort(days)}`
}

/** Pratiche aperte: prima quelle con scadenza (la più vicina in testa), poi le altre dalla più vecchia. */
export function compareOpenCases(a: Case, b: Case): number {
  const da = caseDueDate(a)
  const db = caseDueDate(b)
  if (da && db && da !== db) return da < db ? -1 : 1
  if (da && !db) return -1
  if (!da && db) return 1
  if (a.openedOn !== b.openedOn) return a.openedOn < b.openedOn ? -1 : 1
  return a.title.localeCompare(b.title, 'it')
}

export function sortOpenCases(cases: Case[]): Case[] {
  return cases.filter(isCaseOpen).sort(compareOpenCases)
}

/** Per l'elenco completo: aperte (ordinate per scadenza) e poi chiuse, dalla più recente. */
export function sortCasesForList(cases: Case[]): Case[] {
  const open = cases.filter(isCaseOpen).sort(compareOpenCases)
  const closed = cases
    .filter((c) => !isCaseOpen(c))
    .sort((a, b) => (a.openedOn !== b.openedOn ? (a.openedOn < b.openedOn ? 1 : -1) : a.title.localeCompare(b.title, 'it')))
  return [...open, ...closed]
}

/** Scadenza vicina: rosso se scaduta (o reclamo entro 7 gg), arancio entro 7 gg, altrimenti neutro. */
export function caseDueTone(type: CaseType, daysLeft: number): Tone {
  if (daysLeft < 0) return 'negative'
  if (daysLeft <= 7) return type === 'reclamo' ? 'negative' : 'warning'
  return type === 'reclamo' ? 'warning' : 'neutral'
}

// ---------------------------------------------------------------- filtri e ricerca

export type CaseStatusFilter = 'aperte' | 'chiuse' | 'tutte'

export function matchesStatusFilter(c: Pick<Case, 'status'>, filter: CaseStatusFilter): boolean {
  if (filter === 'aperte') return isCaseOpen(c)
  if (filter === 'chiuse') return !isCaseOpen(c)
  return true
}

/** Intestazione dell'elenco: "1 pratica aperta", "12 pratiche chiuse", "17 pratiche". */
export function casesCountLabel(count: number, filter: CaseStatusFilter): string {
  const one = count === 1
  const noun = one ? 'pratica' : 'pratiche'
  const adjective = filter === 'aperte' ? (one ? ' aperta' : ' aperte') : filter === 'chiuse' ? (one ? ' chiusa' : ' chiuse') : ''
  return `${formatNumber(count)} ${noun}${adjective}`
}

/** Pratica su cui spostare il focus quando `id` esce dall'elenco: la successiva, altrimenti la precedente. */
export function neighbourCaseId(list: Pick<Case, 'id'>[], id: string): string | undefined {
  const index = list.findIndex((c) => c.id === id)
  if (index < 0) return undefined
  return (list[index + 1] ?? list[index - 1])?.id
}

/**
 * Messaggio dopo un cambio di stato dall'elenco. Se con il filtro attivo la pratica sparisce
 * (es. "Chiusa" mentre si guardano le aperte) lo dice esplicitamente.
 */
export function statusChangeMessage(title: string, next: CaseStatus, filter: CaseStatusFilter): string {
  const base = `«${title}»: stato «${CASE_STATUS_LABEL[next]}»`
  if (matchesStatusFilter({ status: next }, filter)) return base
  return `${base}. Non compare più tra le pratiche ${filter}`
}

/** Minuscolo e senza accenti. */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Ricerca su titolo, tipo, note e nome del cliente (tutte le parole devono comparire). */
export function matchesCaseSearch(c: Case, query: string, clientName: string): boolean {
  const q = normalizeText(query)
  if (!q) return true
  const haystack = normalizeText(`${c.title} ${CASE_TYPE_LABEL[c.type]} ${c.notes ?? ''} ${clientName}`)
  return q.split(/\s+/).every((word) => haystack.includes(word))
}

// ---------------------------------------------------------------- form

/** Prefisso del titolo proposto, quando l'etichetta del tipo non si presta ("Anticipazione (PIP)"). */
const TITLE_PREFIX: Partial<Record<CaseType, string>> = {
  anticipazione: 'Anticipazione PIP',
}

/** Titolo proposto: "Riscatto – Franco Neri". */
export function suggestCaseTitle(type: CaseType, clientName: string): string {
  const prefix = TITLE_PREFIX[type] ?? CASE_TYPE_LABEL[type]
  return clientName ? `${prefix} – ${clientName}` : prefix
}

/**
 * Scadenza proposta nel form (CASE_DEFAULT_TERM_DAYS):
 * - reclamo: sempre apertura + 45 giorni (termine di risposta, vale anche senza data: vedi caseDueDate);
 * - riscatto, liquidazione a scadenza, sinistro: apertura + 30 giorni, solo per le nuove pratiche
 *   (è un termine indicativo, modificabile o cancellabile).
 * Stringa vuota per gli altri tipi o se la data di apertura non è valida.
 */
export function suggestCaseDueDate(type: CaseType, openedOn: string, isNew: boolean): DateKey | '' {
  const days = CASE_DEFAULT_TERM_DAYS[type]
  if (days === undefined || !isDateKey(openedOn)) return ''
  if (type !== 'reclamo' && !isNew) return ''
  return addDays(openedOn, days)
}

/** Nota sotto il campo "Scadenza" per i tipi con un termine di riferimento. */
export function caseDueHint(type: CaseType): string | undefined {
  const days = CASE_DEFAULT_TERM_DAYS[type]
  if (days === undefined) return undefined
  return type === 'reclamo'
    ? `Termine di risposta: ${formatNumber(days)} giorni dalla ricezione del reclamo (risposta a cura della compagnia o dell'intermediario)`
    : `Termine indicativo di pagamento: ${formatNumber(days)} giorni dalla ricezione della documentazione completa`
}

/**
 * Importo scritto all'italiana: "15000", "15.000", "1.250,50", "1250.5", "€ 640".
 * Restituisce undefined se vuoto, null se non valido.
 */
export function parseAmount(raw: string): number | null | undefined {
  const s = raw.replace(/[€\s]/g, '')
  if (!s) return undefined
  let normalized: string
  if (s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, '')
  else normalized = s
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

/** Valore iniziale del campo importo: "15.000" o "1.250,50". */
export function formatAmountInput(value: number | undefined): string {
  if (value === undefined) return ''
  return formatNumber(value, Number.isInteger(value) ? 0 : 2)
}

/** Clienti ordinati per cognome e nome. */
export function sortClientsByLastName(clients: Client[]): Client[] {
  return [...clients].sort(
    (a, b) => a.lastName.localeCompare(b.lastName, 'it') || a.firstName.localeCompare(b.firstName, 'it'),
  )
}
