import { CircleCheck, MonitorDown } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/Toast'
import { isStandalone, useInstallPrompt } from '../../lib/pwa'

/**
 * Come installare la dashboard come app (Mac, Windows, iPhone, Android).
 * Su Chrome/Edge c'è un pulsante; su Safari si usano i menu del browser.
 */
export function InstallSection() {
  const install = useInstallPrompt()
  const toast = useToast()
  const installed = isStandalone()

  return (
    <Card id="sh-set-app" title="App sul computer e sul telefono" subtitle="Icona nel Dock o nella schermata Home, finestra propria, funziona anche senza internet.">
      {installed ? (
        <p className="row small">
          <CircleCheck size={16} aria-hidden="true" style={{ color: 'var(--positive)' }} />
          Stai già usando la dashboard come app installata.
        </p>
      ) : (
        install && (
          <div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                const ok = await install()
                if (ok) toast({ message: 'App installata: la trovi nel Dock e nel Launchpad' })
              }}
            >
              <MonitorDown size={16} aria-hidden="true" />
              Installa l&apos;app
            </button>
          </div>
        )
      )}
      <ul className="sh-set-bullets small">
        <li>
          <strong>Mac con Chrome:</strong> {install ? 'clicca «Installa l’app» qui sopra, oppure' : ''} clicca l&apos;icona di
          installazione a destra nella barra degli indirizzi (schermo con freccia) oppure menu ⋮ › Trasmetti, salva e
          condividi › <em>Installa pagina come app</em>.
        </li>
        <li>
          <strong>Mac con Safari:</strong> menu <em>File › Aggiungi al Dock</em>.
        </li>
        <li>
          <strong>iPhone e iPad:</strong> apri il sito con Safari, tocca <em>Condividi</em> › <em>Aggiungi alla schermata Home</em>.
        </li>
        <li>
          <strong>Android:</strong> con Chrome, menu ⋮ › <em>Installa app</em>.
        </li>
      </ul>
      <p className="field-hint">
        I dati restano separati per ogni dispositivo (e, su Safari, anche tra il browser e l&apos;app nel Dock): per
        spostarli usa <em>Esporta backup</em> e <em>Importa backup</em>. Gli aggiornamenti della dashboard arrivano da soli.
      </p>
    </Card>
  )
}
