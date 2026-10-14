/**
 * Schermata In riproduzione: copertina con riflesso, titolo/artista/album, contatore,
 * barra di avanzamento (o del volume quando si ruota la ghiera), scorrimento e valutazione.
 */
import { useEffect, useRef, useState } from 'react'
import { player, playerStore, usePlayer, useProgress } from '../../audio/player'
import { formatTime } from '../../audio/queue'
import type { InputEvent } from '../../core/input'
import { nav, type Screen } from '../../core/navigation'
import { updateSettings } from '../../core/settings'
import { t } from '../../i18n/strings'
import { library, useLibrary } from '../../library/index'
import { ui } from '../../core/ui'
import { Artwork } from '../Artwork'
import { RepeatIcon, ShuffleIcon, SpeakerIcon } from '../icons'
import { Marquee } from '../MenuList'

/* Modo della schermata: '' = barra, 'volume', 'scrub', 'rating' */
let volumeUntil = 0
let modeTimer: ReturnType<typeof setTimeout> | null = null
let scrubPos: number | null = null
let scrubTimer: ReturnType<typeof setTimeout> | null = null

function armModeTimeout(ms: number): void {
  if (modeTimer) clearTimeout(modeTimer)
  modeTimer = setTimeout(() => {
    if (nav.top().kind === 'nowPlaying') nav.update({ mode: '' })
    scrubPos = null
  }, ms)
}

export function nowPlayingInput(e: InputEvent, screen: Screen): boolean {
  const st = playerStore.get()
  switch (e.type) {
    case 'rotate': {
      if (screen.mode === 'scrub') {
        const d = player.duration()
        const base = scrubPos ?? player.position()
        const step = Math.max(1, d / 200) * Math.min(4, Math.max(1, Math.round(Math.abs(e.velocity) / 10) || 1))
        scrubPos = Math.max(0, Math.min(d > 0 ? d - 0.5 : base, base + e.steps * step))
        nav.update({ params: { ...screen.params, scrub: String(scrubPos) } })
        if (scrubTimer) clearTimeout(scrubTimer)
        const target = scrubPos
        scrubTimer = setTimeout(() => {
          player.seek(target)
          // Applicata la ricerca, tempi e rombo tornano a seguire la riproduzione.
          scrubPos = null
          if (nav.top().kind === 'nowPlaying') nav.update({ params: { ...nav.top().params, scrub: '' } })
        }, 120)
        armModeTimeout(4000)
        return true
      }
      if (screen.mode === 'rating') {
        const tr = st.trackId ? library.track(st.trackId) : undefined
        if (!tr) return false
        const next = Math.max(0, Math.min(5, tr.rating + e.steps))
        if (next === tr.rating) return false
        void library.setRating(tr.id, next)
        armModeTimeout(4000)
        return true
      }
      // volume: 1 scatto = 1/32 del volume
      const v = Math.max(0, Math.min(100, st.volume + e.steps * (100 / 32)))
      if (Math.round(v) === Math.round(st.volume)) {
        volumeUntil = Date.now() + 1500
        nav.update({ mode: 'volume' })
        armModeTimeout(1500)
        return false
      }
      player.setVolume(v)
      updateSettings({ volume: Math.round(v) })
      volumeUntil = Date.now() + 1500
      nav.update({ mode: 'volume' })
      armModeTimeout(1500)
      return true
    }
    case 'hold': {
      // Tasto centrale tenuto premuto: aggiunge (o toglie) il brano alla playlist On-The-Go.
      if (e.button !== 'center' || !st.trackId) return false
      const id = st.trackId
      void library.toggleOnTheGo(id, t('onTheGo')).then((added) => ui.toast(t(added ? 'addedToOnTheGo' : 'removedFromOnTheGo')))
      return true
    }
    case 'press': {
      if (e.button === 'center') {
        const order = ['', 'scrub', 'rating'] as const
        const current = screen.mode === 'volume' ? '' : screen.mode
        const next = order[(order.indexOf(current as (typeof order)[number]) + 1) % order.length]!
        scrubPos = null
        nav.update({ mode: next, params: { ...screen.params, scrub: '' } })
        if (next) armModeTimeout(4000)
        else if (modeTimer) clearTimeout(modeTimer)
        return true
      }
      if (e.button === 'menu') {
        if (modeTimer) clearTimeout(modeTimer)
        scrubPos = null
        nav.pop()
        return true
      }
      return false
    }
    default:
      return false
  }
}

function ProgressBar({ position, duration, scrub }: { position: number; duration: number; scrub: boolean }) {
  // Il display vero aggiorna una volta al secondo: la barra segue i secondi interi.
  const ratio = duration > 0 ? Math.min(1, Math.floor(position) / duration) : 0
  const w = Math.round(210 * ratio)
  return (
    <>
      <div className="np-bar">
        {w > 0 && <div className="np-fill" style={{ width: w }} />}
        {scrub && <div className="np-diamond" style={{ left: 1 + w - 5 }} />}
      </div>
      <div className="np-time np-time-left">{formatTime(position)}</div>
      <div className="np-time np-time-right">{formatTime(Math.max(0, duration - position), true)}</div>
    </>
  )
}

function VolumeBar({ volume }: { volume: number }) {
  const w = Math.round((210 * volume) / 100)
  return (
    <>
      <div className="np-speaker">
        <SpeakerIcon />
      </div>
      <div className="np-bar">{w > 0 && <div className="np-fill" style={{ width: w }} />}</div>
    </>
  )
}

function Rating({ value }: { value: number }) {
  return (
    <div className="np-rating">
      {[1, 2, 3, 4, 5].map((i) =>
        i <= value ? (
          <svg key={i} width="16" height="16" viewBox="0 0 16 16">
            <polygon points="8,0.8 10.2,5.6 15.4,6.1 11.5,9.6 12.7,14.8 8,12.1 3.3,14.8 4.5,9.6 0.6,6.1 5.8,5.6" fill="#1a1a1a" />
          </svg>
        ) : (
          <svg key={i} width="16" height="16" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="2" fill="#9a9a9a" />
          </svg>
        ),
      )}
    </div>
  )
}

export function NowPlayingScreen({ screen }: { screen: Screen }) {
  const trackId = usePlayer((s) => s.trackId)
  const index = usePlayer((s) => s.index)
  const total = usePlayer((s) => s.queue.length)
  const volume = usePlayer((s) => s.volume)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const version = useLibrary((s) => s.version)
  const tracks = useLibrary((s) => s.tracks)
  const progress = useProgress()
  const track = trackId ? tracks.get(trackId) : undefined
  const [, force] = useState(0)
  const sinceVolume = useRef(0)
  useEffect(() => {
    // Ritorno automatico dalla barra del volume (il modo è nel nav store, ma ridisegniamo a scadenza).
    if (screen.mode !== 'volume') return
    const id = setTimeout(() => force((n) => n + 1), Math.max(0, volumeUntil - Date.now()) + 20)
    sinceVolume.current = Date.now()
    return () => clearTimeout(id)
  }, [screen.mode, volume])
  void version

  if (!track) {
    return <div className="msg" style={{ top: 96, fontSize: 14, color: '#6e6e6e' }}>{t('noPlaying')}</div>
  }
  const mode = screen.mode
  const scrub = screen.params.scrub ? Number(screen.params.scrub) : null
  const position = mode === 'scrub' && scrub !== null && Number.isFinite(scrub) ? scrub : progress.position
  const duration = progress.duration || track.duration
  return (
    <div className="np">
      {/* Copertina in prospettiva (firmware 2007): bordo destro che si allontana, riflesso sotto. */}
      <div className="np-art-stage">
        <Artwork artworkId={track.artworkId} size={124} reflection={36} full className="np-art" />
      </div>
      <div className="np-counter">
        {shuffle !== 'off' && <ShuffleIcon style={{ color: '#555' }} />}
        {repeat !== 'off' && <RepeatIcon one={repeat === 'one'} style={{ color: '#555' }} />}
        <span>
          {index + 1} {t('of')} {total}
        </span>
      </div>
      <div className="np-text">
        <div className="np-title">
          <Marquee key={`t${track.id}`} text={track.title} active />
        </div>
        <div className="np-line">
          <Marquee key={`a${track.id}`} text={track.artist || t('unknownArtist')} active />
        </div>
        <div className="np-line">
          <Marquee key={`b${track.id}`} text={track.album || t('unknownAlbum')} active />
        </div>
      </div>
      {mode === 'volume' ? (
        <VolumeBar volume={volume} />
      ) : mode === 'rating' ? (
        <Rating value={track.rating} />
      ) : (
        <ProgressBar position={position} duration={duration} scrub={mode === 'scrub'} />
      )}
    </div>
  )
}
