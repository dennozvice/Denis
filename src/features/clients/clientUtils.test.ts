import { describe, expect, it } from 'vitest'
import type { Client, Deadline } from '../../domain/types'
import { clientsToRecontact } from '../../store/selectors'
import {
  checkAmount,
  complianceLabel,
  complianceState,
  deadlineShortLabel,
  deadlineTone,
  formatAmountInput,
  iddDueDate,
  isFourDigits,
  isPlausiblePhone,
  isValidEmail,
  lastContactInfo,
  maskPolicyRef,
  matchesClientSearch,
  nearestDeadlineByClient,
  parseTags,
  policyRefDigits,
  policyTotals,
  premiumTypeOf,
  sensitiveDataHint,
  sortClients,
} from './clientUtils'

const client = (patch: Partial<Client> & Pick<Client, 'id' | 'lastName'>): Client => ({
  firstName: 'Nome',
  policies: [],
  ...patch,
})

const TODAY = '2026-10-02'

describe('matchesClientSearch', () => {
  const c = client({
    id: 'c1',
    firstName: 'Niccolò',
    lastName: 'Ferrà',
    city: 'Cinisello Balsamo',
    phone: '+39 333 123 4567',
    tags: ['prospect', 'Segnalata da M. Rossi'],
  })

  it('ignora maiuscole e accenti', () => {
    expect(matchesClientSearch(c, 'niccolo')).toBe(true)
    expect(matchesClientSearch(c, 'FERRA')).toBe(true)
  })

  it('cerca su città ed etichette, con tutte le parole', () => {
    expect(matchesClientSearch(c, 'cinisello prospect')).toBe(true)
    expect(matchesClientSearch(c, 'cinisello milano')).toBe(false)
    expect(matchesClientSearch(c, 'segnalata')).toBe(true)
  })

  it('cerca sul telefono anche senza spazi', () => {
    expect(matchesClientSearch(c, '1234567')).toBe(true)
    expect(matchesClientSearch(c, '333 123')).toBe(true)
    expect(matchesClientSearch(c, '999')).toBe(false)
  })

  it('una ricerca vuota trova tutti', () => {
    expect(matchesClientSearch(c, '   ')).toBe(true)
  })
})

describe('sortClients', () => {
  const a = client({ id: 'a', lastName: 'Bianchi', lastContact: '2026-09-01' })
  const b = client({ id: 'b', lastName: 'Amato' })
  const c = client({ id: 'c', lastName: 'Conti', lastContact: '2025-01-01' })
  const dl = (clientId: string, date: string): Deadline => ({
    id: `d-${clientId}`,
    kind: 'documento',
    date,
    daysLeft: 0,
    clientId,
    title: '',
    severity: 'prossima',
  })

  it('per cognome', () => {
    expect(sortClients([a, b, c], 'cognome', new Map()).map((x) => x.id)).toEqual(['b', 'a', 'c'])
  })

  it('per ultimo contatto: mai contattati per primi, poi i più vecchi', () => {
    expect(sortClients([a, b, c], 'contatto', new Map()).map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })

  it('per prossima scadenza: chi non ne ha va in fondo', () => {
    const nearest = new Map([
      ['a', dl('a', '2026-12-01')],
      ['c', dl('c', '2026-09-01')],
    ])
    expect(sortClients([a, b, c], 'scadenza', nearest).map((x) => x.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('scadenze per cliente', () => {
  it('prende la prima scadenza di ogni cliente', () => {
    const list: Deadline[] = [
      { id: '1', kind: 'documento', date: '2026-09-28', daysLeft: -4, clientId: 'x', title: '', severity: 'scaduta' },
      { id: '2', kind: 'antiriciclaggio', date: '2026-10-05', daysLeft: 3, clientId: 'x', title: '', severity: 'urgente' },
      { id: '3', kind: 'pratica', date: '2026-10-12', daysLeft: 10, title: '', severity: 'prossima' },
    ]
    const map = nearestDeadlineByClient(list)
    expect(map.get('x')?.id).toBe('1')
    expect(map.size).toBe(1)
  })

  it('etichette per esteso e concordate', () => {
    expect(deadlineShortLabel({ kind: 'documento', daysLeft: -4 })).toBe('Documento scaduto')
    expect(deadlineShortLabel({ kind: 'antiriciclaggio', daysLeft: 25 })).toBe('Adeguata verifica tra 25 gg')
    expect(deadlineShortLabel({ kind: 'antiriciclaggio', daysLeft: -1 })).toBe('Adeguata verifica scaduta')
    expect(deadlineShortLabel({ kind: 'scadenza_polizza', daysLeft: 0 })).toBe('Polizza scade oggi')
    expect(deadlineShortLabel({ kind: 'adeguatezza', daysLeft: 1 })).toBe('Questionario adeguatezza domani')
    expect(deadlineShortLabel({ kind: 'adeguatezza', daysLeft: -3 })).toBe('Questionario adeguatezza scaduto')
  })

  it('toni', () => {
    expect(deadlineTone({ daysLeft: -1 })).toBe('negative')
    expect(deadlineTone({ daysLeft: 30 })).toBe('warning')
    expect(deadlineTone({ daysLeft: 31 })).toBe('neutral')
  })
})

describe('adempimenti', () => {
  it('stato in base alla scadenza', () => {
    expect(complianceState(undefined, TODAY).status).toBe('non_registrato')
    expect(complianceState('2026-10-01', TODAY)).toEqual({ status: 'scaduto', due: '2026-10-01', daysLeft: -1 })
    expect(complianceState('2026-10-02', TODAY).status).toBe('in_scadenza')
    expect(complianceState('2026-11-01', TODAY).status).toBe('in_scadenza')
    expect(complianceState('2026-11-02', TODAY).status).toBe('valido')
  })

  it('etichette al maschile e al femminile', () => {
    expect(complianceLabel('scaduto')).toBe('Scaduto')
    expect(complianceLabel('scaduto', true)).toBe('Scaduta')
    expect(complianceLabel('non_registrato', true)).toBe('Non registrata')
    expect(complianceLabel('in_scadenza', true)).toBe('In scadenza')
  })

  it('scadenza del questionario con la validità impostata', () => {
    expect(iddDueDate({ iddQuestionnaireDate: '2024-02-29' }, 24)).toBe('2026-02-28')
    expect(iddDueDate({}, 24)).toBeUndefined()
  })
})

describe('ultimo contatto', () => {
  const policies = [{ id: 'p1', kind: 'risparmio' as const, ref: '••••1234', startDate: '2020-01-15' }]
  const withPolicy = (lastContact?: string) => client({ id: 'c', lastName: 'Rossi', lastContact, policies })
  const prospect = (lastContact?: string) => client({ id: 'p', lastName: 'Bianchi', lastContact })

  it('etichette e soglia', () => {
    expect(lastContactInfo(withPolicy(), TODAY, 180)).toEqual({ stale: true, label: 'Mai contattato' })
    expect(lastContactInfo(withPolicy(TODAY), TODAY, 180).label).toBe('oggi')
    expect(lastContactInfo(withPolicy('2026-10-01'), TODAY, 180).label).toBe('ieri')
    expect(lastContactInfo(withPolicy('2026-09-20'), TODAY, 180)).toEqual({ days: 12, stale: false, label: '12 gg fa' })
    expect(lastContactInfo(withPolicy('2026-04-05'), TODAY, 180).stale).toBe(false) // 180 gg: ancora entro la soglia
    expect(lastContactInfo(withPolicy('2026-04-04'), TODAY, 180).stale).toBe(true) // 181 gg
    expect(lastContactInfo(withPolicy('2025-08-28'), TODAY, 180).stale).toBe(true)
  })

  it('i prospect (senza polizze) non vanno segnalati da ricontattare, come nel widget della home', () => {
    expect(lastContactInfo(prospect(), TODAY, 180)).toEqual({ stale: false, label: 'Mai contattato' })
    expect(lastContactInfo(prospect('2025-08-28'), TODAY, 180)).toMatchObject({ stale: false, label: '400 gg fa' })
  })

  it("le righe segnalate coincidono con il conteggio dell'elenco (clientsToRecontact)", () => {
    const all = [
      withPolicy(),
      withPolicy(TODAY),
      withPolicy('2026-04-05'),
      withPolicy('2026-04-04'),
      withPolicy('2027-01-01'), // data futura (errore di battitura)
      prospect(),
      prospect('2025-01-01'),
    ].map((c, i) => ({ ...c, id: `c${i}` }))
    for (const afterDays of [0, 30, 180]) {
      const flagged = all.filter((c) => lastContactInfo(c, TODAY, afterDays).stale).map((c) => c.id)
      const listed = clientsToRecontact(all, TODAY, afterDays).map((x) => x.client.id)
      expect(flagged.sort()).toEqual(listed.sort())
    }
  })
})

describe('polizze', () => {
  it('mascheramento del riferimento', () => {
    expect(maskPolicyRef('4821')).toBe('••••4821')
    expect(policyRefDigits('••••4821')).toBe('4821')
    expect(policyRefDigits('POL-0012345678')).toBe('5678')
    expect(isFourDigits('4821')).toBe(true)
    expect(isFourDigits('482')).toBe(false)
    expect(isFourDigits('48a1')).toBe(false)
  })

  it('totali di premi e PAC: i premi unici e i versamenti non sono premi annui', () => {
    expect(
      policyTotals([
        { id: '1', kind: 'pip', ref: '', startDate: TODAY, annualPremium: 2400, pac: { amount: 200, dayOfMonth: 5 } },
        { id: '2', kind: 'tcm', ref: '', startDate: TODAY, annualPremium: 300, premiumType: 'annuo' },
        { id: '3', kind: 'unit_linked', ref: '', startDate: TODAY, pac: { amount: 150, dayOfMonth: 1 } },
        { id: '4', kind: 'multiramo', ref: '', startDate: TODAY, annualPremium: 50000, premiumType: 'unico' },
        { id: '5', kind: 'altro', ref: '', startDate: TODAY, annualPremium: 1200, premiumType: 'ricorrente' },
      ]),
    ).toEqual({ annualPremium: 2700, singlePremium: 50000, recurringPayments: 1200, monthlyPac: 350, withPac: 2 })
  })

  it('tipo di premio: annuo se assente o non riconosciuto', () => {
    expect(premiumTypeOf({})).toBe('annuo')
    expect(premiumTypeOf({ premiumType: 'unico' })).toBe('unico')
    expect(premiumTypeOf({ premiumType: 'mensile' as never })).toBe('annuo')
  })
})

describe('importi del form', () => {
  it('legge gli importi scritti all\'italiana', () => {
    expect(checkAmount('3.000')).toEqual({ value: 3000 })
    expect(checkAmount('1.200,50')).toEqual({ value: 1200.5 })
    expect(checkAmount('1200,5')).toEqual({ value: 1200.5 })
    expect(checkAmount('150')).toEqual({ value: 150 })
    expect(checkAmount('€ 2.400')).toEqual({ value: 2400 })
    expect(checkAmount(' 1 200 ')).toEqual({ value: 1200 })
    expect(checkAmount('1.000.000')).toEqual({ value: 1_000_000 })
  })

  it('accetta anche il punto decimale', () => {
    expect(checkAmount('1200.50')).toEqual({ value: 1200.5 })
    expect(checkAmount('99.9')).toEqual({ value: 99.9 })
    expect(checkAmount('1,200.50')).toEqual({ value: 1200.5 })
  })

  it('arrotonda al centesimo', () => {
    expect(checkAmount('10,456')).toEqual({ value: 10.46 })
    expect(checkAmount('0,1')).toEqual({ value: 0.1 })
  })

  it('campo vuoto: nessun importo e nessun errore', () => {
    expect(checkAmount('')).toEqual({})
    expect(checkAmount('   ')).toEqual({})
  })

  it('errori: testo, formato ambiguo, negativi, zero dove serve un importo, valori assurdi', () => {
    expect(checkAmount('tremila').error).toMatch(/non valido/)
    expect(checkAmount('1.23,5').error).toMatch(/non valido/)
    expect(checkAmount('12a').error).toMatch(/non valido/)
    expect(checkAmount('-50').error).toMatch(/negativo/)
    expect(checkAmount('−50').error).toMatch(/negativo/)
    expect(checkAmount('0')).toEqual({ value: 0 })
    expect(checkAmount('0', { positive: true }).error).toMatch(/maggiore di zero/)
    expect(checkAmount('0,00', { positive: true }).error).toMatch(/maggiore di zero/)
    expect(checkAmount('2.000.000.000').error).toMatch(/troppo alto/)
  })

  it('importo salvato mostrato in formato italiano, e riletto uguale', () => {
    expect(formatAmountInput(undefined)).toBe('')
    expect(formatAmountInput(3000)).toBe('3.000')
    expect(formatAmountInput(1200.5)).toBe('1.200,50')
    expect(formatAmountInput(150)).toBe('150')
    expect(formatAmountInput(0)).toBe('0')
    for (const n of [0, 7.5, 150, 3000, 1200.5, 1234567.89]) {
      expect(checkAmount(formatAmountInput(n)).value).toBe(n)
    }
  })
})

describe('validazioni del form', () => {
  it('etichette separate da virgola, senza doppioni', () => {
    expect(parseTags(' prospect,  Cliente  storico, Prospect ,, ')).toEqual(['prospect', 'Cliente storico'])
    expect(parseTags('')).toEqual([])
  })

  it('email e telefono', () => {
    expect(isValidEmail('mario.rossi@example.com')).toBe(true)
    expect(isValidEmail('mario@rossi')).toBe(false)
    expect(isValidEmail('mario rossi@example.com')).toBe(false)
    expect(isPlausiblePhone('+39 333 123 4567')).toBe(true)
    expect(isPlausiblePhone('02-34')).toBe(false)
    expect(isPlausiblePhone('chiamare la sera')).toBe(false)
  })

  it('suggerimenti sui dati sensibili', () => {
    expect(sensitiveDataHint('')).toBeUndefined()
    expect(sensitiveDataHint('Due figli, lavora da 15 anni in banca')).toBeUndefined()
    expect(sensitiveDataHint('Richiamare al 3331234567 o +39 02 1234567')).toBeUndefined()
    expect(sensitiveDataHint('CF RSSMRA80A01F205X')).toMatch(/codice fiscale/)
    expect(sensitiveDataHint('Diagnosi recente, valutare')).toMatch(/sanitarie/)
    expect(sensitiveDataHint('Polizza n. 0012345678')).toMatch(/numero lungo/)
    expect(sensitiveDataHint('Polizza 123456789')).toMatch(/numero lungo/)
    expect(sensitiveDataHint('IBAN IT60 X054 2811 1010 0000 0123 456')).toMatch(/numero lungo/)
  })
})
