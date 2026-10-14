/** Modello dei dati della libreria musicale (come su iPod/iTunes). */

export interface Track {
  /** Identificativo stabile (uuid) — è anche la chiave del file audio in IndexedDB. */
  id: string
  /** Impronta del file sorgente (percorso|dimensione|data modifica): evita doppioni a una nuova importazione. */
  fingerprint: string
  title: string
  /** Artista mostrato nella schermata In riproduzione. */
  artist: string
  /** Artista con cui si raggruppano gli album (album artist, altrimenti artist). */
  albumArtist: string
  album: string
  /** Chiave dell'album: albumArtist + album normalizzati. */
  albumId: string
  /** Chiave della copertina in IndexedDB (condivisa dalle tracce dello stesso album). */
  artworkId: string | null
  year: number | null
  trackNo: number | null
  trackOf: number | null
  discNo: number | null
  genre: string
  composer: string
  /** Durata in secondi (0 se sconosciuta: viene aggiornata al primo ascolto). */
  duration: number
  fileName: string
  /** Percorso relativo alla cartella importata, se noto. */
  path: string
  size: number
  mime: string
  addedAt: number
  playCount: number
  /** Valutazione a stelle 0–5 (0 = nessuna). */
  rating: number
  lastPlayedAt: number | null
  kind: 'music' | 'podcast' | 'audiobook'
}

export interface Album {
  id: string
  title: string
  artist: string
  year: number | null
  artworkId: string | null
  /** Tracce ordinate per disco e numero. */
  trackIds: string[]
  isCompilation: boolean
}

export interface Artist {
  name: string
  /** Nome usato per l'ordinamento (senza "The ", minuscolo, senza accenti). */
  sortName: string
  albumIds: string[]
  trackIds: string[]
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  /** 'otg' = playlist "On-The-Go" costruita dall'iPod tenendo premuto il tasto centrale. */
  kind: 'user' | 'otg'
}

/** Copertina salvata in IndexedDB: originale (ridotta a max 600px) e miniatura (≤160px). */
export interface Artwork {
  id: string
  blob: Blob
  thumb: Blob
  width: number
  height: number
}
