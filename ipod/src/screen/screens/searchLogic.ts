/**
 * Logica pura della schermata Cerca: corrispondenza del testo digitato con i brani e
 * disposizione del "nastro" di lettere in basso. Niente DOM né store: tutto testabile in node.
 */
import { compareTitles } from '../../library/sort'
import type { Track } from '../../library/types'

/** Risultati mostrati al massimo (come l'iPod, che tronca le ricerche troppo generiche). */
export const MAX_RESULTS = 200
/** Righe dell'elenco dei risultati sopra il campo di testo (6 × 24 px = 144 px). */
export const RESULT_ROWS = 6

/**
 * Testo confrontabile: minuscolo e senza accenti, come `sortKey`, ma senza togliere l'articolo
 * iniziale ("The ", "A "): chi cerca può digitarlo e deve trovare lo stesso.
 */
export function foldText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Brano con il testo in cui cercare già normalizzato (titolo, album, artista separati da a capo). */
export interface SearchEntry {
  track: Track
  text: string
}

export function buildSearchIndex(tracks: readonly Track[]): SearchEntry[] {
  return tracks.map((track) => ({ track, text: foldText(`${track.title}\n${track.album}\n${track.artist}`) }))
}

/**
 * Brani in cui titolo, album o artista contengono la query (prefisso o sottostringa), in ordine
 * di titolo e troncati a `limit`. Query vuota = nessun risultato; lo spazio finale (appena
 * inserito, prima della parola seguente) non conta.
 */
export function searchTracks(index: readonly SearchEntry[], query: string, limit = MAX_RESULTS): Track[] {
  const q = foldText(query).trimEnd()
  if (q === '') return []
  const out: Track[] = []
  for (const e of index) if (e.text.includes(q)) out.push(e.track)
  out.sort(compareTitles)
  return out.length > limit ? out.slice(0, limit) : out
}

/* ---------- modifiche del testo digitato ---------- */

/** Avanti inserisce uno spazio, ma mai all'inizio né due di seguito (non servirebbero a cercare). */
export function withSpace(q: string): string {
  return q === '' || q.endsWith(' ') ? q : `${q} `
}

export function withoutLast(q: string): string {
  return q.slice(0, -1)
}

/* ---------- nastro di lettere ---------- */

/** Cella del nastro: una lettera/cifra, oppure "Fine" (`char` null) in coda alla seconda riga. */
export interface RibbonCell {
  line: number
  col: number
  char: string | null
}

/** Due righe: A–M con 0–4, poi N–Z con 5–9 e "Fine". */
export const RIBBON_LINES: readonly string[] = ['ABCDEFGHIJKLM01234', 'NOPQRSTUVWXYZ56789']

function buildRibbon(): RibbonCell[] {
  const cells: RibbonCell[] = []
  RIBBON_LINES.forEach((chars, line) => {
    for (let col = 0; col < chars.length; col++) cells.push({ line, col, char: chars[col]! })
  })
  const last = RIBBON_LINES.length - 1
  cells.push({ line: last, col: RIBBON_LINES[last]!.length, char: null })
  return cells
}

export const RIBBON: readonly RibbonCell[] = buildRibbon()
export const DONE_INDEX = RIBBON.length - 1

/** La ghiera scorre il nastro da sinistra a destra passando alla riga dopo; agli estremi si ferma. */
export function moveRibbon(index: number, steps: number): number {
  return Math.min(RIBBON.length - 1, Math.max(0, index + steps))
}
