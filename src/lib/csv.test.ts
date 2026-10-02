import { describe, expect, it } from 'vitest'
import { parseFlexibleDate, parseItalianNumber, parsePriceCsv, splitCsvLine } from './csv'

describe('parseItalianNumber', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['1234,56', 1234.56],
    ['1234.56', 1234.56],
    ['1,234.56', 1234.56],
    ['-0,5', -0.5],
    ['3,45%', 3.45],
    ['3,45 %', 3.45],
    ['+2,1', 2.1],
    ['−1,25', -1.25],
    ['€ 1.200', 1200],
    ['1.200 €', 1200],
    ['1 234,5', 1234.5],
    ['1 234,5', 1234.5],
    ['1.234.567,89', 1234567.89],
    ['1,234,567.89', 1234567.89],
    ['1.234.567', 1234567],
    ['1,234,567', 1234567],
    ['11,82', 11.82],
    ['11.820', 11820],
    ['0,001', 0.001],
    [',5', 0.5],
    ['42', 42],
    ['0', 0],
    ['"11,82"', 11.82],
    ['  7,5  ', 7.5],
  ])('%s → %d', (input, expected) => {
    expect(parseItalianNumber(input)).toBeCloseTo(expected, 10)
  })

  it.each(['', '   ', 'abc', '1,2,3,4x', '1.23.4', '1.2.3,4', '1,234.567,8', '-', '%', '12a', '1e5'])(
    '«%s» → undefined',
    (input) => {
      expect(parseItalianNumber(input)).toBeUndefined()
    },
  )

  it('usa il separatore preferito solo nei casi ambigui', () => {
    expect(parseItalianNumber('10.420')).toBe(10420)
    expect(parseItalianNumber('10.420', { decimal: '.' })).toBeCloseTo(10.42)
    expect(parseItalianNumber('1,234')).toBeCloseTo(1.234)
    expect(parseItalianNumber('1,234', { decimal: '.' })).toBe(1234)
    // non ambigui: il suggerimento non cambia il risultato
    expect(parseItalianNumber('10.42', { decimal: ',' })).toBeCloseTo(10.42)
    expect(parseItalianNumber('10,42', { decimal: '.' })).toBeCloseTo(10.42)
    expect(parseItalianNumber('1.234,5', { decimal: '.' })).toBeCloseTo(1234.5)
  })
})

describe('parseFlexibleDate', () => {
  it.each([
    ['30/09/2026', '2026-09-30'],
    ['1/2/2026', '2026-02-01'],
    ['01-02-2026', '2026-02-01'],
    ['01.02.2026', '2026-02-01'],
    ['2026-09-30', '2026-09-30'],
    ['2026/09/30', '2026-09-30'],
    ['30/09/26', '2026-09-30'],
    ['29/02/2024', '2024-02-29'],
    [' 30/09/2026 ', '2026-09-30'],
    ['"30/09/2026"', '2026-09-30'],
    ['30/09/2026 17:30', '2026-09-30'],
    ['2026-09-30T00:00:00Z', '2026-09-30'],
  ])('%s → %s', (input, expected) => {
    expect(parseFlexibleDate(input)).toBe(expected)
  })

  it.each(['', 'ieri', '31/02/2026', '29/02/2025', '00/01/2026', '12/13/2026', '2026-13-01', '30/09', '123/09/2026', '1/1/1800'])(
    '«%s» → undefined',
    (input) => {
      expect(parseFlexibleDate(input)).toBeUndefined()
    },
  )
})

describe('splitCsvLine', () => {
  it('gestisce virgolette, separatori e virgolette raddoppiate', () => {
    expect(splitCsvLine('a;"b;c";d', ';')).toEqual(['a', 'b;c', 'd'])
    expect(splitCsvLine('"Fondo ""Alfa""",1', ',')).toEqual(['Fondo "Alfa"', '1'])
    expect(splitCsvLine(' a ; b ;', ';')).toEqual(['a', 'b', ''])
    expect(splitCsvLine('x\ty', '\t')).toEqual(['x', 'y'])
  })
})

describe('parsePriceCsv', () => {
  it('legge il formato standard id;data;valore con intestazione', () => {
    const r = parsePriceCsv('id;data;valore\nf-bil-prud;30/09/2026;11,82\nf-bil-prud;29/09/2026;11,80\n')
    expect(r.errors).toEqual([])
    expect(r.hasHeader).toBe(true)
    expect(r.delimiter).toBe(';')
    expect(r.rows).toEqual([
      { key: 'f-bil-prud', date: '2026-09-29', value: 11.8 },
      { key: 'f-bil-prud', date: '2026-09-30', value: 11.82 },
    ])
  })

  it('funziona anche senza intestazione e con BOM e CRLF', () => {
    const r = parsePriceCsv('﻿f-a;01/09/2026;10,5\r\nf-b;01/09/2026;20,25\r\n')
    expect(r.hasHeader).toBe(false)
    expect(r.errors).toEqual([])
    expect(r.rows).toEqual([
      { key: 'f-a', date: '2026-09-01', value: 10.5 },
      { key: 'f-b', date: '2026-09-01', value: 20.25 },
    ])
  })

  it('riconosce tabulazione e virgola come separatori', () => {
    const tab = parsePriceCsv('f-a\t2026-09-01\t10.5\nf-a\t2026-09-02\t10.6')
    expect(tab.delimiter).toBe('\t')
    expect(tab.rows.map((r) => r.value)).toEqual([10.5, 10.6])

    const comma = parsePriceCsv('id,date,value\nf-a,2026-09-01,1234.5\nf-a,2026-09-02,"1,240.25"')
    expect(comma.delimiter).toBe(',')
    expect(comma.errors).toEqual([])
    expect(comma.rows.map((r) => r.value)).toEqual([1234.5, 1240.25])
  })

  it('con separatore virgola accetta la virgola decimale tra virgolette o "spezzata"', () => {
    const quoted = parsePriceCsv('f-a,30/09/2026,"11,82"')
    expect(quoted.rows).toEqual([{ key: 'f-a', date: '2026-09-30', value: 11.82 }])
    const split = parsePriceCsv('30/09/2026,11,82\n01/10/2026,11,9', { defaultKey: 'f-a' })
    expect(split.errors).toEqual([])
    expect(split.rows.map((r) => r.value)).toEqual([11.82, 11.9])
  })

  it('supporta i file a 2 colonne con defaultKey', () => {
    const r = parsePriceCsv('Data;Valore quota\n30/09/2026;11,82\n01/10/2026;11,87', { defaultKey: 'f-bil-prud' })
    expect(r.errors).toEqual([])
    expect(r.rows).toEqual([
      { key: 'f-bil-prud', date: '2026-09-30', value: 11.82 },
      { key: 'f-bil-prud', date: '2026-10-01', value: 11.87 },
    ])
  })

  it('senza defaultKey i file a 2 colonne danno un errore chiaro per riga', () => {
    const r = parsePriceCsv('30/09/2026;11,82\n01/10/2026;11,87')
    expect(r.rows).toEqual([])
    expect(r.errors).toHaveLength(2)
    expect(r.errors[0].line).toBe(1)
    expect(r.errors[0].message).toMatch(/strumento/)
  })

  it('una colonna id nel file prevale su defaultKey', () => {
    const r = parsePriceCsv('f-x;30/09/2026;1,5', { defaultKey: 'f-y' })
    expect(r.rows[0].key).toBe('f-x')
  })

  it('unifica stessa chiave e data: vince l’ultima', () => {
    const r = parsePriceCsv('f-a;30/09/2026;1\nf-a;29/09/2026;2\nf-a;30/09/2026;3')
    expect(r.rows).toEqual([
      { key: 'f-a', date: '2026-09-29', value: 2 },
      { key: 'f-a', date: '2026-09-30', value: 3 },
    ])
  })

  it('stessa data in formati diversi conta come duplicato', () => {
    const r = parsePriceCsv('f-a;30/09/2026;1\nf-a;2026-09-30;2')
    expect(r.rows).toEqual([{ key: 'f-a', date: '2026-09-30', value: 2 }])
  })

  it('raggruppa per strumento nell’ordine di apparizione e ordina per data', () => {
    const r = parsePriceCsv('b;02/01/2026;2\na;01/01/2026;1\nb;01/01/2026;3')
    expect(r.rows.map((x) => `${x.key}@${x.date}`)).toEqual(['b@2026-01-01', 'b@2026-01-02', 'a@2026-01-01'])
  })

  it('riporta gli errori con il numero di riga del file (righe vuote incluse)', () => {
    const r = parsePriceCsv('id;data;valore\n\nf-a;31/02/2026;1\nf-a;30/09/2026;abc\nf-a;30/09/2026\nf-a;01/10/2026;12,5')
    expect(r.rows).toEqual([{ key: 'f-a', date: '2026-10-01', value: 12.5 }])
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5])
    expect(r.errors[0].message).toMatch(/Data non valida/)
    expect(r.errors[1].message).toMatch(/Valore non valido/)
    expect(r.errors[2].message).toMatch(/Manca il valore/)
  })

  it('una prima riga di dati con data errata non viene scambiata per intestazione', () => {
    const r = parsePriceCsv('f-a;31/02/2026;11,8\nf-a;30/09/2026;11,9')
    expect(r.hasHeader).toBe(false)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].line).toBe(1)
  })

  it('usa le intestazioni per individuare le colonne in ordine diverso', () => {
    const r = parsePriceCsv('Data;Fondo;NAV;Variazione\n30/09/2026;f-a;11,82;0,1')
    expect(r.errors).toEqual([])
    expect(r.rows).toEqual([{ key: 'f-a', date: '2026-09-30', value: 11.82 }])
  })

  it('ignora colonne in più dopo il valore', () => {
    const r = parsePriceCsv('f-a;30/09/2026;11,82;+0,15%;nota')
    expect(r.rows).toEqual([{ key: 'f-a', date: '2026-09-30', value: 11.82 }])
  })

  it('decide il separatore decimale ambiguo dal resto del file', () => {
    // valori con 3 decimali e punto (export internazionale): "10.420" non sono 10.420 euro
    const dot = parsePriceCsv('f-a;30/09/2026;10.420\nf-a;01/10/2026;10.43')
    expect(dot.rows.map((r) => r.value)).toEqual([10.42, 10.43])
    // file italiano: "43.250" con altre righe a virgola decimale = migliaia
    const it = parsePriceCsv('idx;30/09/2026;43.250\nidx;01/10/2026;43.180,5')
    expect(it.rows.map((r) => r.value)).toEqual([43250, 43180.5])
    // separatore "," → punto decimale
    const comma = parsePriceCsv('f-a,30/09/2026,10.420')
    expect(comma.rows[0].value).toBeCloseTo(10.42)
  })

  it('accetta nomi con spazi, virgolette e percentuali', () => {
    const r = parsePriceCsv('"Fondo Pensione; Linea A";30/09/2026;"3,10%"')
    expect(r.rows).toEqual([{ key: 'Fondo Pensione; Linea A', date: '2026-09-30', value: 3.1 }])
  })

  it('valori negativi (tassi) e righe di commento', () => {
    const r = parsePriceCsv('# esportato il 01/10/2026\nrate;30/09/2026;-0,35')
    expect(r.errors).toEqual([])
    expect(r.rows).toEqual([{ key: 'rate', date: '2026-09-30', value: -0.35 }])
  })

  it('testo vuoto → nessuna riga e nessun errore', () => {
    expect(parsePriceCsv('')).toMatchObject({ rows: [], errors: [] })
    expect(parsePriceCsv('\n \n')).toMatchObject({ rows: [], errors: [] })
  })

  it('solo intestazione → nessuna riga', () => {
    const r = parsePriceCsv('id;data;valore')
    expect(r.hasHeader).toBe(true)
    expect(r.rows).toEqual([])
    expect(r.errors).toEqual([])
  })
})
