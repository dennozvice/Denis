import { Check, Eraser } from 'lucide-react'
import { useId } from 'react'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/Toast'
import { useActions, useAppData } from '../../store/StoreContext'
import './home.css'

/** Blocco note della giornata, salvato automaticamente nel browser insieme agli altri dati. */
export function QuickNoteWidget() {
  const { quickNote } = useAppData()
  const { setQuickNote } = useActions()
  const toast = useToast()
  const id = useId()

  const clear = () => {
    const previous = quickNote
    setQuickNote('')
    toast({ message: 'Note svuotate', actionLabel: 'Annulla', onAction: () => setQuickNote(previous) })
  }

  return (
    <Card
      className="hm-note"
      title="Note rapide"
      actions={
        quickNote.trim() ? (
          <button type="button" className="btn btn-sm btn-ghost hm-tap" onClick={clear}>
            <Eraser size={14} aria-hidden="true" />
            Svuota
          </button>
        ) : undefined
      }
    >
      <label htmlFor={`${id}-note`} className="visually-hidden">
        Note rapide
      </label>
      <textarea
        id={`${id}-note`}
        className="textarea hm-note-area"
        value={quickNote}
        onChange={(e) => setQuickNote(e.target.value)}
        placeholder="Appunti veloci della giornata…"
        aria-describedby={`${id}-hint`}
        rows={5}
        spellCheck
      />
      <p id={`${id}-hint`} className="field-hint hm-note-hint">
        <Check size={14} aria-hidden="true" />
        Salvate automaticamente in questo browser
      </p>
    </Card>
  )
}
