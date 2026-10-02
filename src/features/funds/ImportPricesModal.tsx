import { CircleAlert, FileUp, TriangleAlert, Upload } from 'lucide-react'
import { useDeferredValue, useId, useMemo, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { INSTRUMENT_GROUP_LABEL } from '../../domain/labels'
import type { Instrument, InstrumentGroup } from '../../domain/types'
import { parsePriceCsv, type PriceCsvResult, type PriceRow } from '../../lib/csv'
import { lastPoint } from '../../lib/finance'
import { formatDateShort, formatInstrumentValue, formatNumber, plural } from '../../lib/format'
import { useMarket } from '../../store/MarketContext'
import { useNow } from '../../store/NowContext'
import { buildImports, groupImportRows, looksOffScale, type ImportGroup } from './fundsLogic'
import './funds.css'

const FORM_ID = 'fd-import-form'
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_ERRORS_SHOWN = 10
const EXAMPLE = 'id;data;valore\nf-bil-prud;30/09/2026;11,82\nf-bil-prud;01/10/2026;11,87'

const GROUP_ORDER: InstrumentGroup[] = ['fondo', 'gestione_separata', 'indice', 'tasso', 'spread', 'cambio']

/** Testo di un file: UTF-8 se valido, altrimenti Windows-1252 (CSV salvati dall'Excel italiano). */
async function readFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

function saveErrorMessage(reason: 'quota' | 'unavailable' | 'error'): string {
  switch (reason) {
    case 'quota':
      return 'Spazio del browser esaurito: importa meno valori (ad esempio solo quelli di fine mese) oppure rimuovi alcune serie importate.'
    case 'unavailable':
      return 'Il browser non consente di salvare dati (navigazione privata o archiviazione disattivata): i valori non sono stati importati.'
    case 'error':
      return 'Salvataggio non riuscito: riprova.'
  }
}

/** Righe da importare: quelle con data futura solo se l'utente lo ha confermato. */
function rowsToImport(result: PriceCsvResult, allowFuture: boolean): PriceRow[] {
  return allowFuture && result.future.length > 0 ? [...result.rows, ...result.future] : result.rows
}

/** Importazione dei valori ufficiali (fondi, indici…) da CSV incollato o da file, con anteprima. */
export function ImportPricesModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const { instruments, updateImports } = useMarket()
  const { date: today } = useNow()
  const toast = useToast()
  const uid = useId()
  const [text, setText] = useState('')
  const [defaultKey, setDefaultKey] = useState('')
  const [allowFuture, setAllowFuture] = useState(false)
  const [fileName, setFileName] = useState<string>()
  const [fileError, setFileError] = useState<string>()
  const [saveError, setSaveError] = useState<string>()
  const [dragging, setDragging] = useState(false)

  const deferredText = useDeferredValue(text)
  const parsed = useMemo(
    () => parsePriceCsv(deferredText, { defaultKey: defaultKey || undefined, maxDate: today }),
    [deferredText, defaultKey, today],
  )
  const groups = useMemo(
    () => groupImportRows(rowsToImport(parsed, allowFuture), instruments),
    [parsed, allowFuture, instruments],
  )
  const pointCount = groups.reduce((n, g) => n + g.points.length, 0)
  const stale = deferredText !== text

  const sortedInstruments = useMemo(
    () => GROUP_ORDER.flatMap((g) => instruments.filter((i) => i.group === g)),
    [instruments],
  )

  const close = () => {
    setText('')
    setDefaultKey('')
    setAllowFuture(false)
    setFileName(undefined)
    setFileError(undefined)
    setSaveError(undefined)
    setDragging(false)
    onClose()
  }

  /** Nuovo testo da importare: la conferma per le date future va ridata. */
  const changeText = (value: string) => {
    setText(value)
    setAllowFuture(false)
    setSaveError(undefined)
  }

  const readFile = async (file: File | undefined) => {
    if (!file) return
    if (!/\.(csv|txt|tsv)$/i.test(file.name) && file.type && !file.type.startsWith('text/')) {
      setFileError('Seleziona un file .csv o .txt.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError('Il file è troppo grande (massimo 5 MB).')
      return
    }
    try {
      changeText(await readFileText(file))
      setFileName(file.name)
      setFileError(undefined)
    } catch {
      setFileError('Impossibile leggere il file selezionato.')
    }
  }

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = input.files?.[0]
    input.value = '' // si può ricaricare lo stesso file
    void readFile(file)
  }

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragging(false)
    void readFile(e.dataTransfer.files?.[0])
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // si usa sempre il testo attuale, anche se l'anteprima differita non è ancora aggiornata
    const current = parsePriceCsv(text, { defaultKey: defaultKey || undefined, maxDate: today })
    const toImport = groupImportRows(rowsToImport(current, allowFuture), instruments)
    if (toImport.length === 0) return
    // si parte dalle serie salvate più recenti: non si perdono import fatti in un'altra scheda
    const result = updateImports((latest) => buildImports(toImport, latest))
    if (!result.ok) {
      setSaveError(saveErrorMessage(result.reason))
      return
    }
    const n = toImport.reduce((s, g) => s + g.points.length, 0)
    const values = n === 1 ? 'Importato 1 valore' : `Importati ${formatNumber(n)} valori`
    toast({ message: `${values} per ${plural(toImport.length, 'strumento', 'strumenti')}` })
    close()
  }

  const errorCount = parsed.errors.length
  const futureCount = parsed.future.length
  const missingKeyOnly = errorCount > 0 && parsed.rows.length === 0 && parsed.errors.every((er) => er.message.startsWith('Manca lo strumento'))

  return (
    <Modal
      open={open}
      title="Importa valori (.csv)"
      onClose={close}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={close}>
            Annulla
          </button>
          <button type="submit" form={FORM_ID} className="btn btn-primary" disabled={pointCount === 0 || stale}>
            <FileUp size={16} aria-hidden="true" />
            {pointCount > 0 ? `Importa ${pointCount === 1 ? '1 valore' : `${formatNumber(pointCount)} valori`}` : 'Importa'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} className="form fd-import" onSubmit={onSubmit} noValidate>
        <p className="small text-2">
          Incolla i valori ufficiali o carica un file CSV salvato da Excel: una riga per valore con codice dello
          strumento, data e valore. I valori importati sostituiscono quelli dimostrativi dello stesso strumento e restano
          salvati solo in questo browser.
        </p>

        <div className="fd-import-help">
          <div>
            <p className="xsmall strong text-2">Esempio</p>
            <pre className="fd-code">{EXAMPLE}</pre>
          </div>
          <ul className="xsmall muted fd-import-rules">
            <li>Separatore di colonna: punto e virgola (consigliato), tabulazione o virgola.</li>
            <li>Date gg/mm/aaaa oppure aaaa-mm-gg; valori con la virgola decimale (11,82) o il punto (11.82).</li>
            <li>La riga di intestazione è facoltativa. Per un fondo non in elenco scrivi il suo nome: verrà creato.</li>
            <li>File con sole due colonne (data;valore): scegli lo strumento qui sotto.</li>
          </ul>
        </div>

        <details className="fd-details">
          <summary>Codici degli strumenti disponibili</summary>
          <div className="table-wrap fd-codes-wrap">
            <table className="table fd-codes">
              <thead>
                <tr>
                  <th scope="col">Codice (id)</th>
                  <th scope="col">Nome</th>
                  <th scope="col" className="fd-codes-type">
                    Tipo
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedInstruments.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <code className="fd-code-inline">{i.id}</code>
                    </td>
                    <td>{i.name}</td>
                    <td className="muted fd-codes-type">{INSTRUMENT_GROUP_LABEL[i.group]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <div className="form-grid">
          <label className="field">
            <span>Strumento (solo per file data;valore)</span>
            <select className="select" value={defaultKey} onChange={(e) => setDefaultKey(e.target.value)}>
              <option value="">Il file contiene la colonna id</option>
              {GROUP_ORDER.map((g) => {
                const list = instruments.filter((i) => i.group === g)
                if (list.length === 0) return null
                return (
                  <optgroup key={g} label={INSTRUMENT_GROUP_LABEL[g]}>
                    {list.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </label>
          <div className="field">
            <span className="field-label" aria-hidden="true">
              Carica un file (.csv, .txt)
            </span>
            <label
              className={`fd-drop${dragging ? ' is-dragging' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <input
                type="file"
                accept=".csv,.txt,.tsv,text/csv,text/plain"
                className="visually-hidden"
                onChange={onFile}
                aria-label="Carica un file con i valori (.csv, .txt)"
                aria-describedby={`${uid}-file-status`}
                aria-invalid={fileError ? true : undefined}
              />
              <span className="btn btn-sm fd-drop-pick" aria-hidden="true">
                <Upload size={16} />
                Scegli file…
              </span>
              <span id={`${uid}-file-status`} className={`fd-drop-name${fileError ? ' fd-error-text' : ''}`}>
                {fileError ?? (fileName ? `Caricato: ${fileName}` : 'Nessun file selezionato · oppure trascinalo qui')}
              </span>
            </label>
          </div>
          <label className="field span-2">
            <span>Dati da importare</span>
            <textarea
              className="textarea fd-textarea"
              rows={8}
              value={text}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder={EXAMPLE}
              onChange={(e) => changeText(e.target.value)}
            />
          </label>
        </div>

        {saveError && (
          <div className="banner fd-banner-error" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <span>{saveError}</span>
          </div>
        )}

        <section className="fd-preview" aria-live="polite" aria-labelledby={`${uid}-preview`}>
          <h3 id={`${uid}-preview`} className="small">
            Anteprima
          </h3>
          {deferredText.trim() === '' ? (
            <p className="xsmall muted">Incolla i dati o carica un file per vedere l’anteprima.</p>
          ) : (
            <>
              <p className="small">
                {groups.length === 0
                  ? futureCount > 0
                    ? 'Nessun valore da importare.'
                    : 'Nessun valore valido trovato.'
                  : `${pointCount === 1 ? '1 valore' : `${formatNumber(pointCount)} valori`} per ${plural(groups.length, 'strumento', 'strumenti')}`}
                {parsed.hasHeader && <span className="muted"> · intestazione ignorata</span>}
              </p>
              {groups.length > 0 && (
                <ul className="fd-preview-list">
                  {groups.map((g) => (
                    <PreviewItem key={g.match.id} group={g} />
                  ))}
                </ul>
              )}
              {futureCount > 0 && (
                <div className="fd-preview-errors">
                  <p className="xsmall strong">
                    <TriangleAlert size={14} aria-hidden="true" />{' '}
                    {allowFuture
                      ? `${plural(futureCount, 'riga', 'righe')} con data nel futuro: ${futureCount === 1 ? 'verrà importata' : 'verranno importate'}`
                      : `${plural(futureCount, 'riga esclusa', 'righe escluse')}. Data nel futuro: controlla l’anno`}
                  </p>
                  <ul className="xsmall">
                    {parsed.future.slice(0, MAX_ERRORS_SHOWN).map((r) => (
                      <li key={r.line} className="num">
                        Riga {r.line}: {formatDateShort(r.date)} · {r.key}
                      </li>
                    ))}
                    {futureCount > MAX_ERRORS_SHOWN && <li className="muted">…e altre {futureCount - MAX_ERRORS_SHOWN}</li>}
                  </ul>
                  <label className="fd-inline-check fd-future-check">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={allowFuture}
                      onChange={(e) => setAllowFuture(e.target.checked)}
                    />
                    <span>Importa comunque le righe con data nel futuro</span>
                  </label>
                </div>
              )}
              {missingKeyOnly && (
                <p className="xsmall fd-error-text">
                  Il file ha solo data e valore: scegli lo strumento nel campo “Strumento”.
                </p>
              )}
              {errorCount > 0 && !missingKeyOnly && (
                <div className="fd-preview-errors">
                  <p className="xsmall strong">
                    <TriangleAlert size={14} aria-hidden="true" /> {plural(errorCount, 'riga ignorata', 'righe ignorate')}
                  </p>
                  <ul className="xsmall">
                    {parsed.errors.slice(0, MAX_ERRORS_SHOWN).map((er) => (
                      <li key={`${er.line}-${er.message}`}>
                        Riga {er.line}: {er.message}
                      </li>
                    ))}
                    {errorCount > MAX_ERRORS_SHOWN && <li className="muted">…e altre {errorCount - MAX_ERRORS_SHOWN}</li>}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </form>
    </Modal>
  )
}

function PreviewItem({ group }: { group: ImportGroup }) {
  const { match, points, first, last, lastValue } = group
  const existing: Instrument | undefined = match.existing
  const unit = existing?.unit ?? 'EUR'
  const decimals = existing?.decimals ?? 3
  const current = existing ? lastPoint(existing.series)?.value : undefined
  const suspicious = looksOffScale(lastValue, current)
  return (
    <li className="fd-preview-item">
      <div className="fd-preview-name">
        {existing ? (
          <>
            <span className="strong">{existing.name}</span>
            {existing.source === 'demo' && <span className="xsmall muted"> · sostituisce i valori dimostrativi</span>}
            {existing.source === 'import' && <span className="xsmall muted"> · si aggiunge ai valori importati</span>}
          </>
        ) : (
          <span className="strong">Nuovo fondo: {match.key}</span>
        )}
      </div>
      <div className="xsmall muted num">
        {plural(points.length, 'valore', 'valori')} · {first === last ? `il ${formatDateShort(first)}` : `dal ${formatDateShort(first)} al ${formatDateShort(last)}`} · ultimo{' '}
        <span className="text-2 strong">{formatInstrumentValue(lastValue, unit, decimals)}</span>
      </div>
      {suspicious && current !== undefined && (
        <div className="xsmall fd-warn-text">
          <TriangleAlert size={12} aria-hidden="true" /> Molto diverso dal valore attuale ({formatInstrumentValue(current, unit, decimals)}): controlla il separatore decimale.
        </div>
      )}
    </li>
  )
}
