import { ShieldCheck, X } from 'lucide-react'
import { buildHref } from '../../router/router'
import { useActions, useAppData } from '../../store/StoreContext'

/** Avviso privacy al primo avvio: i dati restano nel browser, attenzione ai dati personali reali. */
export function PrivacyNotice() {
  const { settings, isDemo } = useAppData()
  const { updateSettings } = useActions()
  if (settings.privacyNoticeDismissed) return null
  return (
    <div className="banner" data-tone="info" role="note">
      <ShieldCheck size={18} aria-hidden="true" />
      <div className="grow">
        <strong>I dati restano solo in questo browser.</strong> Nessuna informazione viene inviata a server esterni.
        {isDemo && ' Ora stai vedendo clienti e valori dimostrativi.'} Prima di inserire dati reali dei clienti verifica le
        regole aziendali sulla privacy (GDPR), non usare PC condivisi ed evita dati sensibili (salute, codici fiscali
        completi, numeri di polizza interi). Puoi esportare o cancellare tutto da{' '}
        <a href={buildHref('impostazioni')}>Impostazioni</a>.
      </div>
      <button
        type="button"
        className="icon-btn icon-btn-sm"
        aria-label="Ho capito, nascondi l'avviso"
        title="Ho capito"
        onClick={() => updateSettings({ privacyNoticeDismissed: true })}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
