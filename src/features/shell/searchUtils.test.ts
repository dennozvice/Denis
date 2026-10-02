import { describe, expect, it } from 'vitest'
import { createDemoData } from '../../data/demoSeed'
import { buildDemoInstruments } from '../../data/market/demoMarket'
import { highlightRanges, matchesTokens, normalizeText, searchAll, titleScore, tokenize } from './searchUtils'

const TODAY = '2026-10-02'

describe('normalizzazione', () => {
  it('ignora maiuscole e accenti', () => {
    expect(normalizeText('Attività Città PERCHÉ')).toBe('attivita citta perche')
  })

  it('divide la ricerca in parole', () => {
    expect(tokenize('  Mario   ROSSÌ ')).toEqual(['mario', 'rossi'])
    expect(tokenize('   ')).toEqual([])
  })

  it('richiede che tutte le parole compaiano, in qualunque ordine', () => {
    expect(matchesTokens('Mario Rossi Milano', ['rossi', 'mar'])).toBe(true)
    expect(matchesTokens('Mario Rossi Milano', ['rossi', 'roma'])).toBe(false)
    expect(matchesTokens('Mario Rossi', [])).toBe(false)
  })
})

describe('evidenziazione', () => {
  it('restituisce gli intervalli del testo originale anche con accenti', () => {
    expect(highlightRanges('Attività in città', ['citta'])).toEqual([[12, 17]])
    expect(highlightRanges('Attività in città', ['attivita'])).toEqual([[0, 8]])
  })

  it('fonde gli intervalli sovrapposti o adiacenti', () => {
    expect(highlightRanges('Rossi', ['ros', 'ssi'])).toEqual([[0, 5]])
    expect(highlightRanges('ab ab', ['ab'])).toEqual([
      [0, 2],
      [3, 5],
    ])
  })

  it('gestisce testi già decomposti (NFD)', () => {
    const text = 'Città alta'
    expect(highlightRanges(text, ['alta'])).toEqual([[7, 11]])
  })
})

describe('ordinamento per pertinenza', () => {
  it('preferisce le parole che iniziano con la ricerca', () => {
    expect(titleScore('Mario Rossi', ['ros'])).toBe(2)
    expect(titleScore('Mario Rossi', ['ossi'])).toBe(1)
    expect(titleScore('Mario Rossi', ['milano'])).toBe(0)
    expect(titleScore('Mario Rossi', ['rossi', 'milano'])).toBeGreaterThan(titleScore('Sara Colombo', ['rossi', 'milano']))
  })
})

describe('ricerca globale', () => {
  const data = createDemoData(TODAY)
  const instruments = buildDemoInstruments(TODAY)

  it('con ricerca vuota non restituisce nulla', () => {
    expect(searchAll(data, instruments, '   ', TODAY)).toEqual([])
  })

  it('trova un cliente per nome e città, senza accenti', () => {
    const groups = searchAll(data, instruments, 'rossi milano', TODAY)
    const clients = groups.find((g) => g.id === 'clienti')
    expect(clients?.items[0]).toMatchObject({ title: 'Mario Rossi', href: '#/clienti?id=c01' })
    expect(clients?.items[0].detail).toContain('Milano')
  })

  it('collega attività, appuntamenti e pratiche al nome del cliente', () => {
    const groups = searchAll(data, instruments, 'rossi', TODAY)
    const ids = groups.map((g) => g.id)
    expect(ids).toContain('attivita')
    expect(ids).toContain('appuntamenti')
    const tasks = groups.find((g) => g.id === 'attivita')!
    expect(tasks.items[0].href).toBe('#/attivita?id=t01')
    const appts = groups.find((g) => g.id === 'appuntamenti')!
    expect(appts.items[0].href).toBe(`#/agenda?giorno=${TODAY}&vista=giorno`)
  })

  it('mostra prima gli appuntamenti futuri', () => {
    const groups = searchAll(data, instruments, 'revisione', TODAY)
    const appts = searchAll(data, instruments, 'revisione', TODAY, 50).find((g) => g.id === 'appuntamenti')!
    const days = appts.items.map((i) => new URLSearchParams(i.href.split('?')[1]).get('giorno')!)
    const upcoming = days.filter((d) => d >= TODAY)
    const past = days.filter((d) => d < TODAY)
    expect(past.length).toBeGreaterThan(0)
    expect(days).toEqual([...upcoming, ...past])
    expect(upcoming).toEqual([...upcoming].sort())
    expect(past).toEqual([...past].sort().reverse())
    expect(groups.find((g) => g.id === 'appuntamenti')!.items[0].href).toBe(`#/agenda?giorno=${TODAY}&vista=giorno`)
  })

  it('limita a 5 risultati per gruppo e riporta il totale', () => {
    const groups = searchAll(data, instruments, 'a', TODAY)
    for (const g of groups) {
      expect(g.items.length).toBeLessThanOrEqual(5)
      expect(g.total).toBeGreaterThanOrEqual(g.items.length)
    }
    expect(groups.find((g) => g.id === 'clienti')!.total).toBeGreaterThan(5)
  })

  it('trova fondi e indici con la categoria', () => {
    const groups = searchAll(data, instruments, 'azionario', TODAY)
    const funds = groups.find((g) => g.id === 'fondi')!
    expect(funds.items[0].title).toMatch(/^Azionario/)
    expect(funds.items[0].href).toMatch(/^#\/fondi\?id=/)
  })

  it('trova le pratiche e ne mostra lo stato', () => {
    const groups = searchAll(data, instruments, 'reclamo', TODAY)
    const cases = groups.find((g) => g.id === 'pratiche')!
    expect(cases.items[0]).toMatchObject({ href: '#/pratiche?id=k02' })
    expect(cases.items[0].detail).toContain('Aperta')
  })

  it('senza corrispondenze restituisce un elenco vuoto', () => {
    expect(searchAll(data, instruments, 'zzzxqw', TODAY)).toEqual([])
  })
})
