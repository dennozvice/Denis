import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  onClose(): void
  children: ReactNode
  /** Bottoni in basso a destra. */
  footer?: ReactNode
  wide?: boolean
}

/**
 * Finestra modale basata su <dialog>: gestisce focus, tasto Esc e sfondo in modo nativo e accessibile.
 * Per i form: mettere il <form id="..."> nel body e nel footer un <button form="..." type="submit">.
 */
export function Modal({ open, title, onClose, children, footer, wide }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  // true solo se il clic è iniziato sullo sfondo: trascinare per selezionare testo
  // e rilasciare fuori dalla finestra non deve chiuderla (e perdere i dati del form)
  const pressedOnBackdrop = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal-wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onPointerDown={(e) => {
        pressedOnBackdrop.current = e.target === ref.current
      }}
      onClick={(e) => {
        // clic sullo sfondo (fuori dal contenuto) = chiudi
        if (e.target === ref.current && pressedOnBackdrop.current) onClose()
        pressedOnBackdrop.current = false
      }}
    >
      {open && (
        <div className="modal-inner">
          <header className="modal-header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn icon-btn-sm" onClick={onClose} aria-label="Chiudi">
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="modal-body">{children}</div>
          {footer && <footer className="modal-footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}
