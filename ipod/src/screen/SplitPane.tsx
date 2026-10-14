/** Pannello destro dei menu divisi: carosello di copertine, o grafica fissa per la riga evidenziata. */
import { useEffect, useMemo, useState } from 'react'
import { usePlayer } from '../audio/player'
import { useLibrary } from '../library/index'
import { t } from '../i18n/strings'
import { useSettings } from '../core/settings'
import { Artwork } from './Artwork'
import { GearIcon } from './icons'
import type { PaneKind } from './listModel'

function pickRandom<T>(list: readonly T[], avoid: T | null): T | null {
  if (list.length === 0) return null
  if (list.length === 1) return list[0]!
  let pick: T
  do pick = list[Math.floor(Math.random() * list.length)]!
  while (pick === avoid)
  return pick
}

function Slideshow({ ids }: { ids: string[] }) {
  // Lo stato iniziale dipende da `ids`: chi usa Slideshow lo rimonta (key) quando cambiano.
  const [layers, setLayers] = useState<{ a: string | null; b: string | null; showB: boolean }>({ a: ids[0] ?? null, b: null, showB: false })
  useEffect(() => {
    if (ids.length <= 1) return
    const id = setInterval(() => {
      setLayers((l) => {
        const current = l.showB ? l.b : l.a
        const next = pickRandom(ids, current)
        return l.showB ? { a: next, b: l.b, showB: false } : { a: l.a, b: next, showB: true }
      })
    }, 3000)
    return () => clearInterval(id)
  }, [ids])
  if (ids.length === 0) return <Artwork artworkId={null} size={128} reflection={30} className="pane-art" />
  return (
    <div className="pane-art">
      <Artwork artworkId={layers.a} size={128} reflection={30} style={{ opacity: layers.showB ? 0 : 1 }} />
      <Artwork artworkId={layers.b} size={128} reflection={30} style={{ opacity: layers.showB ? 1 : 0 }} />
    </div>
  )
}

function ClockFace() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const h = now.getHours() % 12
  const m = now.getMinutes()
  const s = now.getSeconds()
  const hourA = (h + m / 60) * 30
  const minA = (m + s / 60) * 6
  const secA = s * 6
  return (
    <svg viewBox="0 0 100 100" width="96" height="96" style={{ position: 'absolute', left: 16, top: 16 }}>
      <defs>
        <radialGradient id="clk-f" cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e6e6e6" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#clk-f)" stroke="#7a7a7a" strokeWidth="2" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1="50" y1="8" x2="50" y2={i % 3 === 0 ? 15 : 12} stroke="#555" strokeWidth={i % 3 === 0 ? 3 : 2} transform={`rotate(${i * 30} 50 50)`} />
      ))}
      <line x1="50" y1="54" x2="50" y2="26" stroke="#222" strokeWidth="4" strokeLinecap="round" transform={`rotate(${hourA} 50 50)`} />
      <line x1="50" y1="56" x2="50" y2="16" stroke="#222" strokeWidth="3" strokeLinecap="round" transform={`rotate(${minA} 50 50)`} />
      <line x1="50" y1="58" x2="50" y2="12" stroke="#d0342c" strokeWidth="1.5" strokeLinecap="round" transform={`rotate(${secA} 50 50)`} />
      <circle cx="50" cy="50" r="2.5" fill="#d0342c" />
    </svg>
  )
}

export function SplitPane({ kind }: { kind: PaneKind }) {
  const albums = useLibrary((s) => s.index.albums)
  const songs = useLibrary((s) => s.index.songs)
  const count = useLibrary((s) => s.tracks.size)
  const lang = useSettings((s) => s.language)
  const trackId = usePlayer((s) => s.trackId)
  const artIds = useMemo(() => {
    const ids = albums.filter((a) => a.artworkId).map((a) => a.artworkId!)
    return [...new Set(ids)]
  }, [albums])
  const podcastArt = useMemo(() => [...new Set(songs.filter((s) => s.kind === 'podcast' && s.artworkId).map((s) => s.artworkId!))], [songs])

  let body: React.ReactNode
  switch (kind) {
    case 'nowPlaying': {
      const track = trackId ? songs.find((s) => s.id === trackId) : undefined
      body = <Artwork artworkId={track?.artworkId ?? null} size={128} reflection={30} className="pane-art" />
      break
    }
    case 'podcasts':
      body = <Slideshow key={podcastArt.join('|')} ids={podcastArt} />
      break
    case 'extras':
      body = (
        <div className="pane-art" style={{ background: 'linear-gradient(180deg,#f7f7f7,#dcdcdc)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}>
          <ClockFace />
        </div>
      )
      break
    case 'settings':
      body = (
        <div className="pane-art" style={{ background: 'linear-gradient(180deg,#f0f0f0,#d4d4d4)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)', color: '#6b6b6b' }}>
          <GearIcon style={{ position: 'absolute', left: 24, top: 24, width: 80, height: 80 }} />
        </div>
      )
      break
    case 'videos':
      body = (
        <div className="pane-art" style={{ background: 'linear-gradient(180deg,#2b2b2b,#141414)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
          <svg viewBox="0 0 128 128" width="128" height="128" style={{ position: 'absolute', inset: 0 }}>
            <rect x="16" y="28" width="96" height="72" rx="4" fill="#3a3a3a" stroke="#777" />
            {Array.from({ length: 6 }, (_, i) => (
              <g key={i}>
                <rect x={21 + i * 15} y="31" width="8" height="6" rx="1" fill="#111" />
                <rect x={21 + i * 15} y="91" width="8" height="6" rx="1" fill="#111" />
              </g>
            ))}
            <rect x="24" y="42" width="80" height="44" fill="#8fb3d9" />
            <polygon points="56,52 76,64 56,76" fill="#ffffff" opacity="0.9" />
          </svg>
        </div>
      )
      break
    case 'photos':
      body = (
        <div className="pane-art" style={{ background: 'linear-gradient(180deg,#f4f4f4,#dcdcdc)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}>
          <svg viewBox="0 0 128 128" width="128" height="128" style={{ position: 'absolute', inset: 0 }}>
            <rect x="18" y="24" width="92" height="80" fill="#ffffff" stroke="#b5b5b5" />
            <rect x="24" y="30" width="80" height="60" fill="#9fd0f0" />
            <circle cx="84" cy="44" r="7" fill="#ffd36b" />
            <polygon points="24,90 48,58 64,76 76,66 104,90" fill="#5d9a4e" />
          </svg>
        </div>
      )
      break
    case 'none':
      body = null
      break
    default:
      body = <Slideshow key={artIds.join('|')} ids={artIds} />
  }
  return (
    <div className="pane">
      {body}
      {count === 0 && kind === 'slideshow' && <div className="pane-empty">{t('noMusic', lang)}</div>}
    </div>
  )
}
