import { formatPercent, formatSignedNumber } from '../../lib/format'

interface ChangeValueProps {
  /** Variazione: in punti percentuali se kind = 'pct', altrimenti valore assoluto. */
  value: number | undefined
  kind?: 'pct' | 'abs'
  decimals?: number
  /** Suffisso per le variazioni assolute, es. " pb" o " pt". */
  suffix?: string
  /** 'pill' = capsula colorata; 'text' = solo testo colorato. */
  variant?: 'pill' | 'text'
  /** Se true, un valore positivo è "negativo" (es. spread in aumento). Default false. */
  invert?: boolean
  /** Se true, nessun colore buono/cattivo (es. tassi: un aumento non è né positivo né negativo). */
  neutral?: boolean
}

/** Variazione con freccia ▲/▼, segno e colore (il significato non dipende solo dal colore). */
export function ChangeValue({ value, kind = 'pct', decimals = 2, suffix = '', variant = 'pill', invert = false, neutral = false }: ChangeValueProps) {
  if (value === undefined || Number.isNaN(value)) {
    return <span className="muted num" aria-label="Dato non disponibile">—</span>
  }
  const rounded = Number(value.toFixed(decimals))
  const direction = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat'
  const good = direction === 'flat' || neutral ? null : (direction === 'up') !== invert
  const tone = good === null ? 'neutral' : good ? 'positive' : 'negative'
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '■'
  const text = kind === 'pct' ? formatPercent(value, decimals, true) : `${formatSignedNumber(value, decimals)}${suffix}`
  if (variant === 'text') {
    return (
      <span className={`num ${tone === 'neutral' ? 'muted' : tone}`} style={{ whiteSpace: 'nowrap' }}>
        <span aria-hidden="true" style={{ fontSize: '0.75em', marginRight: 3 }}>
          {arrow}
        </span>
        {text}
      </span>
    )
  }
  return (
    <span className="pill" data-tone={tone}>
      <span aria-hidden="true" style={{ fontSize: '0.8em' }}>
        {arrow}
      </span>
      {text}
    </span>
  )
}
