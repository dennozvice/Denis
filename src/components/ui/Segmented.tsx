interface SegmentedProps<T extends string> {
  options: { value: T; label: string; title?: string }[]
  value: T
  onChange(value: T): void
  ariaLabel: string
}

/** Selettore a segmenti (es. periodi 1M / 3M / 1A, viste Giorno / Settimana / Mese). */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
