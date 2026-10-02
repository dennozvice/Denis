/** Logica pura della sezione Fondi e mercati (selezione, variazioni, importazione): testabile senza React. */
import type { DateKey, Instrument, PerformancePeriod, PricePoint } from '../../domain/types'
import type { PriceRow } from '../../lib/csv'
import { dailyChange, lastPoint, periodChangeAbs, periodChangePct } from '../../lib/finance'

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
}

export const isGestioneSeparata = (i: Pick<Instrument, 'group'>) => i.group === 'gestione_separata'

/** true se per lo strumento un aumento è sfavorevole (spread, in punti base): colori invertiti. */
export const risingIsBad = (i: Pick<Instrument, 'unit'>) => i.unit === 'bp'

/**
 * Variazione di uno strumento nel periodo, nell'unità giusta:
 * fondi, indici e cambi in %; tassi in punti base (× 100); spread in punti base con colore invertito.
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
  if (unit === 'pct') return abs === undefined ? undefined : { value: abs * 100, kind: 'abs', decimals: 0, suffix: ' pb', invert: false }
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

/**
 * Nuovo elenco delle serie importate dopo un'importazione:
 * - strumenti esistenti → si copiano i metadati e i punti si uniscono alla serie già importata (se c'è);
 * - chiavi sconosciute → nuovo fondo "imp-<nome>" in EUR con 3 decimali e colore a rotazione.
 */
export function buildImports(groups: ImportGroup[], imports: Instrument[]): Instrument[] {
  const next = imports.map((i) => i)
  let newCount = imports.filter((i) => i.id.startsWith('imp-')).length
  for (const g of groups) {
    const idx = next.findIndex((i) => i.id === g.match.id)
    const prevImported = idx >= 0 ? next[idx] : undefined
    const meta = g.match.existing ?? prevImported
    let instrument: Instrument
    if (meta) {
      instrument = {
        id: g.match.id,
        name: meta.name,
        group: meta.group,
        category: meta.category,
        sri: meta.sri,
        unit: meta.unit,
        decimals: meta.decimals,
        colorIndex: meta.colorIndex,
        benchmarkId: meta.benchmarkId,
        description: meta.description,
        series: mergeSeries(prevImported?.series ?? [], g.points),
        source: 'import',
      }
    } else {
      instrument = {
        id: g.match.id,
        name: g.match.key.trim(),
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
