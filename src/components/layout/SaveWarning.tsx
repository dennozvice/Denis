import { TriangleAlert } from 'lucide-react'
import { useSaveStatus } from '../../store/StoreContext'

/** Avviso se il browser non riesce a salvare (spazio esaurito, navigazione privata…). */
export function SaveWarning() {
  const status = useSaveStatus()
  if (status.ok) return null
  const text =
    status.reason === 'quota'
      ? 'Spazio di archiviazione del browser esaurito: le ultime modifiche non sono state salvate. Esporta un backup da Impostazioni.'
      : 'Il browser non permette di salvare i dati (forse sei in navigazione privata): le modifiche andranno perse alla chiusura.'
  return (
    <div className="banner" role="alert">
      <TriangleAlert size={18} aria-hidden="true" />
      <div>{text}</div>
    </div>
  )
}
