/** Etichette italiane e colori (tono) per tutte le enumerazioni del dominio. */
import type {
  AppointmentOutcome,
  AppointmentStatus,
  AppointmentType,
  CaseStatus,
  CaseType,
  ClientSegment,
  DeadlineKind,
  GoalKind,
  InstrumentGroup,
  LocationMode,
  PerformancePeriod,
  PolicyKind,
  Priority,
  RiskProfile,
  TaskCategory,
  TaskStatus,
} from './types'

/** Toni disponibili per `.pill[data-tone]` e per i colori di categoria. */
export type Tone = 'primary' | 'positive' | 'negative' | 'warning' | 'accent' | 'violet' | 'neutral'

/** Variabile CSS del colore "pieno" di un tono (per pallini, barre laterali…). */
export const TONE_COLOR: Record<Tone, string> = {
  primary: 'var(--primary)',
  positive: 'var(--positive)',
  negative: 'var(--negative)',
  warning: 'var(--warning)',
  accent: 'var(--accent)',
  violet: 'var(--violet)',
  neutral: 'var(--neutral)',
}

export const TONE_BG: Record<Tone, string> = {
  primary: 'var(--primary-bg)',
  positive: 'var(--positive-bg)',
  negative: 'var(--negative-bg)',
  warning: 'var(--warning-bg)',
  accent: 'var(--accent-bg)',
  violet: 'var(--violet-bg)',
  neutral: 'var(--neutral-bg)',
}

export const PRIORITY_LABEL: Record<Priority, string> = { alta: 'Alta', media: 'Media', bassa: 'Bassa' }
export const PRIORITY_TONE: Record<Priority, Tone> = { alta: 'negative', media: 'warning', bassa: 'neutral' }
export const PRIORITY_RANK: Record<Priority, number> = { alta: 0, media: 1, bassa: 2 }

export const TASK_CATEGORY_LABEL: Record<TaskCategory, string> = {
  ricontatto: 'Ricontatto',
  compliance: 'Antiriciclaggio',
  adeguatezza: 'Adeguatezza',
  documento: 'Documenti',
  scadenza_polizza: 'Scadenza polizza',
  pratica: 'Pratica',
  versamento: 'Versamenti',
  ricorrenza: 'Ricorrenza',
  commerciale: 'Commerciale',
  formazione: 'Formazione',
  amministrativa: 'Amministrativa',
  altro: 'Altro',
}

export const TASK_CATEGORY_TONE: Record<TaskCategory, Tone> = {
  ricontatto: 'primary',
  compliance: 'negative',
  adeguatezza: 'warning',
  documento: 'warning',
  scadenza_polizza: 'violet',
  pratica: 'accent',
  versamento: 'accent',
  ricorrenza: 'violet',
  commerciale: 'positive',
  formazione: 'neutral',
  amministrativa: 'neutral',
  altro: 'neutral',
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  da_fare: 'Da fare',
  in_attesa: 'In attesa',
  completata: 'Completata',
}

export const APPOINTMENT_TYPE_LABEL: Record<AppointmentType, string> = {
  primo_incontro: 'Primo incontro',
  revisione_portafoglio: 'Revisione portafoglio',
  firma_contratto: 'Firma contratto',
  consegna_polizza: 'Consegna polizza',
  call: 'Telefonata',
  formazione: 'Formazione',
  riunione_agenzia: 'Riunione di agenzia',
  personale: 'Personale',
  altro: 'Altro',
}

export const APPOINTMENT_TYPE_TONE: Record<AppointmentType, Tone> = {
  primo_incontro: 'primary',
  revisione_portafoglio: 'accent',
  firma_contratto: 'positive',
  consegna_polizza: 'violet',
  call: 'neutral',
  formazione: 'warning',
  riunione_agenzia: 'warning',
  personale: 'neutral',
  altro: 'neutral',
}

/** Colore (variabile CSS) di ogni tipo di appuntamento: tutti distinti, per pallini e barre in agenda. */
export const APPOINTMENT_TYPE_COLOR: Record<AppointmentType, string> = {
  primo_incontro: 'var(--primary)',
  revisione_portafoglio: 'var(--accent)',
  firma_contratto: 'var(--series-8)',
  consegna_polizza: 'var(--violet)',
  call: 'var(--series-7)',
  formazione: 'var(--warning)',
  riunione_agenzia: 'var(--series-6)',
  personale: 'var(--neutral)',
  altro: 'var(--text-3)',
}

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  pianificato: 'Pianificato',
  confermato: 'Confermato',
  svolto: 'Svolto',
  annullato: 'Annullato',
}

export const APPOINTMENT_OUTCOME_LABEL: Record<AppointmentOutcome, string> = {
  positivo: 'Positivo',
  da_ricontattare: 'Da ricontattare',
  negativo: 'Negativo',
}

export const LOCATION_LABEL: Record<LocationMode, string> = {
  ufficio: 'In ufficio',
  domicilio: 'Dal cliente',
  video: 'Videochiamata',
  telefono: 'Telefono',
}

export const CLIENT_SEGMENT_LABEL: Record<ClientSegment, string> = {
  privato: 'Privato',
  famiglia: 'Famiglia',
  pensionato: 'Pensionato',
  professionista: 'Professionista',
  azienda: 'Azienda',
}

export const POLICY_KIND_LABEL: Record<PolicyKind, string> = {
  risparmio: 'Vita risparmio',
  unit_linked: 'Unit linked',
  multiramo: 'Multiramo',
  pip: 'Previdenza (PIP)',
  tcm: 'Protezione (TCM)',
  salute: 'Salute',
  casa: 'Casa',
  altro: 'Altro',
}

export const CASE_TYPE_LABEL: Record<CaseType, string> = {
  riscatto: 'Riscatto',
  sinistro: 'Sinistro',
  liquidazione_scadenza: 'Liquidazione a scadenza',
  variazione_beneficiario: 'Variazione beneficiario',
  versamento_aggiuntivo: 'Versamento aggiuntivo',
  switch: 'Switch fondi',
  anticipazione: 'Anticipazione (PIP)',
  trasferimento: 'Trasferimento posizione',
  reclamo: 'Reclamo',
}

export const RISK_PROFILE_LABEL: Record<RiskProfile, string> = {
  prudente: 'Prudente',
  moderato: 'Moderato',
  equilibrato: 'Equilibrato',
  dinamico: 'Dinamico',
  aggressivo: 'Aggressivo',
}

export const AML_RISK_LABEL: Record<'basso' | 'medio' | 'alto', string> = {
  basso: 'Basso',
  medio: 'Medio',
  alto: 'Alto',
}

export const PREMIUM_TYPE_LABEL: Record<'annuo' | 'unico' | 'ricorrente', string> = {
  annuo: 'Premio annuo',
  unico: 'Premio unico',
  ricorrente: 'Versamenti ricorrenti',
}

/** Termini di riferimento in giorni per alcune pratiche (dalla ricezione della documentazione completa). */
export const CASE_DEFAULT_TERM_DAYS: Partial<Record<CaseType, number>> = {
  reclamo: 45,
  riscatto: 30,
  liquidazione_scadenza: 30,
  sinistro: 30,
}

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  aperta: 'Aperta',
  attesa_documenti: 'In attesa documenti',
  inviata_sede: 'Inviata in sede',
  chiusa: 'Chiusa',
}

export const CASE_STATUS_TONE: Record<CaseStatus, Tone> = {
  aperta: 'primary',
  attesa_documenti: 'warning',
  inviata_sede: 'accent',
  chiusa: 'positive',
}

export const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  produzione: 'Produzione',
  protezione: 'Protezione',
  previdenza: 'Previdenza',
  nuovi_clienti: 'Nuovi clienti',
  appuntamenti: 'Appuntamenti',
}

export const DEADLINE_KIND_LABEL: Record<DeadlineKind, string> = {
  documento: "Documento d'identità",
  antiriciclaggio: 'Adeguata verifica',
  adeguatezza: 'Questionario adeguatezza',
  scadenza_polizza: 'Scadenza polizza',
  anniversario_polizza: 'Anniversario polizza',
  compleanno: 'Compleanno',
  pratica: 'Pratica',
}

export const DEADLINE_KIND_TONE: Record<DeadlineKind, Tone> = {
  documento: 'warning',
  antiriciclaggio: 'negative',
  adeguatezza: 'warning',
  scadenza_polizza: 'violet',
  anniversario_polizza: 'accent',
  compleanno: 'primary',
  pratica: 'accent',
}

/** Categoria di attività da proporre quando si crea un'attività da una scadenza. */
export const DEADLINE_TO_TASK_CATEGORY: Record<DeadlineKind, TaskCategory> = {
  documento: 'documento',
  antiriciclaggio: 'compliance',
  adeguatezza: 'adeguatezza',
  scadenza_polizza: 'scadenza_polizza',
  anniversario_polizza: 'ricorrenza',
  compleanno: 'ricorrenza',
  pratica: 'pratica',
}

export const INSTRUMENT_GROUP_LABEL: Record<InstrumentGroup, string> = {
  fondo: 'Fondo',
  gestione_separata: 'Gestione separata',
  indice: 'Indice',
  tasso: 'Tasso',
  spread: 'Spread',
  cambio: 'Cambio',
}

export const PERIOD_LABEL: Record<PerformancePeriod, string> = {
  '1M': '1 mese',
  '3M': '3 mesi',
  '6M': '6 mesi',
  YTD: 'Da inizio anno',
  '1A': '1 anno',
  '3A': '3 anni',
}

export const PERIODS: PerformancePeriod[] = ['1M', '3M', '6M', 'YTD', '1A', '3A']
