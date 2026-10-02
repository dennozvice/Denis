/**
 * Dati di mercato DIMOSTRATIVI.
 *
 * Le serie sono generate in modo deterministico (stesso giorno → stessi valori) a partire
 * da un'epoca fissa, solo nei giorni lavorativi. Il valore alla data di ancoraggio è
 * calibrato su livelli plausibili, ma NON sono quotazioni reali.
 * I nomi dei fondi sono descrittivi e generici: non corrispondono a prodotti reali.
 */
import type { DateKey, Instrument, InstrumentGroup, InstrumentUnit, PricePoint } from '../../domain/types'
import { addDays, isWeekend } from '../../lib/dates'
import { gaussian, hashString, mulberry32 } from '../../lib/random'
import type { MarketDataProvider } from './provider'

const EPOCH: DateKey = '2022-01-03'
const ANCHOR: DateKey = '2026-10-01'

type Model =
  /** moto browniano geometrico: drift e volatilità annui (es. 0.06 = 6%) */
  | { kind: 'gbm'; drift: number; vol: number }
  /** random walk con ritorno verso la media, per tassi e spread (vol giornaliera assoluta) */
  | { kind: 'meanRevert'; mean: number; speed: number; dailyVol: number }

interface Spec {
  id: string
  name: string
  group: InstrumentGroup
  category?: string
  sri?: Instrument['sri']
  unit: InstrumentUnit
  decimals: number
  anchorValue: number
  model: Model
  colorIndex: number
  benchmarkId?: string
  description?: string
}

export const DEMO_SPECS: Spec[] = [
  {
    id: 'f-obb-breve',
    name: 'Obbligazionario Euro Breve Termine',
    group: 'fondo',
    category: 'Obbligazionario',
    sri: 2,
    unit: 'EUR',
    decimals: 3,
    anchorValue: 10.42,
    model: { kind: 'gbm', drift: 0.022, vol: 0.015 },
    colorIndex: 1,
    description: 'Titoli di Stato e obbligazioni societarie in euro a breve scadenza.',
  },
  {
    id: 'f-bil-prud',
    name: 'Bilanciato Prudente',
    group: 'fondo',
    category: 'Bilanciato',
    sri: 3,
    unit: 'EUR',
    decimals: 3,
    anchorValue: 11.87,
    model: { kind: 'gbm', drift: 0.038, vol: 0.05 },
    colorIndex: 2,
    description: 'Prevalenza obbligazionaria con una quota azionaria fino al 30%.',
  },
  {
    id: 'f-bil-dina',
    name: 'Bilanciato Dinamico',
    group: 'fondo',
    category: 'Bilanciato',
    sri: 4,
    unit: 'EUR',
    decimals: 3,
    anchorValue: 13.05,
    model: { kind: 'gbm', drift: 0.058, vol: 0.085 },
    colorIndex: 3,
    description: 'Componente azionaria tra il 40% e il 70%, gestione attiva.',
  },
  {
    id: 'f-flex',
    name: 'Flessibile Multi-asset',
    group: 'fondo',
    category: 'Flessibile',
    sri: 3,
    unit: 'EUR',
    decimals: 3,
    anchorValue: 10.96,
    model: { kind: 'gbm', drift: 0.035, vol: 0.06 },
    colorIndex: 4,
    description: 'Allocazione flessibile tra azioni, obbligazioni e liquidità.',
  },
  {
    id: 'f-az-eur',
    name: 'Azionario Europa',
    group: 'fondo',
    category: 'Azionario',
    sri: 5,
    unit: 'EUR',
    decimals: 3,
    anchorValue: 14.6,
    model: { kind: 'gbm', drift: 0.075, vol: 0.145 },
    colorIndex: 5,
    benchmarkId: 'idx-stoxx50',
    description: 'Azioni di società europee ad alta capitalizzazione.',
  },
  {
    id: 'f-az-glob',
    name: 'Azionario Globale',
    group: 'fondo',
    category: 'Azionario',
    sri: 5,
    unit: 'EUR',
    decimals: 3,
    anchorValue: 18.32,
    model: { kind: 'gbm', drift: 0.095, vol: 0.13 },
    colorIndex: 6,
    benchmarkId: 'idx-msci-world',
    description: 'Azioni internazionali diversificate per area geografica e settore.',
  },
  {
    id: 'idx-ftsemib',
    name: 'FTSE MIB',
    group: 'indice',
    unit: 'pt',
    decimals: 0,
    anchorValue: 43250,
    model: { kind: 'gbm', drift: 0.08, vol: 0.18 },
    colorIndex: 7,
  },
  {
    id: 'idx-stoxx50',
    name: 'Euro Stoxx 50',
    group: 'indice',
    unit: 'pt',
    decimals: 0,
    anchorValue: 5540,
    model: { kind: 'gbm', drift: 0.07, vol: 0.16 },
    colorIndex: 8,
  },
  {
    id: 'idx-msci-world',
    name: 'MSCI World',
    group: 'indice',
    unit: 'pt',
    decimals: 0,
    anchorValue: 4310,
    model: { kind: 'gbm', drift: 0.085, vol: 0.14 },
    colorIndex: 7,
  },
  {
    id: 'rate-btp10',
    name: 'BTP 10 anni',
    group: 'tasso',
    unit: 'pct',
    decimals: 2,
    anchorValue: 3.45,
    model: { kind: 'meanRevert', mean: 3.6, speed: 0.01, dailyVol: 0.035 },
    colorIndex: 1,
  },
  {
    id: 'spread-btp-bund',
    name: 'Spread BTP-Bund',
    group: 'spread',
    unit: 'bp',
    decimals: 0,
    anchorValue: 95,
    model: { kind: 'meanRevert', mean: 130, speed: 0.008, dailyVol: 2.2 },
    colorIndex: 2,
  },
  {
    id: 'rate-euribor3m',
    name: 'Euribor 3 mesi',
    group: 'tasso',
    unit: 'pct',
    decimals: 2,
    anchorValue: 2.05,
    model: { kind: 'meanRevert', mean: 2.4, speed: 0.006, dailyVol: 0.012 },
    colorIndex: 3,
  },
  {
    id: 'fx-eurusd',
    name: 'EUR/USD',
    group: 'cambio',
    unit: 'fx',
    decimals: 4,
    anchorValue: 1.172,
    model: { kind: 'gbm', drift: 0, vol: 0.07 },
    colorIndex: 4,
  },
]

/** Rendimenti annui certificati DIMOSTRATIVI della gestione separata (al 31/12 di ogni anno). */
const GESTIONE_SEPARATA_YIELDS: Record<number, number> = {
  2019: 2.85,
  2020: 2.6,
  2021: 2.35,
  2022: 2.3,
  2023: 2.7,
  2024: 2.95,
  2025: 3.1,
}

function businessDays(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) if (!isWeekend(d)) out.push(d)
  return out
}

function generatePath(spec: Spec, days: DateKey[]): number[] {
  const rand = mulberry32(hashString(spec.id))
  const values: number[] = []
  if (spec.model.kind === 'gbm') {
    const { drift, vol } = spec.model
    const dt = 1 / 252
    let v = 1
    for (let i = 0; i < days.length; i++) {
      if (i > 0) v *= Math.exp((drift - (vol * vol) / 2) * dt + vol * Math.sqrt(dt) * gaussian(rand))
      values.push(v)
    }
  } else {
    const { mean, speed, dailyVol } = spec.model
    let v = mean
    for (let i = 0; i < days.length; i++) {
      if (i > 0) v += speed * (mean - v) + dailyVol * gaussian(rand)
      values.push(v)
    }
  }
  return values
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

function buildInstrument(spec: Spec, asOf: DateKey): Instrument {
  const end = asOf > ANCHOR ? asOf : ANCHOR
  const days = businessDays(EPOCH, end)
  const path = generatePath(spec, days)
  let anchorIdx = days.length - 1
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i] <= ANCHOR) {
      anchorIdx = i
      break
    }
  }
  const series: PricePoint[] = []
  for (let i = 0; i < days.length && days[i] <= asOf; i++) {
    // GBM: si riscala; mean-revert: si trasla, così il livello all'ancoraggio è quello voluto
    const raw =
      spec.model.kind === 'gbm'
        ? (path[i] / path[anchorIdx]) * spec.anchorValue
        : path[i] - path[anchorIdx] + spec.anchorValue
    series.push({ date: days[i], value: round(Math.max(raw, spec.unit === 'EUR' ? 0.01 : -5), spec.decimals + 2) })
  }
  return {
    id: spec.id,
    name: spec.name,
    group: spec.group,
    category: spec.category,
    sri: spec.sri,
    unit: spec.unit,
    decimals: spec.decimals,
    series,
    source: 'demo',
    colorIndex: spec.colorIndex,
    benchmarkId: spec.benchmarkId,
    description: spec.description,
  }
}

function buildGestioneSeparata(asOf: DateKey): Instrument {
  const series: PricePoint[] = Object.entries(GESTIONE_SEPARATA_YIELDS)
    .map(([year, value]) => ({ date: `${year}-12-31`, value }))
    .filter((p) => p.date <= asOf)
  return {
    id: 'gs-rendimento',
    name: 'Gestione Separata',
    group: 'gestione_separata',
    category: 'Rendimento annuo certificato',
    sri: 1,
    unit: 'pct',
    decimals: 2,
    series,
    source: 'demo',
    colorIndex: 8,
    description:
      'Rendimento annuo certificato della gestione separata (valori dimostrativi). Non è un valore quota giornaliero.',
  }
}

const memo = new Map<DateKey, Instrument[]>()

/** Genera (e memorizza) tutti gli strumenti dimostrativi fino alla data `asOf`. */
export function buildDemoInstruments(asOf: DateKey): Instrument[] {
  let cached = memo.get(asOf)
  if (!cached) {
    cached = [...DEMO_SPECS.map((s) => buildInstrument(s, asOf)), buildGestioneSeparata(asOf)]
    memo.set(asOf, cached)
  }
  return cached
}

export const demoMarketProvider: MarketDataProvider = {
  id: 'demo',
  label: 'Dati dimostrativi',
  isDemo: true,
  getInstruments: (asOf) => Promise.resolve(buildDemoInstruments(asOf)),
}
