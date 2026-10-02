import { useState } from 'react'
import type { Appointment } from '../../domain/types'
import type { NewAppointment } from '../../store/StoreContext'
import { AppointmentFormModal } from './AppointmentFormModal'

interface EditorState {
  appointment?: Appointment
  defaults?: Partial<NewAppointment>
  focusOutcome?: boolean
}

/** Stato della finestra crea/modifica appuntamento: restituisce le azioni e l'elemento da rendere. */
export function useAppointmentEditor() {
  const [editor, setEditor] = useState<EditorState | null>(null)
  const modal = (
    <AppointmentFormModal
      open={editor !== null}
      onClose={() => setEditor(null)}
      appointment={editor?.appointment}
      defaults={editor?.defaults}
      focusOutcome={editor?.focusOutcome}
    />
  )
  return {
    openNew: (defaults: Partial<NewAppointment>) => setEditor({ defaults }),
    openEdit: (appointment: Appointment, focusOutcome = false) => setEditor({ appointment, focusOutcome }),
    modal,
  }
}
