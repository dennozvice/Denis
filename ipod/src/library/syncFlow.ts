/**
 * Flusso di "sincronizzazione" (importazione): stato mostrato dalla schermata Sync
 * e avvio dell'importazione da file, cartella o brani dimostrativi.
 * Le funzioni di importazione vere sono in import.ts / demo.ts; qui c'è solo l'orchestrazione.
 */
import { nav } from '../core/navigation'
import { system } from '../core/system'
import { createStore, useStore } from '../core/store'
import { t, unknownLabels } from '../i18n/strings'
import { library, libraryStore, loadLibrary } from './index'
import type { Track } from './types'

export type SyncPhase = 'idle' | 'connected' | 'generating' | 'syncing' | 'done' | 'cancelled' | 'error'

export interface SyncState {
  phase: SyncPhase
  total: number
  done: number
  added: number
  skipped: number
  failed: number
  message: string
  folderName: string | null
}

export const syncStore = createStore<SyncState>({ phase: 'idle', total: 0, done: 0, added: 0, skipped: 0, failed: 0, message: '', folderName: null })

let abort: AbortController | null = null

export type SyncSource = 'files' | 'folder' | 'picker' | 'resync' | 'demo'

export function supportsFolderPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

const EMPTY_COUNTS = { total: 0, done: 0, added: 0, skipped: 0, failed: 0, message: '' }

/** Mostra la schermata Sync senza impilarne due (i pulsanti della pagina non passano dalla ghiera). */
function showSyncScreen(): void {
  if (nav.top().kind !== 'sync') nav.push('sync')
}

async function runImport(allFiles: File[], controller: AbortController): Promise<void> {
  const { importFiles } = await import('./import')
  // I file "._nome" sono metadati macOS (AppleDouble), non audio.
  const files = allFiles.filter((f) => !f.name.startsWith('._'))
  const existing = new Map<string, Track>()
  for (const tr of libraryStore.get().tracks.values()) existing.set(tr.fingerprint, tr)
  abort = controller
  syncStore.patch({ phase: 'syncing', total: files.length, done: 0, added: 0, skipped: 0, failed: 0 })
  const result = await importFiles(files, {
    labels: unknownLabels(),
    existing,
    signal: abort.signal,
    onProgress: (p) => {
      syncStore.patch({ total: p.total, done: p.done, added: p.added, skipped: p.skipped, failed: p.failed })
      system.touch() // lo schermo resta acceso durante la sincronizzazione
    },
  })
  await loadLibrary()
  syncStore.patch({ phase: abort.signal.aborted ? 'cancelled' : 'done', added: result.added, skipped: result.skipped, failed: result.failed })
  system.touch()
  abort = null
}

/** Avvia una sincronizzazione. Va chiamata da un gesto dell'utente (apre il selettore di file). */
export async function startSync(source: SyncSource): Promise<void> {
  if (syncStore.get().phase === 'syncing' || syncStore.get().phase === 'generating') return
  const s = libraryStore.get()
  if (s.error) {
    syncStore.patch({ ...EMPTY_COUNTS, phase: 'error', message: t('storageError') })
    showSyncScreen()
    return
  }
  const controller = new AbortController()
  abort = controller
  try {
    let files: File[] = []
    if (source === 'demo') {
      showSyncScreen()
      syncStore.patch({ ...EMPTY_COUNTS, phase: 'generating' })
      const { generateDemoLibrary } = await import('./demo')
      files = await generateDemoLibrary((done, total) => {
        // MENU durante la generazione: ci si ferma al brano in corso.
        if (controller.signal.aborted) throw new DOMException('Annullato', 'AbortError')
        syncStore.patch({ done, total })
        system.touch()
      })
    } else {
      const imp = await import('./import')
      // Il selettore si apre subito (gesto dell'utente); la schermata "Collegato" compare sotto.
      const picking =
        source === 'picker'
          ? imp.pickDirectory().then((r) => r ?? [])
          : source === 'resync'
            ? imp.resyncFromStoredHandle().then((r) => r?.files ?? [])
            : imp.pickFiles(source === 'folder' ? 'folder' : 'files')
      syncStore.patch({ ...EMPTY_COUNTS, phase: 'connected' })
      showSyncScreen()
      files = await picking
      if (files.length === 0) {
        syncStore.patch({ phase: 'cancelled' })
        return
      }
    }
    await runImport(files, controller)
    void refreshFolderName()
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') syncStore.patch({ phase: 'cancelled' })
    else syncStore.patch({ phase: 'error', message: e instanceof Error ? e.message : String(e) })
    system.touch()
  } finally {
    if (abort === controller) abort = null
  }
}

export function cancelSync(): void {
  abort?.abort()
}

export async function refreshFolderName(): Promise<void> {
  try {
    const { storedSyncFolderName } = await import('./import')
    syncStore.patch({ folderName: await storedSyncFolderName() })
  } catch {
    syncStore.patch({ folderName: null })
  }
}

/** Chiude la schermata Sync (dopo "done"/"cancelled"/"error"): prima la schermata scorre via, poi si azzera lo stato. */
export function finishSync(): void {
  if (nav.top().kind === 'sync') nav.pop()
  setTimeout(() => {
    const ph = syncStore.get().phase
    if (ph === 'done' || ph === 'cancelled' || ph === 'error') syncStore.patch({ phase: 'idle' })
  }, 260)
}

export async function eraseLibrary(): Promise<void> {
  await library.eraseAll()
  await refreshFolderName() // la cartella ricordata è stata cancellata insieme al resto
}

export function useSync<S = SyncState>(selector?: (s: SyncState) => S): S {
  return useStore(syncStore, selector)
}
