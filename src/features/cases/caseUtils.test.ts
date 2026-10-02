import { describe, expect, it } from 'vitest'
import type { Case } from '../../domain/types'
import { caseDueDate } from '../../store/selectors'
import {
  caseAgeDays,
  caseAgeLabel,
  caseDueHint,
  caseDueTone,
  casesCountLabel,
  formatAmountInput,
  matchesCaseSearch,
  matchesStatusFilter,
  neighbourCaseId,
  parseAmount,
  sortCasesForList,
  sortOpenCases,
  statusChangeMessage,
  suggestCaseDueDate,
  suggestCaseTitle,
} from './caseUtils'

const base: Case = { id: 'k', type: 'riscatto', title: 'Pratica', openedOn: '2026-09-01', status: 'aperta' }
const mk = (patch: Partial<Case>): Case => ({ ...base, ...patch })

describe('caseDueDate (selettore condiviso)', () => {
  it('usa la scadenza indicata', () => {
    expect(caseDueDate(mk({ dueDate: '2026-10-10' }))).toBe('2026-10-10')
  })
  it('per i reclami senza scadenza calcola apertura + 45 giorni', () => {
    expect(caseDueDate(mk({ type: 'reclamo', openedOn: '2026-09-01' }))).toBe('2026-10-16')
  })
  it('nessuna scadenza per le altre pratiche', () => {
    expect(caseDueDate(mk({}))).toBeUndefined()
  })
})

describe('età della pratica', () => {
  it('conta i giorni dall’apertura e non va mai sotto zero', () => {
    expect(caseAgeDays(mk({ openedOn: '2026-09-26' }), '2026-10-02')).toBe(6)
    expect(caseAgeDays(mk({ openedOn: '2026-10-05' }), '2026-10-02')).toBe(0)
  })
  it('etichette', () => {
    expect(caseAgeLabel(0)).toBe('aperta oggi')
    expect(caseAgeLabel(1)).toBe('aperta ieri')
    expect(caseAgeLabel(12)).toBe('aperta da 12 gg')
  })
})

describe('ordinamento', () => {
  const cases: Case[] = [
    mk({ id: 'a', openedOn: '2026-09-20' }),
    mk({ id: 'b', openedOn: '2026-09-01', dueDate: '2026-11-01' }),
    mk({ id: 'c', openedOn: '2026-08-01', type: 'reclamo' }), // scadenza calcolata 2026-09-15
    mk({ id: 'd', openedOn: '2026-07-01' }),
    mk({ id: 'e', openedOn: '2026-09-25', status: 'chiusa' }),
    mk({ id: 'f', openedOn: '2026-06-01', status: 'chiusa' }),
  ]
  it('aperte: prima con scadenza (più vicina), poi le altre dalla più vecchia; esclude le chiuse', () => {
    expect(sortOpenCases(cases).map((c) => c.id)).toEqual(['c', 'b', 'd', 'a'])
  })
  it('elenco completo: aperte poi chiuse dalla più recente', () => {
    expect(sortCasesForList(cases).map((c) => c.id)).toEqual(['c', 'b', 'd', 'a', 'e', 'f'])
  })
})

describe('cambio di stato dall’elenco', () => {
  it('messaggio: dice se la pratica esce dal filtro', () => {
    expect(statusChangeMessage('Riscatto – Franco Neri', 'inviata_sede', 'aperte')).toBe('«Riscatto – Franco Neri»: stato «Inviata in sede»')
    expect(statusChangeMessage('Riscatto – Franco Neri', 'chiusa', 'aperte')).toBe(
      '«Riscatto – Franco Neri»: stato «Chiusa». Non compare più tra le pratiche aperte',
    )
    expect(statusChangeMessage('Sinistro', 'aperta', 'chiuse')).toBe('«Sinistro»: stato «Aperta». Non compare più tra le pratiche chiuse')
    expect(statusChangeMessage('Sinistro', 'chiusa', 'tutte')).toBe('«Sinistro»: stato «Chiusa»')
  })
  it('riga su cui spostare il focus: la successiva, altrimenti la precedente', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(neighbourCaseId(list, 'a')).toBe('b')
    expect(neighbourCaseId(list, 'b')).toBe('c')
    expect(neighbourCaseId(list, 'c')).toBe('b')
    expect(neighbourCaseId([{ id: 'a' }], 'a')).toBeUndefined()
    expect(neighbourCaseId(list, 'z')).toBeUndefined()
  })
  it('intestazione dell’elenco', () => {
    expect(casesCountLabel(1, 'aperte')).toBe('1 pratica aperta')
    expect(casesCountLabel(12, 'aperte')).toBe('12 pratiche aperte')
    expect(casesCountLabel(1, 'chiuse')).toBe('1 pratica chiusa')
    expect(casesCountLabel(3, 'chiuse')).toBe('3 pratiche chiuse')
    expect(casesCountLabel(17, 'tutte')).toBe('17 pratiche')
  })
})

describe('filtri e ricerca', () => {
  it('filtro per stato', () => {
    expect(matchesStatusFilter({ status: 'inviata_sede' }, 'aperte')).toBe(true)
    expect(matchesStatusFilter({ status: 'chiusa' }, 'aperte')).toBe(false)
    expect(matchesStatusFilter({ status: 'chiusa' }, 'chiuse')).toBe(true)
    expect(matchesStatusFilter({ status: 'aperta' }, 'tutte')).toBe(true)
  })
  it('cerca su titolo, tipo, note e cliente senza accenti', () => {
    const c = mk({ title: 'Riscatto parziale ••••2047', notes: 'Manca IBAN' })
    expect(matchesCaseSearch(c, 'neri', 'Franco Neri')).toBe(true)
    expect(matchesCaseSearch(c, 'iban parziale', '')).toBe(true)
    expect(matchesCaseSearch(mk({ type: 'liquidazione_scadenza' }), 'liquidazione', '')).toBe(true)
    expect(matchesCaseSearch(c, 'reclamo', '')).toBe(false)
    expect(matchesCaseSearch(c, '  ', '')).toBe(true)
    expect(matchesCaseSearch(mk({ type: 'anticipazione' }), 'pip', '')).toBe(true)
    expect(matchesCaseSearch(mk({ type: 'trasferimento' }), 'trasferimento', '')).toBe(true)
  })
})

describe('form', () => {
  it('titolo proposto da tipo e cliente', () => {
    expect(suggestCaseTitle('riscatto', 'Franco Neri')).toBe('Riscatto – Franco Neri')
    expect(suggestCaseTitle('reclamo', '')).toBe('Reclamo')
    expect(suggestCaseTitle('anticipazione', 'Franco Neri')).toBe('Anticipazione PIP – Franco Neri')
    expect(suggestCaseTitle('trasferimento', 'Franco Neri')).toBe('Trasferimento posizione – Franco Neri')
  })
  it('scadenza proposta: reclamo 45 gg sempre; riscatto, liquidazione e sinistro 30 gg solo se nuova', () => {
    expect(suggestCaseDueDate('reclamo', '2026-09-01', true)).toBe('2026-10-16')
    expect(suggestCaseDueDate('reclamo', '2026-09-01', false)).toBe('2026-10-16')
    expect(suggestCaseDueDate('riscatto', '2026-10-02', true)).toBe('2026-11-01')
    expect(suggestCaseDueDate('liquidazione_scadenza', '2026-10-02', true)).toBe('2026-11-01')
    expect(suggestCaseDueDate('sinistro', '2026-10-02', true)).toBe('2026-11-01')
    expect(suggestCaseDueDate('riscatto', '2026-10-02', false)).toBe('')
    expect(suggestCaseDueDate('switch', '2026-10-02', true)).toBe('')
    expect(suggestCaseDueDate('anticipazione', '2026-10-02', true)).toBe('')
    expect(suggestCaseDueDate('trasferimento', '2026-10-02', true)).toBe('')
    expect(suggestCaseDueDate('riscatto', '', true)).toBe('')
    expect(suggestCaseDueDate('reclamo', '2026-02-30', true)).toBe('')
  })
  it('nota sotto la scadenza', () => {
    expect(caseDueHint('reclamo')).toBe(
      "Termine di risposta: 45 giorni dalla ricezione del reclamo (risposta a cura della compagnia o dell'intermediario)",
    )
    expect(caseDueHint('sinistro')).toBe('Termine indicativo di pagamento: 30 giorni dalla ricezione della documentazione completa')
    expect(caseDueHint('riscatto')).toBe(caseDueHint('liquidazione_scadenza'))
    expect(caseDueHint('versamento_aggiuntivo')).toBeUndefined()
    expect(caseDueHint('anticipazione')).toBeUndefined()
  })
  it('importo scritto all’italiana', () => {
    expect(parseAmount('')).toBeUndefined()
    expect(parseAmount('  ')).toBeUndefined()
    expect(parseAmount('15000')).toBe(15000)
    expect(parseAmount('15.000')).toBe(15000)
    expect(parseAmount('1.250,50')).toBe(1250.5)
    expect(parseAmount('1250,5')).toBe(1250.5)
    expect(parseAmount('1250.5')).toBe(1250.5)
    expect(parseAmount('€ 640')).toBe(640)
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('-50')).toBeNull()
    expect(parseAmount('1,2,3')).toBeNull()
  })
  it('importo iniziale formattato e rileggibile', () => {
    expect(formatAmountInput(undefined)).toBe('')
    expect(formatAmountInput(15000)).toBe('15.000')
    expect(parseAmount(formatAmountInput(15000))).toBe(15000)
    expect(parseAmount(formatAmountInput(1250.5))).toBe(1250.5)
  })
})

describe('colore della scadenza', () => {
  it('reclami più severi', () => {
    expect(caseDueTone('reclamo', 5)).toBe('negative')
    expect(caseDueTone('reclamo', 20)).toBe('warning')
    expect(caseDueTone('riscatto', 5)).toBe('warning')
    expect(caseDueTone('riscatto', 20)).toBe('neutral')
    expect(caseDueTone('riscatto', -1)).toBe('negative')
  })
})
