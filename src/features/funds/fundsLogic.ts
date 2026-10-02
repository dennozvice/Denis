/** Logica pura della sezione Fondi e mercati (selezione, variazioni, importazione): testabile senza React. */
import type { DateKey, Instrument, PerformancePeriod, PricePoint } from '../../domain/types'
import type { PriceRow } from '../../lib/csv'
import { addDays, diffDays } from '../../lib/dates'
import { dailyChange, lastPoint, periodChangeAbs, periodChangePct, pointOnOrBefore } from '../../lib/finance'

// ---------------------------------------------------------------- selezione del grafico in home

export const FUNDS_SELECTION_KEY = 'advisor-desk:ui:funds-selection'
export const DEFAULT_FUNDS_SELECTION = ['f-bil-prud', 'f-az-glob']
export const MAX_CHART_FUNDS = 4

export function loadFundsSelection(): string[] | null {
  try {
    const raw = window.localStorage.getItem(FUNDS_SELECTION_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_CHART_FUNDS) : null
  } catch {
    return null
  }
}

export function saveFundsSelection(ids: string[]): void {
  try {
    window.localStorage.setItem(FUNDS_SELECTION_KEY, JSON.stringify(ids))
  } catch {
    /* archiviazione non disponibile: la scelta vale solo per questa sessione */
  }
}

/**
 * Fondi effettivamente mostrati: la scelta salvata ristretta ai fondi esistenti;
 * se vuota, la selezione predefinita; in mancanza, i primi due fondi.
 */
export function effectiveSelection(stored: string[] | null, chartable: Instrument[]): string[] {
  const ids = new Set(chartable.map((f) => f.id))
  if (stored) {
    const valid = stored.filter((id) => ids.has(id)).slice(0, MAX_CHART_FUNDS)
    if (valid.length > 0 || stored.length === 0) return valid
  }
  const defaults = DEFAULT_FUNDS_SELECTION.filter((id) => ids.has(id))
  return defaults.length > 0 ? defaults : chartable.slice(0, 2).map((f) => f.id)
}

// ---------------------------------------------------------------- variazioni

export type ChangePeriod = PerformancePeriod | '1G'

export interface ChangeInfo {
  value: number
  kind: 'pct' | 'abs'
  decimals: number
  suffix: string
  /** true se un aumento è negativo (spread). */
  invert: boolean
  /** true se la variazione non è né buona né cattiva (tassi): solo freccia e segno, nessun colore. */
  neutral?: boolean
}

export const isGestioneSeparata = (i: Pick<Instrument, 'group'>) => i.group === 'gestione_separata'

/** true se per lo strumento un aumento è sfavorevole (spread, in punti base): colori invertiti. */
export const risingIsBad = (i: Pick<Instrument, 'unit'>) => i.unit === 'bp'

/**
 * Variazione di uno strumento nel periodo, nell'unità giusta:
 * fondi, indici e cambi in %; tassi in punti base (× 100) senza colore (un rialzo dei tassi
 * non è di per sé né positivo né negativo); spread in punti base con colore invertito.
 * Per la gestione separata conta solo la differenza rispetto al rendimento dell'anno precedente (in punti percentuali).
 */
export function instrumentChange(instrument: Instrument, period: ChangePeriod): ChangeInfo | undefined {
  const { series, unit } = instrument
  if (isGestioneSeparata(instrument)) {
    if (period === '1G') return undefined
    const change = yearlyYieldChange(series)
    return change === undefined ? undefined : { value: change, kind: 'abs', decimals: 2, suffix: ' pp', invert: false }
  }
  let abs: number | undefined
  let pct: number | undefined
  if (period === '1G') {
    const d = dailyChange(series)
    abs = d?.abs
    pct = d?.pct
  } else if (unit === 'pct' || unit === 'bp') {
    abs = periodChangeAbs(series, period)
  } else {
    pct = periodChangePct(series, period)
  }
  if (unit === 'pct')
    return abs === undefined ? undefined : { value: abs * 100, kind: 'abs', decimals: 0, suffix: ' pb', invert: false, neutral: true }
  if (unit === 'bp') return abs === undefined ? undefined : { value: abs, kind: 'abs', decimals: 0, suffix: ' pb', invert: risingIsBad(instrument) }
  return pct === undefined ? undefined : { value: pct, kind: 'pct', decimals: 2, suffix: '', invert: false }
}

/** Differenza (punti percentuali) tra l'ultimo rendimento annuo e il precedente. */
export function yearlyYieldChange(series: PricePoint[]): number | undefined {
  if (series.length < 2) return undefined
  return series[series.length - 1].value - series[series.length - 2].value
}

/** Valore numerico della variazione, per ordinare le tabelle. */
export function changeSortValue(instrument: Instrument, period: ChangePeriod): number | undefined {
  return instrumentChange(instrument, period)?.value
}

export function lastValue(instrument: Instrument): number | undefined {
  return lastPoint(instrument.series)?.value
}

/**
 * Data dell'ultimo valore tra gli strumenti indicati ("Aggiornato al").
 * La gestione separata non conta: il suo rendimento è annuale, non un valore del giorno.
 */
export function latestDate(instruments: Instrument[]): DateKey | undefined {
  let latest: DateKey | undefined
  for (const i of instruments) {
    if (isGestioneSeparata(i)) continue
    const d = lastPoint(i.series)?.date
    if (d && (!latest || d > latest)) latest = d
  }
  return latest
}

// ---------------------------------------------------------------- frequenza dei dati e statistiche

/** Frequenza dei valori di una serie: i CSV importati possono essere settimanali o mensili. */
export type SamplingFrequency = 'giornaliera' | 'settimanale' | 'mensile'

/** Periodi in un anno, per annualizzare la volatilità. */
export const PERIODS_PER_YEAR: Record<SamplingFrequency, number> = { giornaliera: 252, settimanale: 52, mensile: 12 }

/** "dati settimanali": per le etichette delle statistiche. */
export const FREQUENCY_DATA_LABEL: Record<SamplingFrequency, string> = {
  giornaliera: 'dati giornalieri',
  settimanale: 'dati settimanali',
  mensile: 'dati mensili',
}

/** Punti considerati per riconoscere la frequenza: gli ultimi ~30 (i più rappresentativi dei dati attuali). */
const FREQUENCY_WINDOW = 30

/**
 * Frequenza della serie dalla mediana dei giorni di calendario tra gli ultimi ~30 punti:
 * fino a 3 giorni è giornaliera (il weekend dà 3), fino a 10 settimanale, oltre mensile.
 * Con meno di due punti si assume giornaliera.
 */
export function samplingFrequency(series: PricePoint[]): SamplingFrequency {
  const tail = series.slice(-(FREQUENCY_WINDOW + 1))
  if (tail.length < 2) return 'giornaliera'
  const gaps: number[] = []
  for (let i = 1; i < tail.length; i++) gaps.push(diffDays(tail[i - 1].date, tail[i].date))
  gaps.sort((a, b) => a - b)
  const mid = gaps.length >> 1
  const median = gaps.length % 2 === 1 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2
  if (median <= 3) return 'giornaliera'
  if (median <= 10) return 'settimanale'
  return 'mensile'
}

/**
 * Volatilità annualizzata (%) dei rendimenti logaritmici, con il fattore adatto alla frequenza dei dati
 * (252 giornaliera, 52 settimanale, 12 mensile). undefined con meno di 3 punti o valori non positivi.
 */
export function annualizedVolatilityByFrequency(
  series: PricePoint[],
): { value: number; frequency: SamplingFrequency } | undefined {
  if (series.length < 3 || series.some((p) => !(p.value > 0))) return undefined
  const frequency = samplingFrequency(series)
  const rets: number[] = []
  for (let i = 1; i < series.length; i++) rets.push(Math.log(series[i].value / series[i - 1].value))
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1)
  return { value: Math.sqrt(variance * PERIODS_PER_YEAR[frequency]) * 100, frequency }
}

/** Oltre questo distacco (giorni di calendario) l'ultima variazione non è "di un giorno": se ne indica la data di confronto. */
export const LAST_CHANGE_MAX_GAP_DAYS = 4

export interface LastChangeRef {
  /** Data del valore precedente, con cui si confronta l'ultimo. */
  previous: DateKey
  last: DateKey
  gapDays: number
  /** true se tra i due valori ci sono più di 4 giorni (dati settimanali, mensili o un buco nella serie). */
  wide: boolean
}

/** Date dei due valori confrontati dalla variazione "1g" (ultimo e precedente). */
export function lastChangeRef(series: PricePoint[]): LastChangeRef | undefined {
  if (series.length < 2) return undefined
  const previous = series[series.length - 2].date
  const last = series[series.length - 1].date
  const gapDays = diffDays(previous, last)
  return { previous, last, gapDays, wide: gapDays > LAST_CHANGE_MAX_GAP_DAYS }
}

/** true se per almeno uno strumento (esclusa la gestione separata) l'ultima variazione copre più di 4 giorni. */
export function hasWideLastChange(instruments: Instrument[]): boolean {
  return instruments.some((i) => !isGestioneSeparata(i) && lastChangeRef(i.series)?.wide === true)
}

/** Giorni di calendario della sparkline "Trend 30g". */
export const TREND_DAYS = 30

/**
 * Valori degli ultimi 30 giorni di calendario (fino all'ultimo dato) per la sparkline.
 * undefined se sono meno di 3 punti (es. dati mensili): una tendenza su 1-2 punti non dice nulla.
 */
export function trendValues(series: PricePoint[], days = TREND_DAYS): number[] | undefined {
  const last = lastPoint(series)
  if (!last) return undefined
  const from = addDays(last.date, -days)
  let start = series.length - 1
  while (start > 0 && series[start - 1].date >= from) start--
  const values = series.slice(start).map((p) => p.value)
  return values.length >= 3 ? values : undefined
}

/**
 * Ribasa più serie a 0% alla STESSA data: la più recente tra le date di inizio delle serie
 * (una serie con storia più corta sposta l'inizio per tutte). Il valore di base di ogni serie è
 * l'ultimo disponibile a quella data, riportato alla data comune: tutte le linee partono dallo stesso punto.
 */
export function rebaseAtCommonStart(slices: PricePoint[][]): { start?: DateKey; series: PricePoint[][] } {
  let start: DateKey | undefined
  for (const s of slices) if (s.length > 0 && (!start || s[0].date > start)) start = s[0].date
  if (!start) return { series: slices.map(() => []) }
  const common = start
  const series = slices.map((s) => {
    const base = pointOnOrBefore(s, common)
    if (!base || base.value === 0) return []
    const rest = s.filter((p) => p.date > common).map((p) => ({ date: p.date, value: (p.value / base.value - 1) * 100 }))
    return [{ date: common, value: 0 }, ...rest]
  })
  return { start, series }
}

// ---------------------------------------------------------------- fondi dimostrativi

export const SHOW_DEMO_FUNDS_KEY = 'advisor-desk:ui:show-demo-funds'

/** Preferenza "Mostra fondi dimostrativi": attiva salvo scelta contraria salvata. */
export function loadShowDemoFunds(): boolean {
  try {
    return window.localStorage.getItem(SHOW_DEMO_FUNDS_KEY) !== 'false'
  } catch {
    return true
  }
}

export function saveShowDemoFunds(show: boolean): void {
  try {
    window.localStorage.setItem(SHOW_DEMO_FUNDS_KEY, show ? 'true' : 'false')
  } catch {
    /* archiviazione non disponibile: la scelta vale solo per questa sessione */
  }
}

export const isFundGroup = (i: Pick<Instrument, 'group'>) => i.group === 'fondo' || i.group === 'gestione_separata'

/** true per i fondi (e la gestione separata) con valori dimostrativi. */
export const isDemoFund = (i: Pick<Instrument, 'group' | 'source'>) => isFundGroup(i) && i.source === 'demo'

/**
 * Strumento importato sopra uno dimostrativo: rischio (SRI) e descrizione erano inventati e non si mostrano.
 * Le serie importate non hanno una fonte per questi dati: se ci sono, vengono dallo strumento dimostrativo
 * (copiati da import precedenti o ereditati quando la serie importata si sovrappone a quella demo).
 */
export function withoutDemoMeta(instrument: Instrument): Instrument {
  if (instrument.source !== 'import' || (instrument.sri === undefined && instrument.description === undefined)) return instrument
  const clean = { ...instrument }
  delete clean.sri
  delete clean.description
  return clean
}

// ---------------------------------------------------------------- importazione CSV

/** "Fondo Pensione Linea A" → "fondo-pensione-linea-a". */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'serie'
}

const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

export interface KeyMatch {
  /** Chiave così come scritta nel file. */
  key: string
  /** ID dello strumento di destinazione. */
  id: string
  /** Strumento esistente (dimostrativo o già importato), se c'è. */
  existing?: Instrument
}

/**
 * Associa una chiave del file a uno strumento: per ID esatto (anche senza distinzione di maiuscole),
 * per ID di un fondo già importato ("imp-" + nome), oppure per nome. Altrimenti è un fondo nuovo.
 */
export function matchKey(key: string, instruments: Instrument[]): KeyMatch {
  const trimmed = key.trim()
  const lower = trimmed.toLowerCase()
  const byId = instruments.find((i) => i.id === trimmed) ?? instruments.find((i) => i.id.toLowerCase() === lower)
  if (byId) return { key, id: byId.id, existing: byId }
  const importedId = `imp-${slugify(trimmed)}`
  const byImportedId = instruments.find((i) => i.id === importedId)
  if (byImportedId) return { key, id: importedId, existing: byImportedId }
  const name = normalizeName(trimmed)
  const byName = instruments.find((i) => normalizeName(i.name) === name)
  if (byName) return { key, id: byName.id, existing: byName }
  return { key, id: importedId }
}

export interface ImportGroup {
  match: KeyMatch
  points: PricePoint[]
  first: DateKey
  last: DateKey
  lastValue: number
}

/** Raggruppa le righe del CSV per strumento di destinazione (più chiavi possono puntare allo stesso). */
export function groupImportRows(rows: PriceRow[], instruments: Instrument[]): ImportGroup[] {
  const groups = new Map<string, { match: KeyMatch; points: Map<DateKey, number> }>()
  for (const row of rows) {
    const match = matchKey(row.key, instruments)
    let g = groups.get(match.id)
    if (!g) {
      g = { match, points: new Map() }
      groups.set(match.id, g)
    }
    g.points.set(row.date, row.value)
  }
  return [...groups.values()].map(({ match, points }) => {
    const sorted = [...points.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([date, value]) => ({ date, value }))
    const lastPt = sorted[sorted.length - 1]
    return { match, points: sorted, first: sorted[0].date, last: lastPt.date, lastValue: lastPt.value }
  })
}

/** Unisce due serie: a parità di data vince `incoming`. Risultato ordinato per data. */
export function mergeSeries(existing: PricePoint[], incoming: PricePoint[]): PricePoint[] {
  const map = new Map<DateKey, number>()
  for (const p of existing) map.set(p.date, p.value)
  for (const p of incoming) map.set(p.date, p.value)
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, value]) => ({ date, value }))
}

/** true se l'importazione sostituisce i valori di uno strumento dimostrativo (non ancora importato). */
export const replacesDemo = (g: ImportGroup) => g.match.existing?.source === 'demo'

/**
 * Nuovo elenco delle serie importate dopo un'importazione:
 * - strumenti esistenti → si copiano nome, categoria, unità e colore e i punti si uniscono alla serie già
 *   importata (se c'è). Rischio (SRI) e descrizione NON si copiano: per un fondo dimostrativo sono inventati;
 * - chiavi sconosciute → nuovo fondo "imp-<nome>" in EUR con 3 decimali e colore a rotazione.
 * `names` (ID → nome) rinomina gli strumenti, es. il fondo dimostrativo sostituito con i valori del fondo reale.
 */
export function buildImports(groups: ImportGroup[], imports: Instrument[], names: Record<string, string> = {}): Instrument[] {
  const next = imports.map((i) => i)
  let newCount = imports.filter((i) => i.id.startsWith('imp-')).length
  for (const g of groups) {
    const idx = next.findIndex((i) => i.id === g.match.id)
    const prevImported = idx >= 0 ? next[idx] : undefined
    const meta = g.match.existing ?? prevImported
    const rename = names[g.match.id]?.trim()
    let instrument: Instrument
    if (meta) {
      instrument = {
        id: g.match.id,
        name: rename || meta.name,
        group: meta.group,
        category: meta.category,
        unit: meta.unit,
        decimals: meta.decimals,
        colorIndex: meta.colorIndex,
        benchmarkId: meta.benchmarkId,
        series: mergeSeries(prevImported?.series ?? [], g.points),
        source: 'import',
      }
    } else {
      instrument = {
        id: g.match.id,
        name: rename || g.match.key.trim(),
        group: 'fondo',
        unit: 'EUR',
        decimals: 3,
        colorIndex: (newCount % 8) + 1,
        series: g.points,
        source: 'import',
      }
      newCount++
    }
    if (idx >= 0) next[idx] = instrument
    else next.push(instrument)
  }
  return next
}

/** Serie importata rimossa, con la sua posizione nell'elenco (per poterla rimettere al suo posto). */
export interface RemovedImport {
  item: Instrument
  index: number
}

/** Toglie le serie con gli ID indicati; restituisce anche quelle effettivamente tolte. */
export function removeImports(current: Instrument[], ids: string[]): { next: Instrument[]; removed: RemovedImport[] } {
  const drop = new Set(ids)
  const removed: RemovedImport[] = []
  const next = current.filter((item, index) => {
    if (!drop.has(item.id)) return true
    removed.push({ item, index })
    return false
  })
  return { next, removed }
}

/**
 * Annulla una rimozione partendo dall'elenco più recente: rimette le serie tolte nella posizione originale,
 * senza toccare quelle importate nel frattempo (anche in un'altra scheda). Se una serie con lo stesso ID
 * è stata reimportata dopo la rimozione, vince quella più recente.
 */
export function restoreImports(current: Instrument[], removed: RemovedImport[]): Instrument[] {
  const next = [...current]
  for (const { item, index } of [...removed].sort((a, b) => a.index - b.index)) {
    if (next.some((i) => i.id === item.id)) continue
    next.splice(Math.min(index, next.length), 0, item)
  }
  return next
}

/** Rapporto tra nuovo e vecchio valore molto lontano da 1: probabile errore di separatore decimale. */
export function looksOffScale(newValue: number, reference: number | undefined): boolean {
  if (reference === undefined || reference === 0 || newValue === 0) return false
  const ratio = Math.abs(newValue / reference)
  return ratio > 5 || ratio < 0.2
}

// ---------------------------------------------------------------- etichette degli assi

/** Decimali necessari per scrivere il passo tra le tacche (2,5 → 1; 0,25 → 2; 5 → 0). */
export function stepDecimals(step: number): number {
  for (let d = 0; d <= 4; d++) {
    const scaled = step * 10 ** d
    if (Math.abs(Math.round(scaled) - scaled) < 1e-6) return d
  }
  return 4
}
