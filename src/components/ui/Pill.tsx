import type { ReactNode } from 'react'
import type { Tone } from '../../domain/labels'

/** Etichetta compatta colorata. Il significato non deve dipendere solo dal colore: usare sempre un testo. */
export function Pill({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className="pill" data-tone={tone} title={title}>
      {children}
    </span>
  )
}
