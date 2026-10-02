import { Download, Eraser, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Card } from '../../components/ui/Card'
import { Pill } from '../../components/ui/Pill'
import { useToast } from '../../components/ui/Toast'
import { createDemoData, createEmptyData, DEFAULT_SETTINGS } from '../../data/demoSeed'
import { clearAllStorage, parseBackup, serializeBackup } from '../../data/persistence'
import type { AppData } from '../../domain/types'
import { formatDateShort, formatNumber, plural } from '../../lib/format'
import { useMarket } from '../../store/MarketContext'
import { useNow } from '../../store/NowContext'
import { useActions, useAppData } from '../../store/StoreContext'
import { approxSize, backupFileName } from './settingsUtils'
import './settings.css'

/** File di backup più grandi di così non sono plausibili: probabilmente è il file sbagliato. */
const MAX_BACKUP_BYTES = 20 * 1024 * 1024

function summary(data: AppData): string {
  return `${plural(data.clients.length, 'cliente', 'clienti')}, ${plural(data.tasks.length, 'attività', 'attività')}, ${plural(
    data.appointments.length,
    'appuntamento',
    'appuntamenti',
  )} e ${plural(data.cases.length, 'pratica', 'pratiche')}`
}

/** Sezione "Backup e dati": esporta/importa, dati dimostrativi, ripartenza da zero, cancellazione totale. */
export function BackupSection() {
  const data = useAppData()
  const { replaceData } = useActions()
  const { imports, setImports } = useMarket()
  const now = useNow()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const sizeLabel = useMemo(() => approxSize(JSON.stringify(data).length + JSON.stringify(imports).length), [data, imports])

  /** Toast con "Annulla" che ripristina lo stato precedente (dati e serie importate). */
  const undoToast = (message: string, previous: AppData, previousImports = imports) =>
    toast({
      message,
      actionLabel: 'Annulla',
      duration: 8000,
      onAction: () => {
        replaceData(previous)
        setImports(previousImports)
      },
    })

  const exportBackup = () => {
    const blob = new Blob([serializeBackup(data, imports)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = backupFileName(now.date)
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast({ message: 'Backup scaricato: conservalo in un luogo sicuro.' })
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = input.files?.[0]
    input.value = '' // permette di riselezionare lo stesso file
    if (!file) return
    setImportError(null)
    if (file.size > MAX_BACKUP_BYTES) {
      setImportError('Il file è troppo grande per essere un backup di questa app.')
      return
    }
    let text: string
    try {
      text = await file.text()
    } catch {
      setImportError('Impossibile leggere il file selezionato.')
      return
    }
    const parsed = parseBackup(text)
    if (!parsed) {
      setImportError(`«${file.name}» non è un backup valido di questa app. Scegli un file .json esportato da qui.`)
      return
    }
    const what = `${summary(parsed.data)}${parsed.data.isDemo ? ' (dati dimostrativi)' : ''}`
    if (!window.confirm(`Il backup contiene ${what}.\n\nSostituire tutti i dati attuali? Se vuoi conservarli, annulla ed esporta prima un backup.`)) return
    const previous = data
    const previousImports = imports
    replaceData(parsed.data)
    const saved = setImports(parsed.imports)
    undoToast(
      saved.ok
        ? `Backup importato: ${summary(parsed.data)}.`
        : 'Backup importato, ma le serie di prezzi non sono state salvate (spazio del browser insufficiente).',
      previous,
      previousImports,
    )
  }

  const restoreDemo = () => {
    if (
      !window.confirm(
        'Sostituire tutti i dati attuali con i dati dimostrativi?\n\nClienti, attività, appuntamenti e pratiche attuali verranno sostituiti. Le impostazioni restano invariate.',
      )
    )
      return
    const previous = data
    replaceData(createDemoData(now.date, data.settings))
    undoToast('Dati dimostrativi ripristinati.', previous)
  }

  const startEmpty = () => {
    if (
      !window.confirm(
        'Eliminare clienti, attività, appuntamenti e pratiche e ripartire con dati vuoti?\n\nLe impostazioni restano invariate.',
      )
    )
      return
    const previous = data
    replaceData(createEmptyData(now.date, data.settings))
    undoToast('Ora lavori con dati vuoti.', previous)
  }

  const deleteAll = () => {
    if (
      !window.confirm(
        'Cancellare TUTTI i dati dell’app da questo browser?\n\nVerranno eliminati clienti, attività, appuntamenti, pratiche, impostazioni e prezzi importati.',
      )
    )
      return
    if (!window.confirm('Confermi la cancellazione definitiva? Senza un backup i dati non si potranno recuperare.')) return
    clearAllStorage()
    replaceData(createEmptyData(now.date, DEFAULT_SETTINGS))
    setImports([])
    toast({ message: 'Tutti i dati sono stati cancellati da questo browser.' })
  }

  const stats: { label: string; value: number }[] = [
    { label: 'Clienti', value: data.clients.length },
    { label: 'Attività', value: data.tasks.length },
    { label: 'Appuntamenti', value: data.appointments.length },
    { label: 'Pratiche', value: data.cases.length },
  ]

  return (
    <Card
      id="sh-set-backup"
      title="Backup e dati"
      subtitle="I dati esistono solo in questo browser: il backup è l’unica copia di sicurezza."
    >
      <div className="sh-set-status">
        <div className="sh-set-status-head">
          <span className="sh-set-status-label">Dati attuali</span>
          {data.isDemo ? <Pill tone="warning">Dimostrativi</Pill> : <Pill tone="positive">Personali</Pill>}
        </div>
        <p className="small text-2">
          {data.isDemo
            ? `Clienti e attività fittizi${data.demoGeneratedOn ? ` (date allineate al ${formatDateShort(data.demoGeneratedOn)})` : ''}: puoi esplorare l’app senza rischi.`
            : 'Stai lavorando con i tuoi dati.'}
        </p>
        <dl className="sh-set-stats">
          {stats.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd className="num">{formatNumber(s.value)}</dd>
            </div>
          ))}
        </dl>
        <p className="xsmall muted">
          Spazio occupato nel browser: <span className="num">{sizeLabel}</span> · Serie di prezzi importate:{' '}
          <span className="num">{formatNumber(imports.length)}</span>
        </p>
      </div>

      <ul className="sh-set-actions">
        <li className="sh-set-action">
          <div className="sh-set-action-text">
            <h3>Esporta backup</h3>
            <p>
              Scarica un file .json con tutti i dati e le serie di prezzi importate.{' '}
              <strong>Conservalo in un luogo sicuro: contiene dati dei clienti.</strong>
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={exportBackup}>
            <Download size={16} aria-hidden="true" />
            Esporta backup
          </button>
        </li>
        <li className="sh-set-action">
          <div className="sh-set-action-text">
            <h3>Importa backup</h3>
            <p>Ripristina un file esportato in precedenza. Sostituisce tutti i dati attuali (ti verrà chiesta conferma).</p>
            {importError && (
              <p className="sh-set-error" role="alert">
                {importError}
              </p>
            )}
          </div>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Upload size={16} aria-hidden="true" />
            Importa backup…
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} />
        </li>
        <li className="sh-set-action">
          <div className="sh-set-action-text">
            <h3>Carica dati dimostrativi</h3>
            <p>Per provare l&apos;app: clienti, attività e appuntamenti di esempio. Sostituiscono i dati attuali.</p>
          </div>
          <button type="button" className="btn" onClick={restoreDemo}>
            <RotateCcw size={16} aria-hidden="true" />
            Carica demo
          </button>
        </li>
        <li className="sh-set-action">
          <div className="sh-set-action-text">
            <h3>Inizia con dati vuoti</h3>
            <p>Elimina i dati attuali e riparti da zero per inserire i tuoi clienti. Le impostazioni restano.</p>
          </div>
          <button type="button" className="btn" onClick={startEmpty}>
            <Eraser size={16} aria-hidden="true" />
            Inizia da zero
          </button>
        </li>
      </ul>

      <div className="sh-set-danger">
        <div className="sh-set-action-text">
          <h3>Cancella tutti i dati da questo browser</h3>
          <p>
            Elimina definitivamente dati, impostazioni e prezzi importati salvati qui. Utile prima di restituire un computer o
            se hai usato un PC condiviso.
          </p>
        </div>
        <button type="button" className="btn btn-danger" onClick={deleteAll}>
          <Trash2 size={16} aria-hidden="true" />
          Cancella tutti i dati
        </button>
      </div>
    </Card>
  )
}
