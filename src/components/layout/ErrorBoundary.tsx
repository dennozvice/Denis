import { TriangleAlert } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { DATA_KEY, browserStorage } from '../../data/persistence'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Scarica i dati salvati così come sono, per non perdere nulla anche se l'app non riesce a leggerli. */
function downloadRawData() {
  const raw = browserStorage()?.getItem(DATA_KEY)
  if (!raw) return
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'advisor-desk-dati-grezzi.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Se una pagina va in errore (es. dati salvati non validi) mostra un messaggio con le vie d'uscita
 * invece di una schermata bianca. Il resto dell'app (menu, topbar) resta utilizzabile.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Errore nella pagina', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="page">
        <div className="card" role="alert">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <TriangleAlert size={22} aria-hidden="true" style={{ color: 'var(--warning)', flex: 'none' }} />
            <div className="stack">
              <h1>Questa pagina non riesce a mostrare i dati</h1>
              <p className="text-2">
                Probabilmente alcuni dati salvati nel browser non sono validi. Le altre sezioni dal menu potrebbero
                funzionare. Prima di tutto salva una copia dei dati, poi prova a ricaricare. Se il problema resta, da
                Impostazioni puoi importare un backup o ripristinare i dati dimostrativi.
              </p>
              <p className="xsmall muted">Dettaglio tecnico: {this.state.error.message}</p>
              <div className="row wrap">
                <button type="button" className="btn btn-primary" onClick={downloadRawData}>
                  Scarica una copia dei dati
                </button>
                <button type="button" className="btn" onClick={() => window.location.reload()}>
                  Ricarica la pagina
                </button>
                <a className="btn" href="#/impostazioni" onClick={() => this.setState({ error: null })}>
                  Vai a Impostazioni
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
