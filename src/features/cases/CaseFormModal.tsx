import type { Case } from '../../domain/types'
import type { NewCase } from '../../store/StoreContext'

export interface CaseFormModalProps {
  open: boolean
  onClose(): void
  caseItem?: Case
  defaults?: Partial<NewCase>
}

/** STUB — da implementare: form crea/modifica pratica. */
export function CaseFormModal(props: CaseFormModalProps) {
  void props
  return null
}
