import { describe, expect, it } from 'vitest'
import type { Appointment, Client } from '../domain/types'
import {
  appointmentsToIcs,
  decodeIcsBytes,
  escapeText,
  eventExternalId,
  foldLine,
  guessAppointmentType,
  guessLocation,
  icsEventsToAppointments,
  matchClient,
  parseDuration,
  parseIcs,
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
    expect(unfoldLines('A:uno\r\n  due\r\nB:tre\n\tquattro\rC:cinque')).toEqual(['A:uno due', 'B:trequattro', 'C:cinque'])
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

  it('tratta i fusi Windows dell\'Europa centrale come ora di Roma', () => {
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

  it('converte gli orari UTC (Z) nell\'ora di Roma, con ora legale', () => {
    expect(byUid('g1@google.com')).toMatchObject({ date: '2026-10-05', start: '10:00', end: '11:00' })
  })

  it('gestisce il ritorno all\'ora solare del 25 ottobre 2026', () => {
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
      wrap('BEGIN:VEVENT', 'UID:d1', 'DTSTART;VALUE=DATE:20261005', 'DTEND;VALUE=DATE:20261006', 'SUMMARY:Ferie', 'END:VEVENT'),
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
    const { events } = parseIcs(wrap('BEGIN:VEVENT', 'UID:f', 'DTSTART:20261005T163000', 'SUMMARY:Senza fine', 'END:VEVENT'))
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

  it('fusi sconosciuti: orario così com\'è e avviso (una volta per fuso)', () => {
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
    expect(warnings).toEqual(['Fuso orario non riconosciuto ("Fuso Inventato"): gli orari sono stati importati così come sono.'])
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

  it('escapeText è l\'inverso di unescapeText', () => {
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
  it('usa la categoria se coincide con un tipo dell\'app', () => {
    expect(guessAppointmentType('Esito proposta PAC', ['Telefonata'])).toBe('call')
    expect(guessAppointmentType('Firma', ['Lavoro'])).toBe('firma_contratto')
  })
  it('legge CATEGORIES multiple dal file', () => {
    const { events } = parseIcs(
      crlf(['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:c', 'DTSTART:20261005T100000', 'CATEGORIES:Lavoro,Riunione di agenzia\\, sede', 'END:VEVENT', 'END:VCALENDAR']),
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
    expect(guessLocation('Sala riunioni agenzia', undefined)).toEqual({ mode: 'ufficio', detail: 'Sala riunioni agenzia' })
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
  const base: IcsEvent = { summary: '', date: '2026-10-05', start: '10:00', end: '11:00', allDay: false, recurring: false }

  it('produce appuntamenti con origine ics, tipo, luogo e cliente', () => {
    const [a] = icsEventsToAppointments(
      [{ ...base, uid: 'u1', summary: 'Revisione portafoglio Mario Rossi', location: 'Via dei Tigli 12, Milano', description: 'Note' }],
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
    appt({ id: 'a03', title: 'Esito proposta PAC', type: 'call', date: '2026-10-06', start: '14:30', end: '14:50', location: 'telefono', clientId: 'c01' }),
  ]
  const ics = appointmentsToIcs(appointments, CLIENTS, { now: NOW })
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
    // telefono senza dettaglio: si usa il numero del cliente
    expect(unfolded).toContain('LOCATION:+39 000 000 0101')
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
