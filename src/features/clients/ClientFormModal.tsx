import type { Client } from '../../domain/types'

export interface ClientFormModalProps {
  open: boolean
  onClose(): void
  /** Se presente: modifica di un cliente esistente. */
  client?: Client
  /** Chiamata dopo il salvataggio con il cliente creato/aggiornato. */
  onSaved?(client: Client): void
}

/** STUB — da implementare: form crea/modifica cliente (anagrafica, scadenze compliance, polizze). */
export function ClientFormModal(props: ClientFormModalProps) {
  void props
  return null
}
