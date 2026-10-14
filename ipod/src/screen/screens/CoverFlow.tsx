/**
 * Cover Flow: carosello 3D delle copertine (album in ordine di titolo) con riflesso sul nero.
 * Il tasto centrale "gira" la copertina al centro: sul retro c'è l'elenco dei brani dell'album.
 * Lo stato vive nella schermata di navigazione: `sel` = album al centro, `mode` = '' | 'back',
 * `params.track`/`params.tfirst` = riga evidenziata e finestra dell'elenco sul retro.
 */
import { formatTime, type QueueItem } from '../../audio/queue'
import type { InputEvent } from '../../core/input'
import { nav, type Screen } from '../../core/navigation'
import { ui, useUi } from '../../core/ui'
import { moveSelection, rowsPerDetent, scrollWindow } from '../../device/wheelMath'
import { t } from '../../i18n/strings'
import { libraryStore, useLibrary } from '../../library/index'
import { indexLetter } from '../../library/sort'
import type { Album, Track } from '../../library/types'
import { Artwork } from '../Artwork'
import { runAction } from '../listInput'
import './coverflow.css'

/** Copertine per lato oltre a quella centrale (al massimo 11 copertine disegnate). */
const SIDE = 5
const BACK_ROWS = 6
const BACK_ROW_H = 20

/* Velocità dell'ultima rotazione: sopra 10 scatti/s le copertine scorrono con una transizione più corta. */
let lastVelocity = 0

function queueOf(album: Album): QueueItem[] {
  return album.trackIds.map((id) => ({ id, albumId: album.id }))
}

/** Trasformazione 3D di una copertina a distanza `d` dal centro (negativa = a sinistra). */
function coverTransform(d: number): string {
  if (d === 0) return 'translateX(0) translateZ(0) rotateY(0deg)'
  const k = Math.abs(d)
  const x = (80 + 24 * (k - 1)) * Math.sign(d)
  // I lati ruotano verso il centro: +65° a sinistra, −65° a destra.
  return `translateX(${x}px) translateZ(-60px) rotateY(${d < 0 ? 65 : -65}deg)`
}

function backInput(e: InputEvent, screen: Screen, album: Album | undefined): boolean {
  const n = album?.trackIds.length ?? 0
  const track = Math.min(Number(screen.params.track) || 0, Math.max(0, n - 1))
  const first = Number(screen.params.tfirst) || 0
  switch (e.type) {
    case 'rotate': {
      if (n === 0) return false
      const next = moveSelection(track, e.steps * rowsPerDetent(e.velocity, n), n)
      if (next === track) return false
      nav.update({ params: { ...screen.params, track: String(next), tfirst: String(scrollWindow(first, next, BACK_ROWS, n)) } })
      return true
    }
    case 'press': {
      if (e.button === 'menu') {
        // Il retro torna copertina: la stessa animazione al contrario (CSS), l'album resta al centro.
        nav.update({ mode: '' })
        return true
      }
      if ((e.button === 'center' || e.button === 'play') && album && n > 0) {
        runAction({ kind: 'play', items: () => queueOf(album), startId: album.trackIds[track] ?? null })
        return true
      }
      return false
    }
    default:
      return false
  }
}

export function coverFlowInput(e: InputEvent, screen: Screen): boolean {
  const albums = libraryStore.get().index.albums
  const length = albums.length
  const sel = Math.min(screen.sel, Math.max(0, length - 1))
  const album = albums[sel]
  if (screen.mode === 'back') return backInput(e, screen, album)

  const move = (steps: number, velocity: number): boolean => {
    if (length === 0) return false
    const next = moveSelection(sel, steps, length)
    if (next === sel) return false
    lastVelocity = velocity
    nav.update({ sel: next })
    if (Math.abs(velocity) >= 8) ui.showLetter(indexLetter(albums[next]!.title))
    return true
  }

  switch (e.type) {
    case 'rotate':
      return move(e.steps * rowsPerDetent(e.velocity, length), e.velocity)
    case 'press':
      switch (e.button) {
        case 'center':
          if (!album) return false
          nav.update({ mode: 'back', params: { ...screen.params, track: '0', tfirst: '0' } })
          return true
        case 'play':
          if (!album || album.trackIds.length === 0) return false
          runAction({ kind: 'play', items: () => queueOf(album), startId: album.trackIds[0] ?? null })
          return true
        case 'prev':
        case 'next':
          move(e.button === 'next' ? 1 : -1, 0)
          return length > 0
        default:
          return false
      }
    default:
      return false
  }
}

function BackFace({ album, tracks, track, first }: { album: Album; tracks: Track[]; track: number; first: number }) {
  const visible = tracks.slice(first, first + BACK_ROWS)
  return (
    <div className="cf-back">
      <Artwork artworkId={album.artworkId} size={56} reflection={14} className="cf-back-art" />
      <div className="cf-back-title">{album.title}</div>
      <div className="cf-back-artist">{album.artist}</div>
      <div className="cf-tracks">
        {visible.map((tr, i) => {
          const index = first + i
          return (
            <div key={tr.id} className="cf-track" data-sel={index === track ? 'true' : 'false'} style={{ top: i * BACK_ROW_H }}>
              <span className="cf-track-no">{index + 1}</span>
              <span className="cf-track-title">{tr.title}</span>
              <span className="cf-track-time">{tr.duration > 0 ? formatTime(tr.duration) : '--:--'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CoverFlowScreen({ screen }: { screen: Screen }) {
  const albums = useLibrary((s) => s.index.albums)
  const trackMap = useLibrary((s) => s.tracks)
  const letter = useUi((s) => s.letter)
  const length = albums.length
  const sel = Math.min(screen.sel, Math.max(0, length - 1))
  const album = albums[sel]
  const back = screen.mode === 'back' && album !== undefined
  const fast = Math.abs(lastVelocity) >= 10

  // Solo le copertine vicine al centro: le altre non si vedrebbero comunque.
  const lo = Math.max(0, sel - SIDE)
  const hi = Math.min(length - 1, sel + SIDE)
  const covers: Array<{ album: Album; d: number }> = []
  for (let i = lo; i <= hi; i++) covers.push({ album: albums[i]!, d: i - sel })

  const tracks = album ? album.trackIds.map((id) => trackMap.get(id)).filter((x): x is Track => x !== undefined) : []
  const track = Math.min(Number(screen.params.track) || 0, Math.max(0, tracks.length - 1))
  const first = Math.min(Number(screen.params.tfirst) || 0, Math.max(0, tracks.length - BACK_ROWS))

  return (
    <div className="cf">
      <div className="cf-stage" data-back={back ? 'true' : 'false'} data-fast={fast ? 'true' : 'false'}>
        {length === 0 ? (
          <div className="cf-cover" data-center="true" style={{ transform: coverTransform(0), zIndex: 20 }}>
            <Artwork artworkId={null} size={120} reflection={48} />
          </div>
        ) : (
          covers.map(({ album: a, d }) => (
            <div key={a.id} className="cf-cover" data-center={d === 0 ? 'true' : 'false'} style={{ transform: coverTransform(d), zIndex: 20 - Math.abs(d) }}>
              <Artwork artworkId={a.artworkId} size={120} reflection={48} />
            </div>
          ))
        )}
      </div>
      {/* Dissolvenza del testo a ogni cambio di album: la chiave rimonta il blocco. */}
      <div className="cf-text" key={album?.id ?? 'none'} data-back={back ? 'true' : 'false'}>
        <div className="cf-title">{album ? album.title : t('noMusic')}</div>
        {album && <div className="cf-artist">{album.artist}</div>}
      </div>
      {album && (
        <div className="cf-flip-wrap">
          <div className="cf-flip" data-back={back ? 'true' : 'false'}>
            <div className="cf-face cf-front">
              <div className="cf-cover">
                <Artwork artworkId={album.artworkId} size={120} reflection={48} />
              </div>
            </div>
            <div className="cf-face cf-back-face">
              <BackFace album={album} tracks={tracks} track={track} first={first} />
            </div>
          </div>
        </div>
      )}
      {letter && !back && (
        <div className="letter-overlay" style={{ left: 160, top: 110 }}>
          {letter}
        </div>
      )}
    </div>
  )
}
