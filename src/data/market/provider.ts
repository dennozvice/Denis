/**
 * Interfaccia per le fonti dei dati di mercato.
 *
 * Oggi l'app usa `DemoMarketProvider` (valori simulati) più le serie che l'utente importa da CSV.
 * Per collegare una fonte reale (es. un servizio interno o un'API di quotazioni) basta
 * implementare questa interfaccia e passarla a <MarketProvider provider={…}>.
 */
import type { DateKey, Instrument } from '../../domain/types'

export interface MarketDataProvider {
  readonly id: string
  readonly label: string
  /** true se i valori sono simulati: l'interfaccia mostra il badge "Dati dimostrativi". */
  readonly isDemo: boolean
  /** Restituisce gli strumenti con la serie storica fino alla data `asOf` inclusa. */
  getInstruments(asOf: DateKey): Promise<Instrument[]>
}

/**
 * Sovrappone le serie importate dall'utente a quelle del provider:
 * stesso ID → la serie importata sostituisce quella demo; ID nuovo → strumento aggiunto.
 */
export function mergeImported(base: Instrument[], imported: Instrument[]): Instrument[] {
  const byId = new Map(base.map((i) => [i.id, i]))
  const result = base.map((i) => i)
  for (const imp of imported) {
    const existing = byId.get(imp.id)
    if (existing) {
      const idx = result.findIndex((i) => i.id === imp.id)
      // SRI e descrizione dimostrativi NON passano a una serie reale importata sullo stesso ID
      result[idx] = {
        ...existing,
        ...imp,
        sri: imp.sri,
        description: imp.description,
        source: 'import',
        colorIndex: existing.colorIndex,
      }
    } else {
      result.push({ ...imp, source: 'import' })
    }
  }
  return result
}
