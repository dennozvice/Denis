/** Mini-grafico di tendenza (senza assi). Il pallino finale è verde/rosso secondo l'andamento. */
export function Sparkline({
  values,
  width = 80,
  height = 24,
  label,
}: {
  values: number[]
  width?: number
  height?: number
  /** Testo per lettori di schermo, es. "Andamento 30 giorni: in crescita". */
  label?: string
}) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pad = 3
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2)
  const y = (v: number) => pad + (1 - (v - min) / range) * (height - pad * 2)
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const up = values[values.length - 1] >= values[0]
  const last = values.length - 1
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <path d={d} fill="none" stroke="var(--text-3)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r={2.5} fill={up ? 'var(--positive)' : 'var(--negative)'} />
    </svg>
  )
}
