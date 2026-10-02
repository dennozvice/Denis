import { CalendarDays, ChartLine, MonitorDown, Sparkles, UserPlus, X } from 'lucide-react'
import { useId, useState } from 'react'
import { useToast } from '../../components/ui/Toast'
import { createDemoData } from '../../data/demoSeed'
import { buildHref } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useActions, useAppData } from '../../store/StoreContext'

const HIDDEN_KEY = 'advisor-desk:ui:welcome-hidden'

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Benvenuto al primo avvio (dashboard vuota): nome del consulente e primi passi.
 * Sparisce da solo appena ci sono clienti, attività o appuntamenti, oppure con "Nascondi".
 */
export function WelcomeCard({ onAddClient }: { onAddClient(): void }) {
  const data = useAppData()
  const { updateSettings, replaceData } = useActions()
  const now = useNow()
  const toast = useToast()
  const nameId = useId()
  const [hidden, setHidden] = useState(readHidden)

  const empty = data.clients.length === 0 && data.tasks.length === 0 && data.appointments.length === 0
  if (!empty || hidden) return null

  const hide = () => {
    setHidden(true)
    try {
      localStorage.setItem(HIDDEN_KEY, '1')
    } catch {
      /* ignora */
    }
  }

  const loadDemo = () => {
    if (!window.confirm('Caricare clienti, attività e appuntamenti di esempio per provare l’app?\n\nPotrai cancellarli quando vuoi da Impostazioni › Inizia da zero.')) return
    replaceData(createDemoData(now.date, data.settings))
    toast({ message: 'Dati dimostrativi caricati' })
  }

  return (
    <section className="card hm-welcome" aria-labelledby={`${nameId}-title`}>
      <header className="hm-welcome-head">
        <div>
          <h2 id={`${nameId}-title`}>
            <Sparkles size={18} aria-hidden="true" /> Benvenuto in {data.settings.brandName}
          </h2>
          <p className="text-2 small">La dashboard è vuota: inizia da qui. I dati che inserisci restano solo su questo dispositivo.</p>
        </div>
        <button type="button" className="icon-btn icon-btn-sm" onClick={hide} aria-label="Nascondi il benvenuto" title="Nascondi">
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <label className="field hm-welcome-name" htmlFor={nameId}>
        <span>Come ti chiami?</span>
        <input
          id={nameId}
          className="input"
          value={data.settings.advisorName}
          placeholder="Nome e cognome"
          autoComplete="name"
          onChange={(e) => updateSettings({ advisorName: e.target.value })}
        />
      </label>

      <ul className="hm-welcome-steps">
        <li>
          <button type="button" className="hm-welcome-step" onClick={onAddClient}>
            <UserPlus size={20} aria-hidden="true" />
            <span>
              <strong>Aggiungi il primo cliente</strong>
              <span className="xsmall muted">Anagrafica, scadenze, polizze</span>
            </span>
          </button>
        </li>
        <li>
          <a className="hm-welcome-step" href={buildHref('agenda')}>
            <CalendarDays size={20} aria-hidden="true" />
            <span>
              <strong>Importa la tua agenda</strong>
              <span className="xsmall muted">File .ics da Outlook o Google Calendar</span>
            </span>
          </a>
        </li>
        <li>
          <a className="hm-welcome-step" href={buildHref('fondi')}>
            <ChartLine size={20} aria-hidden="true" />
            <span>
              <strong>Importa i valori dei fondi</strong>
              <span className="xsmall muted">CSV con data e valore quota</span>
            </span>
          </a>
        </li>
        <li>
          <a className="hm-welcome-step" href={buildHref('impostazioni')}>
            <MonitorDown size={20} aria-hidden="true" />
            <span>
              <strong>Installa l&apos;app sul Mac</strong>
              <span className="xsmall muted">Icona nel Dock, funziona anche offline</span>
            </span>
          </a>
        </li>
      </ul>

      <p className="xsmall muted hm-welcome-foot">
        Vuoi prima vedere come funziona?{' '}
        <button type="button" className="btn-link" onClick={loadDemo}>
          Carica dati dimostrativi
        </button>
      </p>
    </section>
  )
}
