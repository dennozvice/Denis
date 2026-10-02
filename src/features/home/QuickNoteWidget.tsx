import { Check, Eraser } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/Toast'
import { saveAppData } from '../../data/persistence'
import { useActions, useAppData } from '../../store/StoreContext'
import './home.css'

/** Attesa dopo l'ultimo tasto prima di salvare le note nello stato dell'app. */
const SAVE_DELAY_MS = 400

/**
 * Blocco note della giornata, salvato automaticamente nel browser insieme agli altri dati.
 * Il testo vive in uno stato locale e arriva allo stato dell'app con un breve ritardo (e subito
 * quando si lascia il campo, si cambia pagina o si chiude la scheda): così ogni tasto aggiorna
 * solo questo widget e non ricalcola tutta la Panoramica.
 */
export function QuickNoteWidget() {
  const data = useAppData()
  const { quickNote } = data
  const { setQuickNote } = useActions()
  const toast = useToast()
  const id = useId()

  const [draft, setDraft] = useState(quickNote)
  // Ultimo valore dello stato dell'app già recepito: se cambia per altre vie (altra scheda,
  // "Annulla" del toast, ripristino di un backup) il nuovo testo sostituisce la bozza.
  const [synced, setSynced] = useState(quickNote)
  if (quickNote !== synced) {
    setSynced(quickNote)
    setDraft(quickNote)
  }

  // Bozza non ancora salvata e dati più recenti dell'app, letti dai gestori di uscita
  // (cambio pagina, scheda nascosta o chiusa).
  const pending = useRef<string | null>(null)
  const latestData = useRef(data)
  useEffect(() => {
    pending.current = draft === synced ? null : draft
  }, [draft, synced])
  useEffect(() => {
    latestData.current = data
  }, [data])

  // Salvataggio con debounce: ogni tasto riavvia l'attesa.
  useEffect(() => {
    if (draft === synced) return
    const timer = window.setTimeout(() => {
      setQuickNote(draft)
      setSynced(draft)
    }, SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [draft, synced, setQuickNote])

  // Scheda nascosta o chiusa: la bozza va subito nello stato dell'app e nel browser. Il salvataggio
  // dell'app su "pagehide" può essere già avvenuto (i gestori partono nell'ordine di registrazione,
  // e il widget si rimonta a ogni ritorno sulla Panoramica): per questo si scrive anche qui.
  // Smontaggio (cambio pagina): la bozza rimasta passa allo stato dell'app.
  useEffect(() => {
    const flushNow = () => {
      const value = pending.current
      if (value === null) return
      pending.current = null
      flushSync(() => {
        setQuickNote(value)
        setSynced(value)
      })
      saveAppData({ ...latestData.current, quickNote: value })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushNow()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flushNow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flushNow)
      const value = pending.current
      pending.current = null
      if (value !== null) setQuickNote(value)
    }
  }, [setQuickNote])

  /** Salva subito la bozza (uscita dal campo, "Svuota"). */
  const commit = (value: string) => {
    setDraft(value)
    if (value === synced) return
    setQuickNote(value)
    setSynced(value)
  }

  const clear = () => {
    const previous = draft
    commit('')
    toast({ message: 'Note svuotate', actionLabel: 'Annulla', onAction: () => setQuickNote(previous) })
  }

  return (
    <Card
      className="hm-note"
      title="Note rapide"
      actions={
        draft.trim() ? (
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
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
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
