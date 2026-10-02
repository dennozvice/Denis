import type { ReactNode } from 'react'

interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  /** Elementi accanto al titolo (es. <DemoBadge />, contatori). */
  badge?: ReactNode
  /** Azioni a destra dell'intestazione (bottoni, link "Vedi tutto"). */
  actions?: ReactNode
  footer?: ReactNode
  children?: ReactNode
  className?: string
  id?: string
  /** Livello del titolo: h2 di default (le pagine hanno un h1). */
  headingLevel?: 2 | 3
}

/** Contenitore standard dei widget: titolo, sottotitolo, azioni, contenuto, footer. */
export function Card({ title, subtitle, badge, actions, footer, children, className, id, headingLevel = 2 }: CardProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  const headingId = id ? `${id}-title` : undefined
  return (
    <section className={`card${className ? ` ${className}` : ''}`} id={id} aria-labelledby={headingId}>
      {(title || actions) && (
        <header className="card-header">
          <div className="card-title">
            {title && (
              <Heading id={headingId}>
                {title}
                {badge}
              </Heading>
            )}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
      {footer && <footer className="card-footer">{footer}</footer>}
    </section>
  )
}
