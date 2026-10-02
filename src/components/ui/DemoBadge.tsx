import { FlaskConical } from 'lucide-react'

/** Badge obbligatorio su ogni widget che mostra dati simulati. */
export function DemoBadge({ label = 'Dati dimostrativi' }: { label?: string }) {
  return (
    <span className="pill" data-tone="warning" title="Valori simulati a scopo dimostrativo: non sono quotazioni reali">
      <FlaskConical size={12} aria-hidden="true" />
      {label}
    </span>
  )
}
