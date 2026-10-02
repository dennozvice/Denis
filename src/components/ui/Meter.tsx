/** Barra di avanzamento accessibile. `value` è una frazione (0…1, oltre 1 viene limitata). */
export function Meter({ value, label, tone }: { value: number; label: string; tone?: 'primary' | 'positive' | 'warning' }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div
      className="meter"
      data-tone={tone}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}
