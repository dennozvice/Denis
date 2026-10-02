/**
 * Modello dati della dashboard.
 *
 * Convenzioni sulle date (per evitare bug di fuso orario / ora legale):
 * - `DateKey` = data di calendario "YYYY-MM-DD" riferita a Europe/Rome, senza orario.
 * - `TimeKey` = orario "HH:mm" (wall-clock Europe/Rome).
 * - Gli istanti (createdAt, completedAt…) sono stringhe ISO 8601 complete.
 * Non usare mai `new Date('YYYY-MM-DD')`: usare gli helper di `lib/dates.ts`.
 */

export type DateKey = string
export type TimeKey = string
export type IsoInstant = string

export type Priority = 'alta' | 'media' | 'bassa'

// ---------------------------------------------------------------- Attività

export type TaskCategory =
  | 'ricontatto'
  | 'compliance'
  | 'adeguatezza'
  | 'documento'
  | 'scadenza_polizza'
  | 'pratica'
  | 'versamento'
  | 'ricorrenza'
  | 'commerciale'
  | 'formazione'
  | 'amministrativa'
  | 'altro'

export type TaskStatus = 'da_fare' | 'in_attesa' | 'completata'

export interface Task {
  id: string
  title: string
  category: TaskCategory
  priority: Priority
  dueDate: DateKey
  dueTime?: TimeKey
  clientId?: string
  /** Se l'attività è stata creata da una scadenza calcolata: l'ID della scadenza (Deadline.id). */
  deadlineId?: string
  notes?: string
  status: TaskStatus
  createdAt: IsoInstant
  completedAt?: IsoInstant
}

// ---------------------------------------------------------------- Appuntamenti

export type AppointmentType =
  | 'primo_incontro'
  | 'revisione_portafoglio'
  | 'firma_contratto'
  | 'consegna_polizza'
  | 'call'
  | 'formazione'
  | 'riunione_agenzia'
  | 'personale'
  | 'altro'

export type LocationMode = 'ufficio' | 'domicilio' | 'video' | 'telefono'

export type AppointmentStatus = 'pianificato' | 'confermato' | 'svolto' | 'annullato'

export type AppointmentOutcome = 'positivo' | 'da_ricontattare' | 'negativo'

export interface Appointment {
  id: string
  title: string
  type: AppointmentType
  date: DateKey
  start: TimeKey
  end: TimeKey
  location: LocationMode
  /** Indirizzo, link della videochiamata o numero di telefono. */
  locationDetail?: string
  clientId?: string
  status: AppointmentStatus
  outcome?: AppointmentOutcome
  notes?: string
  /** 'ics' se importato da un file calendario (Outlook, Google…). */
  source?: 'manuale' | 'ics'
  /** UID dell'evento importato, per evitare duplicati a re-import. */
  externalId?: string
}

// ---------------------------------------------------------------- Clienti

export type ClientSegment = 'privato' | 'famiglia' | 'pensionato' | 'professionista' | 'azienda'

export type PolicyKind = 'risparmio' | 'unit_linked' | 'multiramo' | 'pip' | 'tcm' | 'salute' | 'casa'

export interface Policy {
  id: string
  kind: PolicyKind
  /** Riferimento mascherato, es. "••••4821". Non salvare il numero completo. */
  ref: string
  startDate: DateKey
  maturityDate?: DateKey
  annualPremium?: number
  /** Piano di accumulo: importo mensile e giorno di addebito. */
  pac?: { amount: number; dayOfMonth: number }
}

export interface Client {
  id: string
  firstName: string
  lastName: string
  birthDate?: DateKey
  phone?: string
  email?: string
  city?: string
  segment?: ClientSegment
  /** Scadenza documento d'identità. */
  docExpiry?: DateKey
  /** Prossimo rinnovo adeguata verifica antiriciclaggio. */
  amlReviewDue?: DateKey
  /** Data dell'ultimo questionario di adeguatezza (IDD/MiFID). */
  iddQuestionnaireDate?: DateKey
  /** Data dell'ultimo contatto significativo (incontro o telefonata). */
  lastContact?: DateKey
  policies: Policy[]
  tags?: string[]
  notes?: string
}

// ---------------------------------------------------------------- Pratiche

export type CaseType =
  | 'riscatto'
  | 'sinistro'
  | 'liquidazione_scadenza'
  | 'variazione_beneficiario'
  | 'versamento_aggiuntivo'
  | 'switch'
  | 'reclamo'

export type CaseStatus = 'aperta' | 'attesa_documenti' | 'inviata_sede' | 'chiusa'

export interface Case {
  id: string
  type: CaseType
  clientId?: string
  title: string
  openedOn: DateKey
  /** Scadenza (per i reclami: termine di risposta di 45 giorni). */
  dueDate?: DateKey
  status: CaseStatus
  amount?: number
  notes?: string
}

// ---------------------------------------------------------------- Obiettivi

export type GoalKind = 'produzione' | 'protezione' | 'previdenza' | 'nuovi_clienti' | 'appuntamenti'

export interface Goal {
  id: string
  kind: GoalKind
  label: string
  period: 'mese' | 'anno'
  unit: 'EUR' | 'numero'
  target: number
  current: number
}

export interface Training {
  year: number
  hoursRequired: number
  courses: { id: string; title: string; hours: number; done: boolean; dueDate?: DateKey }[]
}

// ---------------------------------------------------------------- Impostazioni

export type ThemePreference = 'sistema' | 'chiaro' | 'scuro'

export interface Settings {
  advisorName: string
  /** Nome mostrato in alto a sinistra: neutro di default, personalizzabile. */
  brandName: string
  /** Facoltativo: es. "Agenzia di Milano Centro". */
  agencyName: string
  theme: ThemePreference
  /** Validità del questionario di adeguatezza, in mesi. */
  iddValidityMonths: number
  /** Giorni senza contatto oltre i quali un cliente va ricontattato. */
  recontactAfterDays: number
  privacyNoticeDismissed: boolean
}

// ---------------------------------------------------------------- Stato persistito

export interface AppData {
  schemaVersion: 1
  /** true finché l'utente lavora sui dati dimostrativi generati automaticamente. */
  isDemo: boolean
  /** Giorno in cui sono stati generati i dati dimostrativi. */
  demoGeneratedOn?: DateKey
  settings: Settings
  tasks: Task[]
  appointments: Appointment[]
  clients: Client[]
  cases: Case[]
  goals: Goal[]
  training: Training
  quickNote: string
}

// ---------------------------------------------------------------- Mercati e fondi

export type InstrumentGroup = 'fondo' | 'gestione_separata' | 'indice' | 'tasso' | 'spread' | 'cambio'

/** `pct` = valore espresso in punti percentuali (3,45 = 3,45%); `bp` = punti base. */
export type InstrumentUnit = 'EUR' | 'pt' | 'pct' | 'bp' | 'fx'

export interface PricePoint {
  date: DateKey
  value: number
}

export interface Instrument {
  id: string
  name: string
  group: InstrumentGroup
  /** Categoria descrittiva, es. "Obbligazionario", "Bilanciato", "Azionario". */
  category?: string
  /** Indicatore sintetico di rischio (KID PRIIPs) da 1 a 7. */
  sri?: 1 | 2 | 3 | 4 | 5 | 6 | 7
  unit: InstrumentUnit
  decimals: number
  /** Serie storica ordinata per data crescente. */
  series: PricePoint[]
  source: 'demo' | 'import'
  /** Indice della palette serie (1..8), stabile per strumento. */
  colorIndex: number
  /** Per i fondi: ID dello strumento usato come benchmark nel grafico. */
  benchmarkId?: string
  description?: string
}

export type PerformancePeriod = '1M' | '3M' | '6M' | 'YTD' | '1A' | '3A'

// ---------------------------------------------------------------- Scadenze calcolate

export type DeadlineKind =
  | 'documento'
  | 'antiriciclaggio'
  | 'adeguatezza'
  | 'scadenza_polizza'
  | 'anniversario_polizza'
  | 'compleanno'
  | 'pratica'

export interface Deadline {
  /** ID stabile, utile come key React e per collegare attività create dalla scadenza. */
  id: string
  kind: DeadlineKind
  date: DateKey
  /** Giorni da oggi: negativo = già scaduta. */
  daysLeft: number
  clientId?: string
  caseId?: string
  title: string
  detail?: string
  severity: 'scaduta' | 'urgente' | 'prossima' | 'info'
}
