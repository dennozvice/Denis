import { TriangleAlert } from 'lucide-react'
import { browserStorage } from '../../data/persistence'
import { createDemoData } from '../../data/demoSeed'
import { buildHref } from '../../router/router'
import { useNow } from '../../store/NowContext'
import { useActions, useAppData, useRecovery } from '../../store/StoreContext'

/**
 * Avviso mostrato quando, all'avvio, i dati salvati nel browser non erano leggibili.
 * L'app è partita vuota; la copia originale è conservata e si può scaricare.
 */
export function RecoveryNotice() {
  const recovery = useRecovery()
  const { settings } = useAppData()
  const { replaceData } = useActions()
  const now = useNow()
  if (!recovery) return null

  const download = () => {
    const raw = browserStorage()?.getItem(recovery.backupKey)
    if (!raw) return
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'advisor-desk-dati-non-leggibili.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="banner" role="alert">
      <TriangleAlert size={18} aria-hidden="true" />
      <div className="grow stack" style={{ gap: 'var(--sp-2)' }}>
        <div>
          <strong>I dati salvati in questo browser non sono leggibili.</strong> Per sicurezza l'app è partita vuota e
          una copia intatta dei dati è stata conservata. Puoi scaricarla, importare un backup da Impostazioni oppure
          ricominciare con i dati dimostrativi.
        </div>
        <div className="row wrap">
          <button type="button" className="btn btn-sm btn-primary" onClick={download}>
            Scarica la copia
          </button>
          <a className="btn btn-sm" href={buildHref('impostazioni')}>
            Importa un backup
          </a>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              replaceData(createDemoData(now.date, settings))
              recovery.dismiss()
            }}
          >
            Usa i dati dimostrativi
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={recovery.dismiss}>
            Nascondi
          </button>
        </div>
      </div>
    </div>
  )
}
