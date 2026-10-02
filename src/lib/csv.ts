/**
 * Lettura di file CSV con valori quota / prezzi, tollerante ai formati "all'italiana"
 * (Excel italiano: separatore ";" e virgola decimale) e a quelli internazionali.
 *
 * Formati accettati (una riga per valore):
 *   id;data;valore            → es. "f-bil-prud;30/09/2026;11,82"
 *   data;valore               → solo con l'opzione `defaultKey` (file di un solo strumento)
 * Separatori di colonna: ";" (preferito), tabulazione o "," (se non è la virgola decimale).
 * La riga di intestazione è facoltativa e viene riconosciuta automaticamente.
 */
import type { DateKey } from '../domain/types'
import { isDateKey, toKey } from './dates'

// ---------------------------------------------------------------- numeri

export interface NumberParseOptions {
  /**
   * Separatore decimale da preferire nei casi ambigui: "1.234" (un solo punto seguito da 3 cifre)
   * e "1,234". Default ',' (convenzione italiana: "1.234" = milleduecentotrentaquattro).
   */
  decimal?: ',' | '.'
}

/**
 * Interpreta un numero scritto in formato italiano o internazionale.
 * "1.234,56" → 1234.56 · "1234,56" → 1234.56 · "1234.56" → 1234.56 · "1,234.56" → 1234.56
 * "-0,5" → -0.5 · "3,45%" → 3.45 · "€ 1.200" → 1200 · "" → undefined
 */
export function parseItalianNumber(input: string, options: NumberParseOptions = {}): number | undefined {
  const preferred = options.decimal ?? ','
  let s = input
    .trim()
    .replace(/^"(.*)"$/s, '$1')
    .replace(/[\s\u00a0\u202f€%']/g, '')
    .replace(/[\u2212\u2013]/g, '-')
  if (s === '') return undefined
  let sign = 1
  if (s.startsWith('-')) {
    sign = -1
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return undefined

  const commas = s.split(',').length - 1
  const dots = s.split('.').length - 1
  let decimal: ',' | '.' | null
  if (commas > 0 && dots > 0) {
    // entrambi presenti: il separatore decimale è l'ultimo
    decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.'
  } else if (commas > 0) {
    if (commas > 1) decimal = null // "1,234,567": migliaia
    else decimal = /^\d{1,3},\d{3}$/.test(s) ? (preferred === ',' ? ',' : null) : ','
  } else if (dots > 0) {
    if (dots > 1) decimal = null // "1.234.567": migliaia
    else decimal = /^\d{1,3}\.\d{3}$/.test(s) ? (preferred === '.' ? '.' : null) : '.'
  } else {
    decimal = null
  }

  const thousands = decimal === ',' ? '.' : decimal === '.' ? ',' : null
  let intPart = s
  let fracPart = ''
  if (decimal) {
    const idx = s.lastIndexOf(decimal)
    intPart = s.slice(0, idx)
    fracPart = s.slice(idx + 1)
    if (fracPart.includes(',') || fracPart.includes('.')) return undefined
  }
  if (thousands && intPart.includes(thousands)) {
    // i gruppi delle migliaia devono essere di 3 cifre: "1.23,5" non è un numero valido
    if (!/^\d{1,3}([.,]\d{3})+$/.test(intPart) || intPart.includes(decimal ?? '#')) return undefined
    intPart = intPart.split(thousands).join('')
  } else if (!decimal) {
    // solo separatori delle migliaia
    if (!/^\d{1,3}([.,]\d{3})+$/.test(intPart) && !/^\d+$/.test(intPart)) return undefined
    intPart = intPart.replace(/[.,]/g, '')
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart) || (intPart === '' && fracPart === '')) return undefined
  const n = Number(`${intPart || '0'}.${fracPart || '0'}`)
  return Number.isFinite(n) ? sign * n : undefined
}

// ---------------------------------------------------------------- date

/**
 * Interpreta una data in formato gg/mm/aaaa (anche g/m/aaaa, gg-mm-aaaa, gg.mm.aaaa, gg/mm/aa)
 * oppure aaaa-mm-gg. Un eventuale orario finale ("30/09/2026 17:30") viene ignorato.
 */
export function parseFlexibleDate(input: string): DateKey | undefined {
  const s = input
    .trim()
    .replace(/^"(.*)"$/s, '$1')
    .trim()
    .replace(/(?:[T ]\d{1,2}[:.]\d{2}.*)$/, '')
  let year: number
  let month: number
  let day: number
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s)
  if (m) {
    year = Number(m[1])
    month = Number(m[2])
    day = Number(m[3])
  } else {
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/.exec(s)
    if (!m) return undefined
    day = Number(m[1])
    month = Number(m[2])
    year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  }
  if (year < 1900 || year > 2200) return undefined
  const key = toKey(year, month, day)
  return isDateKey(key) ? key : undefined
}

// ---------------------------------------------------------------- CSV

export interface PriceRow {
  key: string
  date: DateKey
  value: number
}

export interface CsvError {
  /** Numero di riga nel file (da 1). */
  line: number
  message: string
}

/** Riga con data successiva a `maxDate`: quasi sempre un anno sbagliato. */
export interface FutureRow extends PriceRow {
  /** Numero di riga nel file (da 1). */
  line: number
}

export interface PriceCsvResult {
  rows: PriceRow[]
  /** Righe datate dopo `maxDate`: escluse da `rows`, da importare solo su conferma. */
  future: FutureRow[]
  errors: CsvError[]
  /** Separatore di colonna riconosciuto. */
  delimiter: ';' | '\t' | ','
  /** true se la prima riga è stata riconosciuta come intestazione e saltata. */
  hasHeader: boolean
}

export interface PriceCsvOptions {
  /** Strumento a cui attribuire le righe senza colonna id (file "data;valore"). */
  defaultKey?: string
  /** Ultima data ammessa (di solito oggi): le righe successive finiscono in `future`. */
  maxDate?: DateKey
}

type Delimiter = PriceCsvResult['delimiter']

/** Divide una riga CSV rispettando i campi tra virgolette doppie ("a;b" e "" come virgoletta). */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"' && field.trim() === '') {
      quoted = true
      field = ''
    } else if (ch === delimiter) {
      out.push(field.trim())
      field = ''
    } else {
      field += ch
    }
  }
  out.push(field.trim())
  return out
}

/** Conta le occorrenze di un carattere fuori dalle virgolette. */
function countOutsideQuotes(line: string, ch: string): number {
  let n = 0
  let quoted = false
  for (const c of line) {
    if (c === '"') quoted = !quoted
    else if (c === ch && !quoted) n++
  }
  return n
}

function detectDelimiter(lines: string[]): Delimiter {
  const sample = lines.slice(0, 10)
  const share = (ch: string) => sample.filter((l) => countOutsideQuotes(l, ch) > 0).length
  if (sample.length === 0) return ';'
  const semi = share(';')
  const tab = share('\t')
  if (semi > 0 && semi >= tab) return ';'
  if (tab > 0) return '\t'
  return ','
}

const KEY_HEADERS = ['id', 'codice', 'cod', 'strumento', 'fondo', 'nome', 'isin', 'ticker', 'key', 'chiave', 'linea']
const DATE_HEADERS = ['data', 'date', 'giorno', 'data valore', 'data quota', 'data nav', 'data riferimento']
const VALUE_HEADERS = [
  'valore',
  'valore quota',
  'quota',
  'nav',
  'prezzo',
  'price',
  'value',
  'close',
  'chiusura',
  'ultimo',
  'rendimento',
  'tasso',
]

const normalizeHeader = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function findHeader(fields: string[], names: string[]): number {
  const norm = fields.map(normalizeHeader)
  let idx = norm.findIndex((f) => names.includes(f))
  if (idx < 0) idx = norm.findIndex((f) => names.some((n) => f.startsWith(`${n} `) || f.endsWith(` ${n}`)))
  return idx
}

interface Layout {
  key: number
  date: number
  value: number
}

const looksNumeric = (s: string) => /^[-+\u2212]?[\d.,\s\u00a0€%]+$/.test(s) && /\d/.test(s)

/** Separatore decimale prevalente nei valori: decide i casi ambigui come "10.420". */
function detectDecimal(values: string[], delimiter: Delimiter): ',' | '.' {
  let comma = 0
  let dot = 0
  for (const raw of values) {
    const s = raw.replace(/[\s\u00a0€%"]/g, '')
    const c = s.lastIndexOf(',')
    const d = s.lastIndexOf('.')
    if (c >= 0 && d >= 0) {
      if (c > d) comma++
      else dot++
    } else if (c >= 0 && s.split(',').length === 2 && !/,\d{3}$/.test(s)) {
      comma++
    } else if (d >= 0 && s.split('.').length === 2 && !/\.\d{3}$/.test(s)) {
      dot++
    }
  }
  if (comma !== dot) return comma > dot ? ',' : '.'
  return delimiter === ',' ? '.' : ','
}

/**
 * Legge un CSV di valori (id;data;valore oppure data;valore con `defaultKey`).
 * Le righe con stesso strumento e stessa data sono unificate (vince l'ultima).
 * Le righe risultanti sono raggruppate per strumento (in ordine di apparizione) e ordinate per data.
 * Con `maxDate`, le righe datate dopo quel giorno vanno in `future` invece che in `rows`.
 */
export function parsePriceCsv(text: string, options: PriceCsvOptions = {}): PriceCsvResult {
  const defaultKey = options.defaultKey?.trim() || undefined
  const allLines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
  const numbered = allLines
    .map((content, i) => ({ content, line: i + 1 }))
    .filter((l) => l.content.trim() !== '' && !/^\s*#/.test(l.content))
  const delimiter = detectDelimiter(numbered.map((l) => l.content))
  const errors: CsvError[] = []

  // Riga di intestazione: nessuna data nelle prime due colonne e almeno una lettera.
  let layout: Layout | null = null
  let hasHeader = false
  let start = 0
  if (numbered.length > 0) {
    const first = splitCsvLine(numbered[0].content, delimiter)
    const dataLike = first.some(
      (f) => parseFlexibleDate(f) !== undefined || looksNumeric(f) || /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(f),
    )
    if (!dataLike && first.some((f) => /[a-zA-Z]/.test(f))) {
      hasHeader = true
      start = 1
      const date = findHeader(first, DATE_HEADERS)
      let value = findHeader(first, VALUE_HEADERS)
      let key = findHeader(first, KEY_HEADERS)
      if (date >= 0) {
        if (value < 0 || value === date) value = date + 1 < first.length ? date + 1 : -1
        if (key === date || key === value) key = -1
        // intestazione non riconosciuta per la colonna id: vale l'ordine standard id;data;valore
        if (key < 0 && date === 1 && value === 2) key = 0
        if (value >= 0) layout = { key, date, value }
      }
    }
  }

  // Prima passata: estrazione dei campi grezzi.
  const raw: { line: number; key: string; date: DateKey; value: string }[] = []
  for (const { content, line } of numbered.slice(start)) {
    const fields = splitCsvLine(content, delimiter)
    let keyField: string | undefined
    let dateField: string | undefined
    let rest: string[]
    if (layout) {
      keyField = layout.key >= 0 ? fields[layout.key] : undefined
      dateField = fields[layout.date]
      rest = fields.slice(layout.value).filter((f) => f !== '')
    } else if (parseFlexibleDate(fields[0] ?? '') !== undefined) {
      dateField = fields[0]
      rest = fields.slice(1).filter((f) => f !== '')
    } else if (fields.length >= 2 && parseFlexibleDate(fields[1]) !== undefined) {
      keyField = fields[0]
      dateField = fields[1]
      rest = fields.slice(2).filter((f) => f !== '')
    } else {
      const candidate = fields.length >= 3 ? fields[1] : fields[0]
      errors.push({
        line,
        message: candidate ? `Data non valida: «${candidate}» (formato atteso gg/mm/aaaa)` : 'Riga non riconosciuta',
      })
      continue
    }

    const date = parseFlexibleDate(dateField ?? '')
    if (!date) {
      errors.push({ line, message: `Data non valida: «${dateField ?? ''}» (formato atteso gg/mm/aaaa)` })
      continue
    }
    const key = (keyField ?? '').trim() || defaultKey
    if (!key) {
      errors.push({ line, message: 'Manca lo strumento: aggiungi la colonna id oppure scegli lo strumento' })
      continue
    }
    if (rest.length === 0) {
      errors.push({ line, message: 'Manca il valore' })
      continue
    }
    // Con il separatore "," una virgola decimale non tra virgolette spezza il numero in due campi.
    let value = rest[0]
    if (delimiter === ',' && rest.length === 2 && /^[-+]?\d+$/.test(rest[0]) && /^\d+%?$/.test(rest[1])) {
      value = `${rest[0]},${rest[1]}`
    }
    raw.push({ line, key, date, value })
  }

  // Seconda passata: numeri, con il separatore decimale prevalente nel file.
  const decimal = detectDecimal(
    raw.map((r) => r.value),
    delimiter,
  )
  const byKey = new Map<string, Map<DateKey, { value: number; line: number }>>()
  for (const r of raw) {
    const value = looksNumeric(r.value) ? parseItalianNumber(r.value, { decimal }) : undefined
    if (value === undefined) {
      errors.push({ line: r.line, message: `Valore non valido: «${r.value}»` })
      continue
    }
    let points = byKey.get(r.key)
    if (!points) {
      points = new Map()
      byKey.set(r.key, points)
    }
    points.delete(r.date) // l'ultima occorrenza vince
    points.set(r.date, { value, line: r.line })
  }

  const rows: PriceRow[] = []
  const future: FutureRow[] = []
  for (const [key, points] of byKey) {
    const sorted = [...points.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    for (const [date, { value, line }] of sorted) {
      if (options.maxDate && date > options.maxDate) future.push({ key, date, value, line })
      else rows.push({ key, date, value })
    }
  }
  errors.sort((a, b) => a.line - b.line)
  future.sort((a, b) => a.line - b.line)
  return { rows, future, errors, delimiter, hasHeader }
}
