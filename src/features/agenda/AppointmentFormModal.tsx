import type { Appointment } from '../../domain/types'
import type { NewAppointment } from '../../store/StoreContext'

export interface AppointmentFormModalProps {
  open: boolean
  onClose(): void
  /** Se presente: modifica di un appuntamento esistente. */
  appointment?: Appointment
  /** Valori iniziali per un nuovo appuntamento (es. date, start, clientId, type). */
  defaults?: Partial<NewAppointment>
}

/** STUB — da implementare: form crea/modifica appuntamento. */
export function AppointmentFormModal(props: AppointmentFormModalProps) {
  void props
  return null
}
