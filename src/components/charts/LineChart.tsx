import type { PricePoint } from '../../domain/types'

export interface LineSeries {
  id: string
  label: string
  /** Indice palette 1..8 → var(--series-N). */
  colorIndex: number
  points: PricePoint[]
  /** Linea tratteggiata (es. benchmark). */
  dashed?: boolean
}

export interface LineChartProps {
  series: LineSeries[]
  /** Formattazione dei valori su asse Y e tooltip. */
  formatValue(value: number): string
  /** Descrizione per lettori di schermo. */
  ariaLabel: string
  height?: number
}

/** STUB — da implementare: grafico a linee SVG con assi, griglia, tooltip e navigazione da tastiera. */
export function LineChart(props: LineChartProps) {
  void props
  return null
}
