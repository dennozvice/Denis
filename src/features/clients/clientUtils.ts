/** Funzioni pure della sezione Clienti: ricerca, ordinamento, stato degli adempimenti, polizze. */
import type { Tone } from '../../domain/labels'
import type { Client, DateKey, Deadline, Policy } from '../../domain/types'
import { addMonths, diffDays } from '../../lib/dates'

// ---------------------------------------------------------------- testo e ricerca

/** Minuscolo e senza accenti: "Città" → "citta". */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const digitsOnly = (value: string) => value.replace(/\D/g, '')

/** "Rossi Mario": l'ordine usato in elenchi e menu. */
export function clientSortName(client: Pick<Client, 'firstName' | 'lastName'>): string {
  return `${client.lastName} ${client.firstName}`.trim()
}

/**
 * Ricerca su nome, cognome, città, etichette, telefono ed email, senza distinzione di maiuscole e accenti.
 * Tutte le parole devono comparire; le parole numeriche si confrontano anche con le sole cifre del telefono.
 */
export function matchesClientSearch(client: Client, query: string): boolean {
  const words = normalizeText(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalizeText(
    [client.firstName, client.lastName, client.city ?? '', (client.tags ?? []).join(' '), client.phone ?? '', client.email ?? ''].join(' '),
  )
  const phone = digitsOnly(client.phone ?? '')
  return words.every((word) => {
    if (haystack.includes(word)) return true
    const digits = digitsOnly(word)
    return digits.length >= 3 && digits.length === word.replace(/[\s+().-]/g, '').length && phone.includes(digits)
  })
}

// ---------------------------------------------------------------- ordinamento

export type ClientSort = 'cognome' | 'contatto' | 'scadenza'

export const CLIENT_SORT_OPTIONS: { value: ClientSort; label: string }[] = [
  { value: 'cognome', label: 'Cognome A–Z' },
  { value: 'contatto', label: 'Ultimo contatto (meno recente)' },
  { value: 'scadenza', label: 'Prossima scadenza' },
]

export function isClientSort(value: unknown): value is ClientSort {
  return value === 'cognome' || value === 'contatto' || value === 'scadenza'
}

export function compareByName(a: Client, b: Client): number {
  return a.lastName.localeCompare(b.lastName, 'it') || a.firstName.localeCompare(b.firstName, 'it')
}

/**
 * Ordina una copia dell'elenco.
 * - contatto: prima i mai contattati, poi dal contatto più vecchio;
 * - scadenza: dalla scadenza di adempimento più vicina (le scadute per prime), senza scadenze in fondo.
 */
export function sortClients(clients: Client[], sort: ClientSort, nearest: Map<string, Deadline>): Client[] {
  const list = [...clients]
  if (sort === 'cognome') return list.sort(compareByName)
  if (sort === 'contatto') {
    return list.sort((a, b) => {
      if (a.lastContact === b.lastContact) return compareByName(a, b)
      if (!a.lastContact) return -1
      if (!b.lastContact) return 1
      return a.lastContact < b.lastContact ? -1 : 1
    })
  }
  return list.sort((a, b) => {
    const da = nearest.get(a.id)?.date
    const db = nearest.get(b.id)?.date
    if (da === db) return compareByName(a, b)
    if (!da) return 1
    if (!db) return -1
    return da < db ? -1 : 1
  })
}

// ---------------------------------------------------------------- scadenze per cliente

/** Prima scadenza (in ordine di data) per ciascun cliente. Le scadenze devono essere già ordinate per data. */
export function nearestDeadlineByClient(deadlines: Deadline[]): Map<string, Deadline> {
  const map = new Map<string, Deadline>()
  for (const d of deadlines) {
    if (d.clientId && !map.has(d.clientId)) map.set(d.clientId, d)
  }
  return map
}

const DEADLINE_SHORT: Record<Deadline['kind'], { label: string; feminine: boolean }> = {
  documento: { label: 'Doc.', feminine: false },
  antiriciclaggio: { label: 'AV', feminine: true },
  adeguatezza: { label: 'Quest. IDD', feminine: false },
  scadenza_polizza: { label: 'Polizza', feminine: true },
  pratica: { label: 'Pratica', feminine: true },
  anniversario_polizza: { label: 'Anniversario', feminine: false },
  compleanno: { label: 'Compleanno', feminine: false },
}

/** Etichetta compatta per l'elenco: "Doc. scaduto", "AV tra 3 gg", "Polizza scade oggi". */
export function deadlineShortLabel(d: Pick<Deadline, 'kind' | 'daysLeft'>): string {
  const { label, feminine } = DEADLINE_SHORT[d.kind]
  if (d.daysLeft < 0) return `${label} ${feminine ? 'scaduta' : 'scaduto'}`
  if (d.daysLeft === 0) return `${label} scade oggi`
  if (d.daysLeft === 1) return `${label} domani`
  return `${label} tra ${d.daysLeft} gg`
}

/** Tono della pillola: scaduta = rosso, entro 30 giorni = arancio, oltre = neutro. */
export function deadlineTone(d: Pick<Deadline, 'daysLeft'>): Tone {
  if (d.daysLeft < 0) return 'negative'
  if (d.daysLeft <= 30) return 'warning'
  return 'neutral'
}

// ---------------------------------------------------------------- adempimenti

export type ComplianceStatus = 'scaduto' | 'in_scadenza' | 'valido' | 'non_registrato'

/** Giorni entro i quali un adempimento è considerato "in scadenza". */
export const EXPIRING_WITHIN_DAYS = 30

export interface ComplianceState {
  status: ComplianceStatus
  /** Data di scadenza (per il questionario: data di compilazione + validità). */
  due?: DateKey
  /** Giorni da oggi alla scadenza (negativo = scaduto). */
  daysLeft?: number
}

export function complianceState(due: DateKey | undefined, today: DateKey): ComplianceState {
  if (!due) return { status: 'non_registrato' }
  const daysLeft = diffDays(today, due)
  const status: ComplianceStatus = daysLeft < 0 ? 'scaduto' : daysLeft <= EXPIRING_WITHIN_DAYS ? 'in_scadenza' : 'valido'
  return { status, due, daysLeft }
}

/** Scadenza del questionario di adeguatezza in base alla validità impostata. */
export function iddDueDate(client: Pick<Client, 'iddQuestionnaireDate'>, validityMonths: number): DateKey | undefined {
  return client.iddQuestionnaireDate ? addMonths(client.iddQuestionnaireDate, validityMonths) : undefined
}

export const COMPLIANCE_TONE: Record<ComplianceStatus, Tone> = {
  scaduto: 'negative',
  in_scadenza: 'warning',
  valido: 'positive',
  non_registrato: 'neutral',
}

/** Etichetta dello stato concordata con il genere del sostantivo ("Adeguata verifica scaduta"). */
export function complianceLabel(status: ComplianceStatus, feminine = false): string {
  const o = feminine ? 'a' : 'o'
  switch (status) {
    case 'scaduto':
      return `Scadut${o}`
    case 'in_scadenza':
      return 'In scadenza'
    case 'valido':
      return `Valid${o}`
    case 'non_registrato':
      return `Non registrat${o}`
  }
}

// ---------------------------------------------------------------- ultimo contatto

export interface LastContactInfo {
  /** Giorni dall'ultimo contatto; undefined se mai contattato. */
  days?: number
  /** true se mai contattato o se sono passati più giorni della soglia impostata. */
  stale: boolean
  /** "oggi", "ieri", "12 gg fa", "Mai contattato". */
  label: string
}

export function lastContactInfo(client: Pick<Client, 'lastContact'>, today: DateKey, afterDays: number): LastContactInfo {
  if (!client.lastContact) return { stale: true, label: 'Mai contattato' }
  const days = Math.max(0, diffDays(client.lastContact, today))
  const label = days === 0 ? 'oggi' : days === 1 ? 'ieri' : `${days} gg fa`
  return { days, stale: days > afterDays, label }
}

// ---------------------------------------------------------------- polizze

const MASK = '••••'

/** Riferimento mascherato da salvare: solo le ultime 4 cifre. */
export function maskPolicyRef(lastDigits: string): string {
  return `${MASK}${lastDigits}`
}

/** Ultime 4 cifre di un riferimento (mascherato o meno), per precompilare il form. */
export function policyRefDigits(ref: string): string {
  return digitsOnly(ref).slice(-4)
}

export function isFourDigits(value: string): boolean {
  return /^\d{4}$/.test(value)
}

export interface PolicyTotals {
  annualPremium: number
  monthlyPac: number
  withPac: number
}

export function policyTotals(policies: Policy[]): PolicyTotals {
  let annualPremium = 0
  let monthlyPac = 0
  let withPac = 0
  for (const p of policies) {
    annualPremium += p.annualPremium ?? 0
    if (p.pac) {
      monthlyPac += p.pac.amount
      withPac += 1
    }
  }
  return { annualPremium, monthlyPac, withPac }
}

// ---------------------------------------------------------------- etichette e validazioni del form

/** "prospect,  Cliente storico, prospect" → ["prospect", "Cliente storico"] (senza doppioni). */
export function parseTags(input: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input.split(',')) {
    const tag = raw.trim().replace(/\s+/g, ' ').slice(0, 40)
    const key = normalizeText(tag)
    if (!tag || seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
}

/** Telefono plausibile: cifre, spazi, +, trattini, punti e parentesi, almeno 6 cifre. */
export function isPlausiblePhone(value: string): boolean {
  return /^[+\d\s().-]+$/.test(value) && digitsOnly(value).length >= 6
}

const FISCAL_CODE = /\b[a-z]{6}\d{2}[a-z]\d{2}[a-z]\d{3}[a-z]\b/i
/** IBAN anche scritto a gruppi di 4 ("IT60 X054 2811 …"): almeno 10 cifre nel blocco. */
function hasIban(text: string): boolean {
  for (const match of text.matchAll(/\b[a-z]{2}\d{2}(?:\s?[a-z0-9]){11,30}\b/gi)) {
    if (digitsOnly(match[0]).length >= 10) return true
  }
  return false
}
/** Sequenze di almeno 8 cifre consecutive che non hanno l'aspetto di un numero di telefono italiano. */
function hasLongNumber(text: string): boolean {
  for (const match of text.matchAll(/(?:\+?39)?\d{8,}/g)) {
    const digits = match[0].replace(/^\+?39(?=\d{9,})/, '')
    const looksLikePhone = /^(3\d{8,9}|0[1-9]\d{4,9})$/.test(digits)
    if (!looksLikePhone) return true
  }
  return false
}
const HEALTH_WORDS = [
  'diagnosi',
  'malattia',
  'patologia',
  'terapia',
  'tumore',
  'cancro',
  'diabete',
  'ricovero',
  'invalidita',
  'disabilita',
  'cartella clinica',
  'gravidanza',
  'farmaci',
]

/**
 * Suggerimento non bloccante se un testo libero sembra contenere dati da non conservare qui
 * (codice fiscale, numeri completi di polizza/IBAN, dati sanitari). undefined se non rileva nulla.
 */
export function sensitiveDataHint(text: string): string | undefined {
  if (!text.trim()) return undefined
  if (FISCAL_CODE.test(text)) return 'Sembra contenere un codice fiscale completo: valuta di rimuoverlo.'
  const normalized = normalizeText(text)
  if (HEALTH_WORDS.some((w) => normalized.includes(w))) {
    return 'Sembra contenere informazioni sanitarie: non vanno conservate in questa app.'
  }
  if (hasIban(text) || hasLongNumber(text)) {
    return 'Contiene un numero lungo (polizza, IBAN, documento?): conserva solo le ultime cifre.'
  }
  return undefined
}
