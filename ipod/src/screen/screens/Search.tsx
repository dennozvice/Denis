/**
 * Cerca (Musica): risultati in alto, campo di testo con cursore, "nastro" di lettere in basso.
 * Si scrive con la ghiera (lettera evidenziata + tasto centrale), Avanti inserisce uno spazio,
 * Indietro cancella; MENU o "Fine" portano il fuoco sull'elenco, dove MENU torna al nastro.
 * Lo stato vive nella schermata di navigazione: `mode` = '' (nastro) | 'results' (elenco),
 * `sel` = cella del nastro, `params.q` = testo, `params.r`/`params.rfirst` = riga e finestra dell'elenco.
 */
import { usePlayer } from '../../audio/player'
import type { QueueItem } from '../../audio/queue'
import type { InputEvent } from '../../core/input'
import { nav, type Screen } from '../../core/navigation'
import { moveSelection, rowsPerDetent, scrollWindow } from '../../device/wheelMath'
import { t } from '../../i18n/strings'
import { libraryStore, useLibrary } from '../../library/index'
import type { Track } from '../../library/types'
import { SpeakerIcon } from '../icons'
import { runAction } from '../listInput'
import { ROW_HEIGHT } from '../listModel'
import { Marquee } from '../MenuList'
import { buildSearchIndex, moveRibbon, RESULT_ROWS, RIBBON, searchTracks, withoutLast, withSpace, type SearchEntry } from './searchLogic'
import './search.css'

/* Geometria del nastro: celle 15×22 (le due righe entrano in 320 px), "Fine" più larga. */
const KEY_W = 15
const KEY_X = 5
const LINE_Y = [3, 27] as const

/* Indice e risultati dell'ultima ricerca: si ricalcolano solo quando cambiano la libreria o il testo. */
let indexedSongs: readonly Track[] | null = null
let searchIndex: SearchEntry[] = []
let lastQuery: string | null = null
let lastResults: Track[] = []

/** Risultati per `query` sui brani `songs` (l'identità dell'array fa da chiave di cache). */
function resultsFor(songs: readonly Track[], query: string): Track[] {
  if (songs !== indexedSongs) {
    indexedSongs = songs
    searchIndex = buildSearchIndex(songs.filter((tr) => tr.kind === 'music'))
    lastQuery = null
  }
  if (query !== lastQuery) {
    lastQuery = query
    lastResults = searchTracks(searchIndex, query)
  }
  return lastResults
}

const toQueue = (tracks: readonly Track[]): QueueItem[] => tracks.map((tr) => ({ id: tr.id, albumId: tr.albumId }))

/** Nuovo testo = nuovi risultati: l'elenco riparte dalla prima riga e il fuoco torna al nastro. */
function setQuery(screen: Screen, q: string): void {
  nav.update({ mode: '', params: { ...screen.params, q, r: '0', rfirst: '0' } })
}

function focusResults(screen: Screen, q: string): boolean {
  const n = resultsFor(libraryStore.get().index.songs, q).length
  if (n === 0) return false
  const r = Math.min(Number(screen.params.r) || 0, n - 1)
  const first = scrollWindow(Number(screen.params.rfirst) || 0, r, RESULT_ROWS, n)
  nav.update({ mode: 'results', params: { ...screen.params, r: String(r), rfirst: String(first) } })
  return true
}

function ribbonInput(e: InputEvent, screen: Screen, q: string): boolean {
  switch (e.type) {
    case 'rotate': {
      const sel = moveRibbon(screen.sel, e.steps)
      if (sel === screen.sel) return false
      nav.update({ sel })
      return true
    }
    case 'press': {
      if (e.button === 'center') {
        const cell = RIBBON[screen.sel]
        if (!cell) return false
        if (cell.char === null) return focusResults(screen, q)
        setQuery(screen, q + cell.char)
        return true
      }
      // MENU: con dei risultati passa all'elenco, altrimenti lascia tornare indietro al gestore predefinito.
      if (e.button === 'menu') return focusResults(screen, q)
      return false
    }
    default:
      return false
  }
}

function resultsInput(e: InputEvent, screen: Screen, q: string): boolean {
  const results = resultsFor(libraryStore.get().index.songs, q)
  const n = results.length
  const r = Math.min(Number(screen.params.r) || 0, Math.max(0, n - 1))
  switch (e.type) {
    case 'rotate': {
      if (n === 0) return false
      const next = moveSelection(r, e.steps * rowsPerDetent(e.velocity, n), n)
      if (next === r) return false
      const first = scrollWindow(Number(screen.params.rfirst) || 0, next, RESULT_ROWS, n)
      nav.update({ params: { ...screen.params, r: String(next), rfirst: String(first) } })
      return true
    }
    case 'press': {
      if (e.button === 'menu') {
        // Si torna al nastro conservando testo e riga scelta.
        nav.update({ mode: '' })
        return true
      }
      const track = results[r]
      if ((e.button === 'center' || e.button === 'play') && track) {
        runAction({ kind: 'play', items: () => toQueue(results), startId: track.id })
        return true
      }
      return false
    }
    default:
      return false
  }
}

export function searchInput(e: InputEvent, screen: Screen): boolean {
  const q = screen.params.q ?? ''
  if (e.type === 'press' && (e.button === 'next' || e.button === 'prev')) {
    // Avanti = spazio, Indietro = cancella (guida iPod): qui i due tasti scrivono, non cambiano brano,
    // quindi sono consumati anche a vuoto, altrimenti il gestore predefinito salterebbe traccia.
    const next = e.button === 'next' ? withSpace(q) : withoutLast(q)
    if (next !== q) setQuery(screen, next)
    return true
  }
  return screen.mode === 'results' ? resultsInput(e, screen, q) : ribbonInput(e, screen, q)
}

export function SearchScreen({ screen }: { screen: Screen }) {
  const songs = useLibrary((s) => s.index.songs)
  const labels = useLibrary((s) => s.labels)
  const playingId = usePlayer((s) => s.trackId)
  const q = screen.params.q ?? ''
  const results = resultsFor(songs, q)
  const listFocus = screen.mode === 'results'
  const n = results.length
  const r = Math.min(Number(screen.params.r) || 0, Math.max(0, n - 1))
  const first = Math.min(Number(screen.params.rfirst) || 0, Math.max(0, n - RESULT_ROWS))
  const visible = results.slice(first, first + RESULT_ROWS)
  const hasScrollbar = n > RESULT_ROWS
  const rowWidth = hasScrollbar ? 305 : 320
  const thumbH = Math.max(14, Math.round((138 * RESULT_ROWS) / Math.max(n, 1)))
  const thumbTop = hasScrollbar ? Math.round(((138 - thumbH) * first) / (n - RESULT_ROWS)) : 0

  return (
    <div className="se">
      <div className="se-results">
        {visible.map((tr, i) => {
          const selected = first + i === r
          const active = selected && listFocus
          return (
            <div key={tr.id} className="row" data-sel={active ? 'true' : selected ? 'dim' : 'false'} style={{ top: i * ROW_HEIGHT, width: rowWidth }}>
              <div className="row-label" data-marquee={active ? 'true' : 'false'}>
                {active ? <Marquee text={tr.title} active /> : tr.title}
                <span className="row-sub">
                  {tr.album || labels.album} — {tr.artist || labels.artist}
                </span>
              </div>
              {tr.id === playingId && (
                <div className="row-icon">
                  <SpeakerIcon />
                </div>
              )}
            </div>
          )
        })}
        {hasScrollbar && (
          <div className="scrollbar se-scrollbar">
            <div className="scrollbar-thumb" style={{ top: thumbTop, height: thumbH }} />
          </div>
        )}
        {q !== '' && n === 0 && <div className="se-empty">{t('noResults')}</div>}
      </div>
      <div className="se-field">
        <div className="se-text">
          {q}
          {!listFocus && <span className="se-caret" />}
        </div>
      </div>
      <div className="se-ribbon">
        {RIBBON.map((cell, i) => (
          <div
            key={i}
            className="se-key"
            data-done={cell.char === null ? 'true' : 'false'}
            data-sel={i !== screen.sel ? 'false' : listFocus ? 'dim' : 'true'}
            style={{ left: KEY_X + cell.col * KEY_W, top: LINE_Y[cell.line] ?? 0 }}
          >
            {cell.char ?? t('done')}
          </div>
        ))}
      </div>
    </div>
  )
}
