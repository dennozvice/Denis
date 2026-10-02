import { describe, expect, it } from 'vitest'
import type { Appointment, Client } from '../domain/types'
import {
  appointmentsToIcs,
  decodeIcsBytes,
  escapeText,
  eventExternalId,
  exportSummary,
  foldLine,
  guessAppointmentType,
  guessLocation,
  icsEventsToAppointments,
  matchClient,
  parseDuration,
  parseIcs,
  parseRrule,
  unescapeText,
  unfoldLines,
  type IcsEvent,
} from './ics'

const crlf = (lines: string[]) => lines.join('\r\n') + '\r\n'
const utf8Bytes = (s: string) => new TextEncoder().encode(s).length

const client = (id: string, firstName: string, lastName: string, extra: Partial<Client> = {}): Client => ({
  id,
  firstName,
  lastName,
  policies: [],
  ...extra,
})

const CLIENTS: Client[] = [
  client('c01', 'Mario', 'Rossi', { phone: '+39 000 000 0101' }),
  client('c02', 'Anna', 'Esposito'),
  client('c03', 'Niccolò', 'De Santis'),
]

// ---------------------------------------------------------------- campioni realistici

/** Esportazione stile Outlook: CRLF, VTIMEZONE Windows, righe piegate, TZID tra virgolette. */
const OUTLOOK_SAMPLE = crlf([
  'BEGIN:VCALENDAR',
  'PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN',
  'VERSION:2.0',
  'METHOD:PUBLISH',
  'X-WR-CALNAME:Calendario',
  'BEGIN:VTIMEZONE',
  'TZID:W. Europe Standard Time',
  'BEGIN:STANDARD',
  'DTSTART:16011028T030000',
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:16010325T020000',
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'CLASS:PUBLIC',
  'CREATED:20260920T101500Z',
  'DESCRIPTION:Portare il report dei rendimenti e la proposta di ribilanciament',
  ' o verso la componente prudente.\\nRicordarsi il questionario IDD.\\n',
  'DTEND;TZID="W. Europe Standard Time":20261005T110000',
  'DTSTAMP:20260925T080000Z',
  'DTSTART;TZID="W. Europe Standard Time":20261005T100000',
  'LOCATION:Via dei Tigli 12\\, Milano',
  'SUMMARY;LANGUAGE=it:Revisione portafoglio Mario Rossi',
  'UID:040000008200E00074C5B7101A82E00800000000A0B1C2D3E4F5',
  'BEGIN:VALARM',
  'TRIGGER:-PT15M',
  'ACTION:DISPLAY',
  'DESCRIPTION:Promemoria',
  'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Romance Standard Time:20261006T143000',
  'DTEND;TZID=Romance Standard Time:20261006T150000',
  'SUMMARY:Telefonata Esposito Anna',
  'LOCATION:+39 000 000 0102',
  'UID:outlook-2',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Central Europe Standard Time:20261007T090000',
  'DTEND;TZID=Central Europe Standard Time:20261007T093000',
  'SUMMARY:Riunione di agenzia',
  'UID:outlook-3',
  'END:VEVENT',
  'END:VCALENDAR',
])

/** Esportazione stile Google Calendar: orari UTC con suffisso Z, LF, eventi a cavallo del cambio d'ora. */
const GOOGLE_SAMPLE = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'VERSION:2.0',
  'CALSCALE:GREGORIAN',
  'X-WR-TIMEZONE:Europe/Rome',
  'BEGIN:VEVENT',
  'DTSTART:20261005T080000Z',
  'DTEND:20261005T090000Z',
  'UID:g1@google.com',
  'SUMMARY:Call con Anna Esposito',
  'DESCRIPTION:Partecipa con Google Meet: https://meet.google.com/abc-defg-hij',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261024T090000Z',
  'DTEND:20261024T100000Z',
  'UID:g2@google.com',
  'SUMMARY:Sabato prima del cambio ora',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261025T090000Z',
  'DTEND:20261025T103000Z',
  'UID:g3@google.com',
  'SUMMARY:Domenica dopo il cambio ora',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261231T230000Z',
  'DTEND:20270101T000000Z',
  'UID:g4@google.com',
  'SUMMARY:Capodanno',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\n')

// ---------------------------------------------------------------- parser

describe('unfoldLines', () => {
  it('ricongiunge le righe piegate con spazio o tab e gestisce CRLF/LF/CR', () => {
    expect(unfoldLines('A:uno\r\n  due\r\nB:tre\n\tquattro\rC:cinque')).toEqual([
      'A:uno due',
      'B:trequattro',
      'C:cinque',
    ])
  })
  it('ignora le righe vuote e il BOM', () => {
    expect(unfoldLines('\uFEFFA:1\r\n\r\nB:2\r\n')).toEqual(['A:1', 'B:2'])
  })
})

describe('parseIcs – Outlook', () => {
  const { events, warnings } = parseIcs(OUTLOOK_SAMPLE)

  it('legge tutti gli eventi, ordinati per data', () => {
    expect(events).toHaveLength(3)
    expect(events.map((e) => e.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07'])
  })

  it("tratta i fusi Windows dell'Europa centrale come ora di Roma", () => {
    expect(events[0]).toMatchObject({ start: '10:00', end: '11:00', allDay: false, recurring: false })
    expect(events[1]).toMatchObject({ start: '14:30', end: '15:00' })
    expect(events[2]).toMatchObject({ start: '09:00', end: '09:30' })
    expect(warnings).toEqual([])
  })

  it('ricongiunge le righe piegate e decodifica i caratteri di escape', () => {
    expect(events[0].description).toBe(
      'Portare il report dei rendimenti e la proposta di ribilanciamento verso la componente prudente.\nRicordarsi il questionario IDD.',
    )
    expect(events[0].location).toBe('Via dei Tigli 12, Milano')
    expect(events[0].summary).toBe('Revisione portafoglio Mario Rossi')
    expect(events[0].uid).toBe('040000008200E00074C5B7101A82E00800000000A0B1C2D3E4F5')
  })

  it('ignora le proprietà dei componenti annidati (VALARM)', () => {
    expect(events[0].description).not.toContain('Promemoria')
  })
})

describe('parseIcs – Google', () => {
  const { events, warnings } = parseIcs(GOOGLE_SAMPLE)
  const byUid = (uid: string) => events.find((e) => e.uid === uid)!

  it("converte gli orari UTC (Z) nell'ora di Roma, con ora legale", () => {
    expect(byUid('g1@google.com')).toMatchObject({ date: '2026-10-05', start: '10:00', end: '11:00' })
  })

  it("gestisce il ritorno all'ora solare del 25 ottobre 2026", () => {
    expect(byUid('g2@google.com')).toMatchObject({ date: '2026-10-24', start: '11:00', end: '12:00' })
    expect(byUid('g3@google.com')).toMatchObject({ date: '2026-10-25', start: '10:00', end: '11:30' })
  })

  it('un evento che finisce alle 00:00 del giorno dopo resta nel suo giorno, senza avvisi', () => {
    // 23:00Z del 31/12 = 00:00 del 1/1 a Roma
    expect(byUid('g4@google.com')).toMatchObject({ date: '2027-01-01', start: '00:00', end: '01:00' })
    expect(warnings).toEqual([])
  })
})

describe('parseIcs – casi particolari', () => {
  const wrap = (...body: string[]) => crlf(['BEGIN:VCALENDAR', 'VERSION:2.0', ...body, 'END:VCALENDAR'])

  it('eventi "tutto il giorno" (VALUE=DATE): 00:00–23:59, DTEND esclusivo', () => {
    const { events, warnings } = parseIcs(
      wrap(
        'BEGIN:VEVENT',
        'UID:d1',
        'DTSTART;VALUE=DATE:20261005',
        'DTEND;VALUE=DATE:20261006',
        'SUMMARY:Ferie',
        'END:VEVENT',
      ),
    )
    expect(events[0]).toMatchObject({ date: '2026-10-05', start: '00:00', end: '23:59', allDay: true })
    expect(warnings).toEqual([])
  })

  it('eventi su più giorni: si tiene il primo giorno e si avvisa', () => {
    const { events, warnings } = parseIcs(
      wrap(
        'BEGIN:VEVENT',
        'UID:m1',
        'DTSTART;VALUE=DATE:20261005',
        'DTEND;VALUE=DATE:20261008',
        'SUMMARY:Convention',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:m2',
        'DTSTART;TZID=Europe/Rome:20261010T180000',
        'DTEND;TZID=Europe/Rome:20261011T120000',
        'SUMMARY:Trasferta',
        'END:VEVENT',
      ),
    )
    expect(events[0]).toMatchObject({ date: '2026-10-05', allDay: true })
    expect(events[1]).toMatchObject({ date: '2026-10-10', start: '18:00', end: '23:59' })
    expect(warnings).toEqual(['2 eventi su più giorni: viene importato solo il primo giorno.'])
  })

  it('RRULE: prima occorrenza, recurring=true e avviso con il conteggio', () => {
    const { events, warnings } = parseIcs(
      wrap(
        'BEGIN:VEVENT',
        'UID:r1',
        'DTSTART;TZID=Europe/Rome:20261005T090000',
        'DTEND;TZID=Europe/Rome:20261005T093000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10',
        'SUMMARY:Riunione settimanale',
        'END:VEVENT',
        // modifica di una singola occorrenza: ignorata
        'BEGIN:VEVENT',
        'UID:r1',
        'RECURRENCE-ID;TZID=Europe/Rome:20261012T090000',
        'DTSTART;TZID=Europe/Rome:20261012T100000',
        'DTEND;TZID=Europe/Rome:20261012T103000',
        'SUMMARY:Riunione settimanale (spostata)',
        'END:VEVENT',
      ),
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ date: '2026-10-05', start: '09:00', end: '09:30', recurring: true })
    expect(warnings).toContain('1 evento ricorrente: viene importata solo la prima occorrenza.')
    expect(warnings).toContain('1 modifica a una singola occorrenza è stata ignorata.')
  })

  it('DURATION al posto di DTEND', () => {
    const { events } = parseIcs(
      wrap('BEGIN:VEVENT', 'UID:x', 'DTSTART:20261005T100000', 'DURATION:PT1H30M', 'SUMMARY:Lungo', 'END:VEVENT'),
    )
    expect(events[0]).toMatchObject({ start: '10:00', end: '11:30' })
  })

  it('orari "fluttuanti" (senza fuso) presi così come sono; senza fine = 60 minuti', () => {
    const { events } = parseIcs(
      wrap('BEGIN:VEVENT', 'UID:f', 'DTSTART:20261005T163000', 'SUMMARY:Senza fine', 'END:VEVENT'),
    )
    expect(events[0]).toMatchObject({ date: '2026-10-05', start: '16:30', end: '17:30' })
  })

  it('salta gli eventi senza DTSTART, annullati o duplicati, con avvisi', () => {
    const { events, warnings } = parseIcs(
      wrap(
        'BEGIN:VEVENT',
        'UID:no-start',
        'SUMMARY:Senza data',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:canc',
        'DTSTART:20261005T100000',
        'STATUS:CANCELLED',
        'SUMMARY:Annullato',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:dup',
        'DTSTART:20261005T100000',
        'SUMMARY:Uno',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:dup',
        'DTSTART:20261006T100000',
        'SUMMARY:Uno bis',
        'END:VEVENT',
      ),
    )
    expect(events.map((e) => e.summary)).toEqual(['Uno'])
    expect(warnings).toEqual([
      '1 evento senza data di inizio valida è stato ignorato.',
      '1 evento annullato è stato ignorato.',
      '1 evento duplicato è stato ignorato.',
    ])
  })

  it("fusi sconosciuti: orario così com'è e avviso (una volta per fuso)", () => {
    const { events, warnings } = parseIcs(
      wrap(
        'BEGIN:VEVENT',
        'UID:t1',
        'DTSTART;TZID=Fuso Inventato:20261005T100000',
        'DTEND;TZID=Fuso Inventato:20261005T110000',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:t2',
        'DTSTART;TZID=Fuso Inventato:20261006T100000',
        'END:VEVENT',
      ),
    )
    expect(events[0]).toMatchObject({ start: '10:00', end: '11:00' })
    expect(warnings).toEqual([
      'Fuso orario non riconosciuto ("Fuso Inventato"): gli orari sono stati importati così come sono.',
    ])
  })

  it('fusi IANA diversi da Roma vengono convertiti', () => {
    const { events, warnings } = parseIcs(
      wrap(
        'BEGIN:VEVENT',
        'UID:ny',
        'DTSTART;TZID=America/New_York:20261005T100000',
        'DTEND;TZID=America/New_York:20261005T110000',
        'END:VEVENT',
      ),
    )
    // New York EDT (UTC−4) → Roma CEST (UTC+2): +6 ore
    expect(events[0]).toMatchObject({ date: '2026-10-05', start: '16:00', end: '17:00' })
    expect(warnings).toEqual([])
  })

  it('VTIMEZONE personalizzato con regole CET/CEST = ora di Roma', () => {
    const { events, warnings } = parseIcs(
      wrap(
        'BEGIN:VEVENT',
        'UID:cust',
        'DTSTART;TZID="Customized Time Zone":20261005T100000',
        'END:VEVENT',
        'BEGIN:VTIMEZONE',
        'TZID:Customized Time Zone',
        'BEGIN:STANDARD',
        'TZOFFSETFROM:+0200',
        'TZOFFSETTO:+0100',
        'END:STANDARD',
        'BEGIN:DAYLIGHT',
        'TZOFFSETFROM:+0100',
        'TZOFFSETTO:+0200',
        'END:DAYLIGHT',
        'END:VTIMEZONE',
      ),
    )
    expect(events[0].start).toBe('10:00')
    expect(warnings).toEqual([])
  })

  it('testo vuoto o non iCalendar: nessun evento, nessuna eccezione', () => {
    expect(parseIcs('')).toEqual({ events: [], warnings: [] })
    expect(parseIcs('ciao, questo non è un calendario').events).toEqual([])
  })
})

describe('testo e durate', () => {
  it('unescapeText', () => {
    expect(unescapeText('Riunione\\, agenzia\\; sede\\nnord \\\\ fine')).toBe('Riunione, agenzia; sede\nnord \\ fine')
    expect(unescapeText('a\\Nb')).toBe('a\nb')
    // "\\n" nel file = barra rovesciata + n, non un a capo
    expect(unescapeText('C:\\\\nuovi')).toBe('C:\\nuovi')
  })

  it("escapeText è l'inverso di unescapeText", () => {
    const original = 'Nota; con, virgole\\barre\r\ne a capo'
    expect(escapeText(original)).toBe('Nota\\; con\\, virgole\\\\barre\\ne a capo')
    expect(unescapeText(escapeText(original))).toBe('Nota; con, virgole\\barre\ne a capo')
  })

  it('parseDuration', () => {
    expect(parseDuration('PT1H30M')).toBe(90)
    expect(parseDuration('PT45M')).toBe(45)
    expect(parseDuration('P1D')).toBe(1440)
    expect(parseDuration('P1W')).toBe(7 * 1440)
    expect(parseDuration('P1DT2H')).toBe(1560)
    expect(parseDuration('-PT15M')).toBe(-15)
    expect(parseDuration('P')).toBeNull()
    expect(parseDuration('PT')).toBeNull()
    expect(parseDuration('1H')).toBeNull()
  })
})

describe('decodeIcsBytes', () => {
  it('ricongiunge una piegatura che spezza un carattere multibyte', () => {
    const bytes = new TextEncoder().encode('SUMMARY:Attività\r\n')
    // "à" = C3 A0: si inserisce CRLF + spazio tra i due byte
    const idx = bytes.indexOf(0xc3)
    const folded = new Uint8Array([...bytes.slice(0, idx + 1), 0x0d, 0x0a, 0x20, ...bytes.slice(idx + 1)])
    expect(decodeIcsBytes(folded)).toBe('SUMMARY:Attività\r\n')
  })

  it('ripiega su Windows-1252 se il file non è UTF-8', () => {
    const latin = new Uint8Array([...new TextEncoder().encode('SUMMARY:Citt'), 0xe0])
    expect(decodeIcsBytes(latin)).toBe('SUMMARY:Città')
  })
})

// ---------------------------------------------------------------- conversione in appuntamenti

describe('guessAppointmentType', () => {
  it.each([
    ['Firma contratto multiramo', 'firma_contratto'],
    ['Consegna polizza TCM', 'consegna_polizza'],
    ['Revisione annuale', 'revisione_portafoglio'],
    ['Analisi portafoglio', 'revisione_portafoglio'],
    ['Call con il cliente', 'call'],
    ['Telefonata di cortesia', 'call'],
    ['Chiamata Rossi', 'call'],
    ['Corso IVASS', 'formazione'],
    ['Webinar mercati', 'formazione'],
    ['Riunione di agenzia', 'riunione_agenzia'],
    ['Team meeting', 'riunione_agenzia'],
    ['Primo incontro famiglia Bianchi', 'primo_incontro'],
    ['Appuntamento conoscitivo', 'altro'],
    ['Incontro di conoscenza', 'primo_incontro'],
    ['Dentista', 'altro'],
    ['Recall', 'altro'],
  ])('%s → %s', (summary, type) => {
    expect(guessAppointmentType(summary)).toBe(type)
  })
})

describe('guessAppointmentType con CATEGORIES', () => {
  it("usa la categoria se coincide con un tipo dell'app", () => {
    expect(guessAppointmentType('Esito proposta PAC', ['Telefonata'])).toBe('call')
    expect(guessAppointmentType('Firma', ['Lavoro'])).toBe('firma_contratto')
  })
  it('legge CATEGORIES multiple dal file', () => {
    const { events } = parseIcs(
      crlf([
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:c',
        'DTSTART:20261005T100000',
        'CATEGORIES:Lavoro,Riunione di agenzia\\, sede',
        'END:VEVENT',
        'END:VCALENDAR',
      ]),
    )
    expect(events[0].categories).toEqual(['Lavoro', 'Riunione di agenzia, sede'])
  })
})

describe('guessLocation', () => {
  it('link o parole chiave di videochiamata → video', () => {
    expect(guessLocation('https://teams.microsoft.com/l/meetup-join/xyz', undefined)).toEqual({
      mode: 'video',
      detail: 'https://teams.microsoft.com/l/meetup-join/xyz',
    })
    expect(guessLocation('Riunione di Microsoft Teams', 'Partecipa: https://teams.microsoft.com/l/abc')).toEqual({
      mode: 'video',
      detail: 'https://teams.microsoft.com/l/abc',
    })
    expect(guessLocation(undefined, 'Partecipa con Google Meet: https://meet.google.com/abc')).toEqual({
      mode: 'video',
      detail: 'https://meet.google.com/abc',
    })
    expect(guessLocation('Zoom', undefined).mode).toBe('video')
  })

  it('luogo vuoto → ufficio; indirizzo → dal cliente; numero → telefono', () => {
    expect(guessLocation(undefined, undefined)).toEqual({ mode: 'ufficio' })
    expect(guessLocation('Via Roma 1, Milano', undefined)).toEqual({ mode: 'domicilio', detail: 'Via Roma 1, Milano' })
    expect(guessLocation('+39 02 1234 5678', undefined)).toEqual({ mode: 'telefono', detail: '+39 02 1234 5678' })
    expect(guessLocation('Sala riunioni agenzia', undefined)).toEqual({
      mode: 'ufficio',
      detail: 'Sala riunioni agenzia',
    })
  })

  it('le etichette generiche del nostro export non diventano dettagli', () => {
    expect(guessLocation('In ufficio', undefined)).toEqual({ mode: 'ufficio' })
    expect(guessLocation('Dal cliente', undefined)).toEqual({ mode: 'domicilio' })
    expect(guessLocation('Videochiamata', undefined)).toEqual({ mode: 'video' })
    expect(guessLocation('Telefono', undefined)).toEqual({ mode: 'telefono' })
  })
})

describe('matchClient', () => {
  it('trova "Nome Cognome" e "Cognome Nome" senza badare a maiuscole e accenti', () => {
    expect(matchClient('Revisione MARIO ROSSI', CLIENTS)?.id).toBe('c01')
    expect(matchClient('Telefonata Esposito Anna', CLIENTS)?.id).toBe('c02')
    expect(matchClient('Firma - Niccolo De Santis', CLIENTS)?.id).toBe('c03')
    expect(matchClient('Incontro con de santis niccolò', CLIENTS)?.id).toBe('c03')
  })
  it('non confonde nomi parziali', () => {
    expect(matchClient('Mario Rossini', CLIENTS)).toBeUndefined()
    expect(matchClient('Rossi', CLIENTS)).toBeUndefined()
  })
})

describe('icsEventsToAppointments', () => {
  const base: IcsEvent = {
    summary: '',
    date: '2026-10-05',
    start: '10:00',
    end: '11:00',
    allDay: false,
    recurring: false,
  }

  it('produce appuntamenti con origine ics, tipo, luogo e cliente', () => {
    const [a] = icsEventsToAppointments(
      [
        {
          ...base,
          uid: 'u1',
          summary: 'Revisione portafoglio Mario Rossi',
          location: 'Via dei Tigli 12, Milano',
          description: 'Note',
        },
      ],
      CLIENTS,
    )
    expect(a).toEqual({
      title: 'Revisione portafoglio Mario Rossi',
      type: 'revisione_portafoglio',
      date: '2026-10-05',
      start: '10:00',
      end: '11:00',
      location: 'domicilio',
      locationDetail: 'Via dei Tigli 12, Milano',
      clientId: 'c01',
      status: 'confermato',
      source: 'ics',
      externalId: 'u1',
      notes: 'Note',
    })
  })

  it('senza UID usa un hash stabile di titolo, data e ora', () => {
    const ev = { ...base, summary: 'Senza UID' }
    const [a] = icsEventsToAppointments([ev], [])
    const [b] = icsEventsToAppointments([{ ...ev }], [])
    expect(a.externalId).toMatch(/^ics-[0-9a-f]{8}$/)
    expect(a.externalId).toBe(b.externalId)
    expect(eventExternalId({ ...ev, start: '10:30' })).not.toBe(a.externalId)
  })

  it('toglie dal titolo il nome del cliente aggiunto dal nostro export', () => {
    const [a] = icsEventsToAppointments([{ ...base, summary: 'Consegna polizza – Mario Rossi' }], CLIENTS)
    expect(a.title).toBe('Consegna polizza')
    expect(a.clientId).toBe('c01')
    const [b] = icsEventsToAppointments([{ ...base, summary: 'Call - follow up Mario Rossi' }], CLIENTS)
    expect(b.title).toBe('Call - follow up Mario Rossi')
  })

  it('titolo mancante', () => {
    expect(icsEventsToAppointments([base], [])[0].title).toBe('(senza titolo)')
  })
})

// ---------------------------------------------------------------- export

const appt = (a: Partial<Appointment> & Pick<Appointment, 'id' | 'title' | 'date' | 'start' | 'end'>): Appointment => ({
  type: 'altro',
  location: 'ufficio',
  status: 'confermato',
  ...a,
})

describe('foldLine', () => {
  it('piega a 75 ottetti senza spezzare i caratteri multibyte', () => {
    const line = `SUMMARY:${'Attività è più così 😀 '.repeat(8)}`
    const folded = foldLine(line)
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) expect(utf8Bytes(p)).toBeLessThanOrEqual(75)
    for (const p of parts.slice(1)) expect(p.startsWith(' ')).toBe(true)
    expect(unfoldLines(folded)).toEqual([line])
  })
  it('le righe corte restano intatte', () => {
    expect(foldLine('VERSION:2.0')).toBe('VERSION:2.0')
  })
})

describe('appointmentsToIcs', () => {
  const NOW = new Date(Date.UTC(2026, 9, 2, 8, 0, 0))
  const appointments: Appointment[] = [
    appt({
      id: 'a01',
      title: 'Revisione portafoglio',
      type: 'revisione_portafoglio',
      date: '2026-10-05',
      start: '09:30',
      end: '10:30',
      clientId: 'c01',
      notes: 'Portare report; rendimenti, proposta\nSeconda riga con \\ barra',
    }),
    appt({
      id: 'a02',
      title: 'Primo incontro con una famiglia molto numerosa e un titolo davvero lunghissimo, più di 75 caratteri',
      type: 'primo_incontro',
      date: '2026-10-26',
      start: '11:30',
      end: '12:15',
      location: 'domicilio',
      locationDetail: 'Via dei Tigli 12, Milano',
      status: 'pianificato',
    }),
    appt({
      id: 'a03',
      title: 'Esito proposta PAC',
      type: 'call',
      date: '2026-10-06',
      start: '14:30',
      end: '14:50',
      location: 'telefono',
      clientId: 'c01',
    }),
  ]
  const ics = appointmentsToIcs(appointments, CLIENTS, { now: NOW, includeNotes: true })
  const lines = ics.split('\r\n')

  it('struttura VCALENDAR valida con VTIMEZONE Europe/Rome', () => {
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(lines).toContain('VERSION:2.0')
    expect(lines).toContain('CALSCALE:GREGORIAN')
    expect(lines.some((l) => l.startsWith('PRODID:'))).toBe(true)
    expect(lines).toContain('TZID:Europe/Rome')
    expect(lines).toContain('BEGIN:DAYLIGHT')
    expect(lines).toContain('BEGIN:STANDARD')
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(3)
  })

  it('righe CRLF, al massimo 75 ottetti', () => {
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    for (const l of lines) expect(utf8Bytes(l)).toBeLessThanOrEqual(75)
  })

  it('UID, DTSTAMP, DTSTART/DTEND con TZID, SUMMARY con il cliente', () => {
    const unfolded = unfoldLines(ics)
    expect(unfolded).toContain('UID:a01@advisor-desk')
    expect(unfolded).toContain('DTSTAMP:20261002T080000Z')
    expect(unfolded).toContain('DTSTART;TZID=Europe/Rome:20261005T093000')
    expect(unfolded).toContain('DTEND;TZID=Europe/Rome:20261005T103000')
    expect(unfolded).toContain('SUMMARY:Revisione portafoglio – Mario Rossi')
    expect(unfolded).toContain('LOCATION:Via dei Tigli 12\\, Milano')
    expect(unfolded).toContain('DESCRIPTION:Portare report\\; rendimenti\\, proposta\\nSeconda riga con \\\\ barra')
    expect(unfolded).toContain('STATUS:TENTATIVE')
    // telefono senza dettaglio: solo l'etichetta, mai il numero dalla scheda del cliente
    expect(unfolded).toContain('LOCATION:Telefono')
    expect(ics).not.toContain('0101')
  })

  it('andata e ritorno: export → import restituisce gli stessi appuntamenti', () => {
    const { events, warnings } = parseIcs(ics)
    expect(warnings).toEqual([])
    const back = icsEventsToAppointments(events, CLIENTS)
    const sorted = [...appointments].sort((a, b) => (a.date < b.date ? -1 : 1))
    expect(back).toHaveLength(3)
    back.forEach((b, i) => {
      const original = sorted[i]
      expect(b).toMatchObject({
        title: original.title,
        type: original.type,
        date: original.date,
        start: original.start,
        end: original.end,
        location: original.location,
        externalId: `${original.id}@advisor-desk`,
      })
      expect(b.clientId).toBe(original.clientId)
      expect(b.notes).toBe(original.notes)
    })
    expect(back.find((b) => b.externalId === 'a02@advisor-desk')?.locationDetail).toBe('Via dei Tigli 12, Milano')
  })
})

describe('appointmentsToIcs – tutto il giorno e titolo', () => {
  const NOW = new Date(Date.UTC(2026, 9, 2, 8, 0, 0))
  const appointments: Appointment[] = [
    appt({ id: 'a10', title: 'Ferie', type: 'personale', date: '2026-12-31', start: '00:00', end: '23:59' }),
    appt({
      id: 'a11',
      title: 'Firma contratto Rossi Mario',
      type: 'firma_contratto',
      date: '2026-10-07',
      start: '16:00',
      end: '17:00',
      clientId: 'c01',
    }),
  ]
  const unfolded = unfoldLines(appointmentsToIcs(appointments, CLIENTS, { now: NOW }))

  it('evento "tutto il giorno": DTSTART/DTEND VALUE=DATE (fine esclusiva, anche a cavallo d\'anno), senza luogo generico', () => {
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20261231')
    expect(unfolded).toContain('DTEND;VALUE=DATE:20270101')
    expect(unfolded.some((l) => l.includes('T000000') || l.includes('T235900'))).toBe(false)
    const event = unfolded.slice(unfolded.indexOf('UID:a10@advisor-desk'), unfolded.indexOf('END:VEVENT'))
    expect(event.some((l) => l.startsWith('LOCATION'))).toBe(false)
  })

  it('il nome del cliente non si ripete nel SUMMARY se il titolo lo contiene già', () => {
    expect(unfolded).toContain('SUMMARY:Firma contratto Rossi Mario')
    expect(exportSummary('Revisione portafoglio', CLIENTS[0])).toBe('Revisione portafoglio – Mario Rossi')
    expect(exportSummary('Revisione – MARIO ROSSI', CLIENTS[0])).toBe('Revisione – MARIO ROSSI')
    expect(exportSummary('Consulenza De Santis Niccolo', CLIENTS[2])).toBe('Consulenza De Santis Niccolo')
    // un nome solo simile non conta
    expect(exportSummary('Revisione Mario Rossini', CLIENTS[0])).toBe('Revisione Mario Rossini – Mario Rossi')
    expect(exportSummary('Riunione', undefined)).toBe('Riunione')
  })

  it('andata e ritorno: l\'evento "tutto il giorno" torna 00:00–23:59 di un solo giorno', () => {
    const { events, warnings } = parseIcs(appointmentsToIcs(appointments, CLIENTS, { now: NOW }))
    expect(warnings).toEqual([])
    const back = icsEventsToAppointments(events, CLIENTS)
    expect(back.find((b) => b.externalId === 'a10@advisor-desk')).toMatchObject({
      title: 'Ferie',
      type: 'personale',
      date: '2026-12-31',
      start: '00:00',
      end: '23:59',
    })
    expect(back.find((b) => b.externalId === 'a11@advisor-desk')).toMatchObject({
      title: 'Firma contratto Rossi Mario',
      clientId: 'c01',
    })
  })
})

describe('appointmentsToIcs – privacy', () => {
  const NOW = new Date(Date.UTC(2026, 9, 2, 8, 0, 0))
  const appointments: Appointment[] = [
    appt({
      id: 'p1',
      title: 'Revisione portafoglio',
      type: 'revisione_portafoglio',
      date: '2026-10-05',
      start: '09:30',
      end: '10:30',
      clientId: 'c01',
      location: 'domicilio',
      locationDetail: 'Via dei Tigli 12, Milano',
      notes: 'Patrimonio 250.000 €, figlio disabile',
    }),
    appt({
      id: 'p2',
      title: 'Esito proposta',
      type: 'call',
      date: '2026-10-06',
      start: '14:30',
      end: '14:50',
      location: 'telefono',
      clientId: 'c01',
    }),
  ]
  const unfoldedWith = (options: Parameters<typeof appointmentsToIcs>[2]) =>
    unfoldLines(appointmentsToIcs(appointments, CLIENTS, { now: NOW, ...options }))

  it('di default: nomi dei clienti e luoghi sì, note no, telefono del cliente mai', () => {
    const unfolded = unfoldedWith({})
    expect(unfolded).toContain('SUMMARY:Revisione portafoglio – Mario Rossi')
    expect(unfolded).toContain('LOCATION:Via dei Tigli 12\\, Milano')
    expect(unfolded.some((l) => l.startsWith('DESCRIPTION'))).toBe(false)
    expect(unfolded).toContain('LOCATION:Telefono')
    expect(unfolded.join('\n')).not.toContain('0101')
  })

  it('senza nomi dei clienti: il titolo resta quello dell\'appuntamento', () => {
    const unfolded = unfoldedWith({ includeClientNames: false })
    expect(unfolded).toContain('SUMMARY:Revisione portafoglio')
    expect(unfolded).toContain('SUMMARY:Esito proposta')
    expect(unfolded.join('\n')).not.toMatch(/Rossi|Mario/)
  })

  it('senza dettagli del luogo: solo l\'etichetta generica', () => {
    const unfolded = unfoldedWith({ includeLocationDetails: false })
    expect(unfolded).toContain('LOCATION:Dal cliente')
    expect(unfolded.join('\n')).not.toContain('Tigli')
  })

  it('con le note: DESCRIPTION', () => {
    expect(unfoldedWith({ includeNotes: true })).toContain('DESCRIPTION:Patrimonio 250.000 €\\, figlio disabile')
  })
})

// ---------------------------------------------------------------- ricorrenze

describe('parseRrule', () => {
  it('regole semplici', () => {
    expect(parseRrule('FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=2;WKST=SU')).toEqual({
      freq: 'WEEKLY',
      interval: 2,
      weekStart: 6,
      weekdays: [0, 2],
    })
    expect(parseRrule('FREQ=DAILY;COUNT=10')).toEqual({ freq: 'DAILY', interval: 1, weekStart: 0, count: 10 })
    expect(parseRrule('FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20271231T225959Z')).toMatchObject({
      freq: 'MONTHLY',
      nthWeekday: { n: -1, weekday: 4 },
      until: '20271231T225959Z',
    })
    expect(parseRrule('FREQ=MONTHLY;BYDAY=TU;BYSETPOS=2')).toMatchObject({ nthWeekday: { n: 2, weekday: 1 } })
    expect(parseRrule('FREQ=MONTHLY;BYMONTHDAY=-1')).toMatchObject({ monthDay: -1 })
    expect(parseRrule('FREQ=YEARLY;BYMONTH=11;BYDAY=4TH')).toMatchObject({ month: 11, nthWeekday: { n: 4, weekday: 3 } })
  })

  it.each([
    'FREQ=HOURLY',
    'FREQ=WEEKLY;BYHOUR=9,15',
    'FREQ=MONTHLY;BYMONTHDAY=1,15',
    'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
    'FREQ=WEEKLY;BYDAY=1MO',
    'FREQ=YEARLY;BYDAY=20MO',
    'FREQ=DAILY;INTERVAL=0',
    'FREQ=DAILY;UNTIL=domani',
    'BYDAY=MO',
  ])('%s → non gestita', (rule) => {
    expect(parseRrule(rule)).toBeNull()
  })
})

describe('parseIcs – serie ricorrenti già iniziate (today)', () => {
  const wrap = (...body: string[]) => crlf(['BEGIN:VCALENDAR', 'VERSION:2.0', ...body, 'END:VCALENDAR'])
  const series = (uid: string, start: string, rrule: string, ...extra: string[]) => [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART;TZID=Europe/Rome:${start}`,
    `DTEND;TZID=Europe/Rome:${start.slice(0, 9)}${String(Number(start.slice(9, 11)) + 1).padStart(2, '0')}${start.slice(11)}`,
    `RRULE:${rrule}`,
    `SUMMARY:Serie ${uid}`,
    ...extra,
    'END:VEVENT',
  ]
  // oggi: venerdì 2 ottobre 2026
  const TODAY = '2026-10-02'
  const one = (...body: string[]) => {
    const result = parseIcs(wrap(...body), { today: TODAY })
    return { ...result, event: result.events[0] }
  }

  it('settimanale: la prossima occorrenza da oggi, stesso orario, con avviso', () => {
    // lunedì 7 settembre 2026 alle 9, ogni lunedì → lunedì 5 ottobre
    const { event, warnings } = one(...series('w', '20260907T090000', 'FREQ=WEEKLY;BYDAY=MO'))
    expect(event).toMatchObject({ date: '2026-10-05', start: '09:00', end: '10:00', recurring: true })
    expect(event.occurrence).toBe('2026-10-05')
    expect(warnings).toEqual([
      "1 serie ricorrente iniziata in passato: viene importata solo la prossima occorrenza, non l'intera serie.",
    ])
  })

  it("un'occorrenza oggi conta (anche se l'orario è passato)", () => {
    expect(one(...series('d', '20260101T080000', 'FREQ=DAILY')).event.date).toBe(TODAY)
  })

  it('settimanale con più giorni, INTERVAL e WKST', () => {
    // ogni 2 settimane lun/gio dal 7 settembre: settimane del 7/9, 21/9, 5/10 → giovedì 24/9 passato, lunedì 5/10
    expect(one(...series('w2', '20260907T090000', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;WKST=SU')).event.date).toBe(
      '2026-10-05',
    )
    // ogni lun-ven: venerdì 2 ottobre (oggi)
    expect(one(...series('wd', '20250106T083000', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).event.date).toBe(TODAY)
  })

  it('giornaliera con INTERVAL', () => {
    // ogni 3 giorni dal 1° settembre: 1, 4, …, 28 set, 1 ott, 4 ott
    expect(one(...series('d3', '20260901T100000', 'FREQ=DAILY;INTERVAL=3')).event.date).toBe('2026-10-04')
  })

  it('mensile: stesso giorno, ultimo venerdì, giorni che non esistono saltati', () => {
    expect(one(...series('m', '20260115T110000', 'FREQ=MONTHLY')).event.date).toBe('2026-10-15')
    expect(one(...series('mf', '20260130T110000', 'FREQ=MONTHLY;BYDAY=-1FR')).event.date).toBe('2026-10-30')
    expect(one(...series('m2', '20260106T110000', 'FREQ=MONTHLY;BYDAY=TU;BYSETPOS=1')).event.date).toBe('2026-10-06')
    // il 31: ottobre ha 31 giorni
    expect(one(...series('m31', '20260131T110000', 'FREQ=MONTHLY')).event.date).toBe('2026-10-31')
    // il 31 ogni 2 mesi da luglio: settembre non ha il 31 → novembre non ha il 31 → gennaio
    expect(one(...series('m31b', '20260731T110000', 'FREQ=MONTHLY;INTERVAL=2')).event.date).toBe('2027-01-31')
  })

  it('annuale: anniversario e 29 febbraio solo negli anni bisestili', () => {
    expect(one(...series('y', '20200315T100000', 'FREQ=YEARLY')).event.date).toBe('2027-03-15')
    expect(one(...series('leap', '20240229T100000', 'FREQ=YEARLY')).event.date).toBe('2028-02-29')
  })

  it('COUNT, UNTIL e serie finite: resta la prima occorrenza (passata), senza spostarla', () => {
    // 4 lunedì dal 7 settembre: l'ultimo è il 28 settembre
    const ended = one(...series('c', '20260907T090000', 'FREQ=WEEKLY;COUNT=4'))
    expect(ended.event).toMatchObject({ date: '2026-09-07', recurring: true })
    expect(ended.event.occurrence).toBeUndefined()
    expect(ended.warnings).toEqual(['1 evento ricorrente: viene importata solo la prima occorrenza.'])
    // 5 lunedì: il 5 ottobre è il quinto
    expect(one(...series('c5', '20260907T090000', 'FREQ=WEEKLY;COUNT=5')).event.date).toBe('2026-10-05')
    // UNTIL in UTC: lunedì 5 ottobre alle 9 di Roma = 07:00Z
    expect(one(...series('u1', '20260907T090000', 'FREQ=WEEKLY;UNTIL=20261005T070000Z')).event.date).toBe(
      '2026-10-05',
    )
    expect(one(...series('u2', '20260907T090000', 'FREQ=WEEKLY;UNTIL=20261005T065959Z')).event.date).toBe(
      '2026-09-07',
    )
    expect(one(...series('u3', '20260907T090000', 'FREQ=WEEKLY;UNTIL=20261005')).event.date).toBe('2026-10-05')
  })

  it('EXDATE (anche su più righe) salta le occorrenze annullate', () => {
    const { event } = one(
      ...series(
        'x',
        '20260907T090000',
        'FREQ=WEEKLY',
        'EXDATE;TZID=Europe/Rome:20261005T090000',
        'EXDATE;TZID=Europe/Rome:20261012T090000,20261019T090000',
      ),
    )
    expect(event.date).toBe('2026-10-26')
  })

  it("un'occorrenza spostata (RECURRENCE-ID) prende il posto di quella prevista", () => {
    const { events, warnings } = parseIcs(
      wrap(
        ...series('mv', '20260907T090000', 'FREQ=WEEKLY'),
        'BEGIN:VEVENT',
        'UID:mv',
        'RECURRENCE-ID;TZID=Europe/Rome:20261005T090000',
        'DTSTART;TZID=Europe/Rome:20261006T150000',
        'DTEND;TZID=Europe/Rome:20261006T153000',
        'SUMMARY:Serie mv (spostata)',
        'END:VEVENT',
      ),
      { today: TODAY },
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ date: '2026-10-06', start: '15:00', end: '15:30', summary: 'Serie mv (spostata)' })
    // identità dell'occorrenza: la data prevista, non quella effettiva
    expect(events[0].occurrence).toBe('2026-10-05')
    expect(warnings.some((w) => w.includes('singola occorrenza'))).toBe(false)
  })

  it("un'occorrenza annullata a parte (STATUS:CANCELLED) viene saltata", () => {
    const { events } = parseIcs(
      wrap(
        ...series('cc', '20260907T090000', 'FREQ=WEEKLY'),
        'BEGIN:VEVENT',
        'UID:cc',
        'RECURRENCE-ID;TZID=Europe/Rome:20261005T090000',
        'DTSTART;TZID=Europe/Rome:20261005T090000',
        'STATUS:CANCELLED',
        'END:VEVENT',
      ),
      { today: TODAY },
    )
    expect(events[0].date).toBe('2026-10-12')
  })

  it("le serie in UTC seguono l'ora di Roma (cambio dell'ora legale)", () => {
    // ogni lunedì alle 08:00Z dal 7 settembre (10:00 di Roma in estate); oggi 30 ottobre → lunedì 2 novembre, 09:00
    const { events } = parseIcs(
      wrap(
        'BEGIN:VEVENT',
        'UID:utc',
        'DTSTART:20260907T080000Z',
        'DTEND:20260907T090000Z',
        'RRULE:FREQ=WEEKLY',
        'END:VEVENT',
      ),
      { today: '2026-10-30' },
    )
    expect(events[0]).toMatchObject({ date: '2026-11-02', start: '09:00', end: '10:00' })
  })

  it('eventi "tutto il giorno" ricorrenti', () => {
    const { events } = parseIcs(
      wrap(
        'BEGIN:VEVENT',
        'UID:bday',
        'DTSTART;VALUE=DATE:19800310',
        'DTEND;VALUE=DATE:19800311',
        'RRULE:FREQ=YEARLY',
        'SUMMARY:Compleanno',
        'END:VEVENT',
      ),
      { today: TODAY },
    )
    expect(events[0]).toMatchObject({ date: '2027-03-10', start: '00:00', end: '23:59', allDay: true })
  })

  it('regola non gestita: resta la prima occorrenza, segnalata', () => {
    const { event, warnings } = one(...series('h', '20260907T090000', 'FREQ=MONTHLY;BYMONTHDAY=1,15'))
    expect(event).toMatchObject({ date: '2026-09-07', recurrenceUnsupported: true })
    expect(warnings).toEqual([
      '1 serie ricorrente con una ripetizione non gestita: si può importare solo la prima occorrenza, già passata.',
    ])
  })

  it('serie che inizia da oggi in poi: invariata', () => {
    const { event, warnings } = one(...series('f', '20261005T090000', 'FREQ=WEEKLY'))
    expect(event.date).toBe('2026-10-05')
    expect(event.occurrence).toBeUndefined()
    expect(warnings).toEqual(['1 evento ricorrente: viene importata solo la prima occorrenza.'])
  })

  it("l'identificativo distingue le occorrenze: un import successivo aggiunge, non sposta", () => {
    const body = series('id', '20260907T090000', 'FREQ=WEEKLY')
    const now = icsEventsToAppointments(parseIcs(wrap(...body), { today: TODAY }).events, [])[0]
    const later = icsEventsToAppointments(parseIcs(wrap(...body), { today: '2026-10-09' }).events, [])[0]
    const first = icsEventsToAppointments(parseIcs(wrap(...body)).events, [])[0]
    expect(now.externalId).toBe('id#2026-10-05')
    expect(later.externalId).toBe('id#2026-10-12')
    expect(first.externalId).toBe('id')
  })
})
