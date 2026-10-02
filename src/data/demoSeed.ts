/**
 * Dati DIMOSTRATIVI per il primo avvio: clienti fittizi, attività, appuntamenti, pratiche
 * e obiettivi, tutti calcolati relativamente alla data di oggi così la demo è sempre "fresca".
 * Si possono rigenerare o cancellare da Impostazioni.
 */
import type {
  AppData,
  Appointment,
  Case,
  Client,
  DateKey,
  Goal,
  Settings,
  Task,
  Training,
} from '../domain/types'
import { addDays, addMonths, addYears, isWeekend, parseKey } from '../lib/dates'

export const DEFAULT_SETTINGS: Settings = {
  advisorName: '',
  brandName: 'Advisor Desk',
  agencyName: '',
  theme: 'sistema',
  iddValidityMonths: 24,
  recontactAfterDays: 180,
  privacyNoticeDismissed: false,
}

export function createEmptyData(today: DateKey, settings: Settings = DEFAULT_SETTINGS): AppData {
  return {
    schemaVersion: 1,
    isDemo: false,
    settings,
    tasks: [],
    appointments: [],
    clients: [],
    cases: [],
    goals: defaultGoals(today),
    training: { year: parseKey(today).year, hoursRequired: 30, courses: [] },
    quickNote: '',
  }
}

/** Periodo a cui si riferisce il valore di un obiettivo: "YYYY-MM" (mese) o "YYYY" (anno). */
export function goalPeriodKey(period: Goal['period'], today: DateKey): string {
  return period === 'mese' ? today.slice(0, 7) : today.slice(0, 4)
}

function defaultGoals(today: DateKey): Goal[] {
  const goals: Goal[] = [
    { id: 'g-prod-mese', kind: 'produzione', label: 'Produzione del mese', period: 'mese', unit: 'EUR', target: 25000, current: 0 },
    { id: 'g-prod-anno', kind: 'produzione', label: "Produzione dell'anno", period: 'anno', unit: 'EUR', target: 240000, current: 0 },
    { id: 'g-protezione', kind: 'protezione', label: 'Polizze protezione (TCM) nel mese', period: 'mese', unit: 'numero', target: 3, current: 0 },
    { id: 'g-previdenza', kind: 'previdenza', label: "Nuovi PIP nell'anno", period: 'anno', unit: 'numero', target: 12, current: 0 },
    { id: 'g-clienti', kind: 'nuovi_clienti', label: 'Nuovi clienti nel mese', period: 'mese', unit: 'numero', target: 4, current: 0 },
  ]
  return goals.map((g) => ({ ...g, periodKey: goalPeriodKey(g.period, today) }))
}

/** Primo giorno lavorativo a partire da today+offset (sab/dom → lunedì). */
function workday(today: DateKey, offset: number): DateKey {
  let d = addDays(today, offset)
  while (isWeekend(d)) d = addDays(d, offset < 0 ? -1 : 1)
  return d
}

/** Data di nascita tale che il compleanno cada tra `inDays` giorni e la persona compia `age` anni. */
function birthFor(today: DateKey, age: number, inDays: number): DateKey {
  return addYears(addDays(today, inDays), -age)
}

export function createDemoData(today: DateKey, settings: Settings = DEFAULT_SETTINGS): AppData {
  const d = (n: number) => addDays(today, n)
  const w = (n: number) => workday(today, n)
  const createdAt = `${addDays(today, -3)}T08:00:00.000Z`
  const doneAt = `${today}T07:15:00.000Z`

  const clients: Client[] = [
    {
      id: 'c01',
      firstName: 'Mario',
      lastName: 'Rossi',
      birthDate: birthFor(today, 58, 163),
      phone: '+39 000 000 0101',
      email: 'mario.rossi@example.com',
      city: 'Milano',
      segment: 'famiglia',
      docExpiry: d(410),
      amlReviewDue: d(190),
      iddQuestionnaireDate: addMonths(today, -20),
      lastContact: d(-210),
      policies: [
        { id: 'p0101', kind: 'unit_linked', ref: '••••4821', startDate: addYears(d(40), -6), annualPremium: 3000 },
        { id: 'p0102', kind: 'pip', ref: '••••1177', startDate: addYears(d(95), -9), annualPremium: 2400, pac: { amount: 200, dayOfMonth: 5 } },
      ],
      riskProfile: 'equilibrato',
      amlRisk: 'basso',
      marketingConsent: true,
      tags: ['cliente storico'],
      notes: 'Due figli all\'università. Interessato a ribilanciare verso componente più prudente.',
    },
    {
      id: 'c02',
      firstName: 'Anna',
      lastName: 'Esposito',
      birthDate: birthFor(today, 49, 74),
      phone: '+39 000 000 0102',
      email: 'anna.esposito@example.com',
      city: 'Monza',
      segment: 'professionista',
      docExpiry: d(-4),
      amlReviewDue: d(300),
      iddQuestionnaireDate: addMonths(today, -8),
      lastContact: d(-35),
      policies: [{ id: 'p0201', kind: 'multiramo', ref: '••••3390', startDate: addYears(d(-20), -3), annualPremium: 6000 }],
    },
    {
      id: 'c03',
      firstName: 'Luca',
      lastName: 'Verdi',
      birthDate: birthFor(today, 41, 210),
      phone: '+39 000 000 0103',
      email: 'luca.verdi@example.com',
      city: 'Sesto San Giovanni',
      segment: 'famiglia',
      docExpiry: d(700),
      amlReviewDue: d(3),
      iddQuestionnaireDate: addMonths(today, -2),
      lastContact: d(-12),
      policies: [{ id: 'p0301', kind: 'risparmio', ref: '••••7712', startDate: addYears(d(9), -4), annualPremium: 1800 }],
      notes: 'Proposta TCM accettata, consegna polizza la prossima settimana.',
    },
    {
      id: 'c04',
      firstName: 'Paolo',
      lastName: 'Ferrari',
      birthDate: birthFor(today, 62, 120),
      phone: '+39 000 000 0104',
      city: 'Milano',
      segment: 'professionista',
      docExpiry: d(520),
      amlReviewDue: d(140),
      iddQuestionnaireDate: addDays(addMonths(today, -24), -5),
      lastContact: d(-95),
      policies: [{ id: 'p0401', kind: 'unit_linked', ref: '••••5508', startDate: addYears(d(60), -7), annualPremium: 10000 }],
    },
    {
      id: 'c05',
      firstName: 'Franco',
      lastName: 'Neri',
      birthDate: birthFor(today, 71, 250),
      phone: '+39 000 000 0105',
      city: 'Cinisello Balsamo',
      segment: 'pensionato',
      docExpiry: d(90),
      amlReviewDue: d(45),
      iddQuestionnaireDate: addMonths(today, -14),
      lastContact: d(-6),
      policies: [{ id: 'p0501', kind: 'risparmio', ref: '••••2047', startDate: addYears(d(-100), -12), annualPremium: 0 }],
    },
    {
      id: 'c06',
      firstName: 'Giorgio',
      lastName: 'Marino',
      birthDate: birthFor(today, 36, 30),
      phone: '+39 000 000 0106',
      email: 'giorgio.marino@example.com',
      city: 'Milano',
      segment: 'privato',
      docExpiry: d(1100),
      amlReviewDue: d(600),
      iddQuestionnaireDate: addMonths(today, -1),
      lastContact: d(-20),
      policies: [{ id: 'p0601', kind: 'unit_linked', ref: '••••6631', startDate: addMonths(today, -11), pac: { amount: 150, dayOfMonth: 1 } }],
    },
    {
      id: 'c07',
      firstName: 'Chiara',
      lastName: 'Gallo',
      birthDate: birthFor(today, 67, 0),
      phone: '+39 000 000 0107',
      city: 'Bresso',
      segment: 'pensionato',
      docExpiry: d(260),
      amlReviewDue: d(85),
      iddQuestionnaireDate: addMonths(today, -10),
      lastContact: d(-60),
      policies: [{ id: 'p0701', kind: 'pip', ref: '••••9054', startDate: addYears(d(15), -18), annualPremium: 2000 }],
      notes: 'Raggiunge i requisiti per la prestazione PIP: valutare rendita o capitale.',
    },
    {
      id: 'c08',
      firstName: 'Sara',
      lastName: 'Colombo',
      birthDate: birthFor(today, 33, 140),
      phone: '+39 000 000 0108',
      email: 'sara.colombo@example.com',
      city: 'Milano',
      segment: 'privato',
      policies: [],
      tags: ['prospect', 'segnalata da M. Rossi'],
    },
    {
      id: 'c09',
      firstName: 'Elena',
      lastName: 'Ricci',
      birthDate: birthFor(today, 45, 300),
      phone: '+39 000 000 0109',
      email: 'elena.ricci@example.com',
      city: 'Rho',
      segment: 'famiglia',
      docExpiry: d(830),
      amlReviewDue: d(360),
      iddQuestionnaireDate: d(-3),
      lastContact: d(-3),
      policies: [],
      notes: 'Firma multiramo con firma elettronica (OTP).',
    },
    {
      id: 'c10',
      firstName: 'Giulia',
      lastName: 'Romano',
      birthDate: birthFor(today, 54, 5),
      phone: '+39 000 000 0110',
      email: 'giulia.romano@example.com',
      city: 'Milano',
      segment: 'famiglia',
      docExpiry: d(360),
      amlReviewDue: d(210),
      iddQuestionnaireDate: addMonths(today, -6),
      lastContact: d(-75),
      policies: [
        { id: 'p1001', kind: 'risparmio', ref: '••••8120', startDate: addYears(d(45), -10), maturityDate: d(45), annualPremium: 2500 },
        { id: 'p1002', kind: 'casa', ref: '••••8121', startDate: addYears(d(120), -2), annualPremium: 380 },
      ],
      notes: 'Capitale a scadenza tra 45 giorni: proporre reinvestimento.',
    },
    {
      id: 'c11',
      firstName: 'Marco',
      lastName: 'Bruno',
      birthDate: birthFor(today, 52, 90),
      phone: '+39 000 000 0111',
      city: 'Cologno Monzese',
      segment: 'professionista',
      docExpiry: d(20),
      amlReviewDue: d(400),
      iddQuestionnaireDate: addMonths(today, -16),
      lastContact: d(-400),
      policies: [{ id: 'p1101', kind: 'tcm', ref: '••••4410', startDate: addYears(d(180), -5), annualPremium: 420 }],
    },
    {
      id: 'c12',
      firstName: 'Francesca',
      lastName: 'Conti',
      birthDate: birthFor(today, 39, 180),
      phone: '+39 000 000 0112',
      email: 'francesca.conti@example.com',
      city: 'Milano',
      segment: 'famiglia',
      docExpiry: d(640),
      amlReviewDue: d(230),
      iddQuestionnaireDate: addMonths(today, -9),
      lastContact: d(-30),
      policies: [
        { id: 'p1201', kind: 'salute', ref: '••••7302', startDate: addYears(d(9), -3), annualPremium: 960 },
        { id: 'p1202', kind: 'multiramo', ref: '••••7303', startDate: addYears(d(70), -1), annualPremium: 5000 },
      ],
    },
    {
      id: 'c13',
      firstName: 'Alessandro',
      lastName: 'Greco',
      birthDate: birthFor(today, 47, 45),
      phone: '+39 000 000 0113',
      city: 'Segrate',
      segment: 'professionista',
      docExpiry: d(300),
      amlReviewDue: d(25),
      iddQuestionnaireDate: addMonths(today, -12),
      lastContact: d(-1),
      policies: [{ id: 'p1301', kind: 'unit_linked', ref: '••••1599', startDate: addYears(d(200), -4), annualPremium: 12000 }],
    },
    {
      id: 'c14',
      firstName: 'Valentina',
      lastName: 'De Luca',
      birthDate: birthFor(today, 31, 12),
      phone: '+39 000 000 0114',
      email: 'valentina.deluca@example.com',
      city: 'Milano',
      segment: 'privato',
      docExpiry: d(1500),
      amlReviewDue: d(700),
      iddQuestionnaireDate: addMonths(today, -1),
      lastContact: d(-2),
      policies: [
        { id: 'p1401', kind: 'tcm', ref: '••••2286', startDate: d(-2), annualPremium: 310 },
        { id: 'p1402', kind: 'salute', ref: '••••2287', startDate: addYears(d(-40), -1), annualPremium: 640 },
      ],
    },
  ]

  const task = (t: Omit<Task, 'createdAt' | 'status'> & Partial<Pick<Task, 'status' | 'completedAt'>>): Task => ({
    status: 'da_fare',
    createdAt,
    ...t,
  })

  const tasks: Task[] = [
    task({ id: 't01', title: 'Richiamare per confermare la revisione del portafoglio', category: 'ricontatto', priority: 'alta', dueDate: today, dueTime: '09:00', clientId: 'c01' }),
    task({ id: 't02', title: "Richiedere copia del documento d'identità rinnovato", category: 'documento', priority: 'alta', dueDate: d(-2), clientId: 'c02', notes: 'Documento scaduto: senza copia valida non si possono fare operazioni.' }),
    task({ id: 't03', title: 'Fissare il rinnovo dell\'adeguata verifica antiriciclaggio', category: 'compliance', priority: 'alta', dueDate: today, clientId: 'c03' }),
    task({ id: 't04', title: 'Aggiornare il questionario di adeguatezza (scaduto)', category: 'adeguatezza', priority: 'media', dueDate: today, clientId: 'c04' }),
    task({ id: 't05', title: 'Riscatto parziale: caricare modulo firmato e IBAN', category: 'pratica', priority: 'alta', dueDate: d(-1), clientId: 'c05' }),
    task({ id: 't06', title: 'Verificare addebito PAC da 150 € non andato a buon fine', category: 'versamento', priority: 'media', dueDate: today, dueTime: '12:30', clientId: 'c06' }),
    task({ id: 't07', title: 'Auguri di compleanno (67 anni) e verifica prestazione PIP', category: 'ricorrenza', priority: 'media', dueDate: today, clientId: 'c07' }),
    task({ id: 't08', title: 'Corso e-learning "Antiriciclaggio 2026" (2 ore)', category: 'formazione', priority: 'bassa', dueDate: today }),
    task({ id: 't09', title: 'Inviare KID e documentazione precontrattuale', category: 'commerciale', priority: 'alta', dueDate: today, clientId: 'c09', status: 'completata', completedAt: doneAt }),
    task({ id: 't10', title: 'Confermare l\'appuntamento telefonico', category: 'ricontatto', priority: 'bassa', dueDate: today, clientId: 'c06', status: 'completata', completedAt: doneAt }),
    task({ id: 't11', title: 'Preparare la documentazione per la consegna della polizza TCM', category: 'scadenza_polizza', priority: 'media', dueDate: w(1), clientId: 'c03' }),
    task({ id: 't12', title: "Inviare il riepilogo dell'incontro e la proposta", category: 'commerciale', priority: 'media', dueDate: w(1), clientId: 'c08' }),
    task({ id: 't13', title: 'Ricontattare: nessun incontro da oltre un anno', category: 'ricontatto', priority: 'bassa', dueDate: w(2), clientId: 'c11' }),
    task({ id: 't14', title: 'Capitale in scadenza: preparare proposta di reinvestimento', category: 'scadenza_polizza', priority: 'media', dueDate: w(5), clientId: 'c10' }),
    task({ id: 't15', title: 'Rispondere al reclamo entro il termine di 45 giorni', category: 'pratica', priority: 'alta', dueDate: d(10), clientId: 'c12' }),
    task({ id: 't16', title: 'Report trimestrale del portafoglio clienti', category: 'amministrativa', priority: 'bassa', dueDate: w(3) }),
    task({ id: 't17', title: 'Inviare documento di sintesi dello switch', category: 'pratica', priority: 'bassa', dueDate: d(-3), clientId: 'c13', status: 'completata', completedAt: `${d(-3)}T15:00:00.000Z` }),
  ]

  const appt = (a: Omit<Appointment, 'status' | 'source'> & Partial<Pick<Appointment, 'status' | 'outcome'>>): Appointment => ({
    status: a.date < today ? 'svolto' : 'confermato',
    source: 'manuale',
    ...a,
  })

  const appointments: Appointment[] = [
    appt({ id: 'a01', title: 'Revisione portafoglio', type: 'revisione_portafoglio', date: today, start: '09:30', end: '10:30', location: 'ufficio', clientId: 'c01', notes: 'Portare report rendimenti e proposta di ribilanciamento.' }),
    appt({ id: 'a02', title: 'Primo incontro (segnalata da M. Rossi)', type: 'primo_incontro', date: today, start: '11:30', end: '12:15', location: 'domicilio', locationDetail: 'Via dei Tigli 12, Milano', clientId: 'c08', status: 'pianificato' }),
    appt({ id: 'a03', title: 'Esito proposta PAC', type: 'call', date: today, start: '14:30', end: '14:50', location: 'telefono', locationDetail: '+39 000 000 0106', clientId: 'c06' }),
    appt({ id: 'a04', title: 'Firma contratto multiramo', type: 'firma_contratto', date: today, start: '16:00', end: '17:00', location: 'video', locationDetail: 'Link videochiamata nella mail di conferma', clientId: 'c09', notes: 'Checklist: documento, codice fiscale, IBAN, questionario IDD, KID.' }),
    appt({ id: 'a05', title: 'Questionario di adeguatezza', type: 'call', date: w(1), start: '10:00', end: '10:30', location: 'telefono', clientId: 'c04' }),
    appt({ id: 'a06', title: 'Consegna polizza TCM', type: 'consegna_polizza', date: w(3), start: '11:00', end: '11:45', location: 'ufficio', clientId: 'c03' }),
    appt({ id: 'a07', title: 'Aggiornamento professionale IVASS (aula)', type: 'formazione', date: w(4), start: '09:00', end: '13:00', location: 'ufficio', locationDetail: 'Sala formazione agenzia' }),
    appt({ id: 'a08', title: "Riunione di agenzia", type: 'riunione_agenzia', date: w(6), start: '15:00', end: '16:30', location: 'ufficio' }),
    appt({ id: 'a09', title: 'Reinvestimento capitale in scadenza', type: 'revisione_portafoglio', date: w(7), start: '17:00', end: '18:00', location: 'domicilio', clientId: 'c10' }),
    appt({ id: 'a10', title: 'Gestione reclamo: incontro chiarimento', type: 'call', date: w(8), start: '12:00', end: '12:30', location: 'video', clientId: 'c12' }),
    appt({ id: 'a11', title: 'Primo incontro (contatto da evento)', type: 'primo_incontro', date: w(11), start: '18:00', end: '19:00', location: 'ufficio', status: 'pianificato' }),
    appt({ id: 'a12', title: 'Revisione annuale', type: 'revisione_portafoglio', date: w(13), start: '10:00', end: '11:00', location: 'ufficio', clientId: 'c11', status: 'pianificato' }),
    appt({ id: 'a13', title: 'Valutazione prestazione PIP', type: 'revisione_portafoglio', date: w(15), start: '15:00', end: '16:00', location: 'domicilio', clientId: 'c07', status: 'pianificato' }),
    appt({ id: 'a14', title: 'Revisione portafoglio', type: 'revisione_portafoglio', date: w(-1), start: '10:00', end: '11:00', location: 'ufficio', clientId: 'c13', outcome: 'positivo' }),
    appt({ id: 'a15', title: 'Consegna polizza TCM', type: 'consegna_polizza', date: w(-2), start: '17:30', end: '18:00', location: 'ufficio', clientId: 'c14', outcome: 'positivo' }),
    appt({ id: 'a16', title: 'Raccolta documenti riscatto', type: 'call', date: w(-6), start: '11:00', end: '11:20', location: 'telefono', clientId: 'c05', outcome: 'da_ricontattare' }),
    appt({ id: 'a17', title: 'Primo incontro', type: 'primo_incontro', date: w(-8), start: '18:00', end: '19:00', location: 'ufficio', clientId: 'c09', outcome: 'positivo' }),
    appt({ id: 'a18', title: 'Riunione di agenzia', type: 'riunione_agenzia', date: w(-9), start: '15:00', end: '16:30', location: 'ufficio' }),
  ]

  const cases: Case[] = [
    { id: 'k01', type: 'riscatto', clientId: 'c05', title: 'Riscatto parziale polizza ••••2047', openedOn: d(-6), status: 'attesa_documenti', amount: 15000, notes: 'Mancano modulo firmato e IBAN.' },
    { id: 'k02', type: 'reclamo', clientId: 'c12', title: 'Reclamo sui tempi di liquidazione', openedOn: d(-35), dueDate: d(10), status: 'aperta' },
    { id: 'k03', type: 'liquidazione_scadenza', clientId: 'c10', title: 'Liquidazione a scadenza polizza ••••8120', openedOn: d(-2), dueDate: d(45), status: 'aperta', amount: 32500 },
    { id: 'k04', type: 'switch', clientId: 'c13', title: 'Switch da Azionario Globale a Bilanciato Dinamico', openedOn: d(-3), status: 'inviata_sede', amount: 20000 },
    { id: 'k05', type: 'sinistro', clientId: 'c14', title: 'Richiesta di rimborso polizza ••••2287', openedOn: d(-18), status: 'inviata_sede', amount: 640 },
    { id: 'k06', type: 'variazione_beneficiario', clientId: 'c01', title: 'Variazione beneficiari polizza ••••4821', openedOn: d(-40), status: 'chiusa' },
  ]

  const goals = defaultGoals(today).map((g) => {
    const current: Record<string, number> = {
      'g-prod-mese': 16200,
      'g-prod-anno': 168000,
      'g-protezione': 1,
      'g-previdenza': 8,
      'g-clienti': 2,
    }
    return { ...g, current: current[g.id] ?? 0 }
  })

  const year = parseKey(today).year
  const training: Training = {
    year,
    hoursRequired: 30,
    courses: [
      { id: 'tr1', title: 'IDD e governo del prodotto: aggiornamento', hours: 6, done: true },
      { id: 'tr2', title: 'Prodotti multiramo e unit linked', hours: 8, done: true },
      { id: 'tr3', title: 'Previdenza complementare', hours: 4, done: true },
      { id: 'tr4', title: 'Privacy e sicurezza informatica', hours: 2, done: true },
      { id: 'tr5', title: 'Tecniche di consulenza', hours: 2, done: true },
      { id: 'tr6', title: `Antiriciclaggio ${year}`, hours: 2, done: false, dueDate: today },
      { id: 'tr7', title: 'Finanza sostenibile (ESG)', hours: 4, done: false, dueDate: `${year}-12-15` },
      { id: 'tr8', title: 'Aggiornamento professionale in aula', hours: 4, done: false, dueDate: w(4) },
    ],
  }

  return {
    schemaVersion: 1,
    isDemo: true,
    demoGeneratedOn: today,
    settings,
    tasks,
    appointments,
    clients,
    cases,
    goals,
    training,
    quickNote: '',
  }
}
