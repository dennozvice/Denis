/** Schermate semplici: Note legali, Luminosità, Info, Sincronizzazione, Giochi. */
import { useEffect, useState } from 'react'
import type { InputEvent } from '../../core/input'
import { nav, type Screen } from '../../core/navigation'
import { updateSettings, useSettings, settingsStore } from '../../core/settings'
import { t } from '../../i18n/strings'
import { db } from '../../library/db'
import { useLibrary } from '../../library/index'
import { cancelSync, finishSync, syncStore, useSync } from '../../library/syncFlow'
import { CheckCircleIcon, PlugIcon, SunIcon, SyncArrowsIcon } from '../icons'

export const APP_VERSION = '1.0'

/* ---------- Luminosità ---------- */
export function brightnessInput(e: InputEvent): boolean {
  if (e.type !== 'rotate') return false
  const s = settingsStore.get()
  const next = Math.max(10, Math.min(100, s.brightness + e.steps * 2.25))
  if (Math.round(next) === Math.round(s.brightness)) return false
  updateSettings({ brightness: next })
  return true
}

export function BrightnessScreen() {
  const brightness = useSettings((s) => s.brightness)
  const w = Math.round((230 * (brightness - 10)) / 90)
  return (
    <div className="screen-plain">
      <SunIcon style={{ position: 'absolute', left: 20, top: 97, width: 10, height: 10, color: '#444' }} />
      <SunIcon style={{ position: 'absolute', left: 282, top: 93, width: 18, height: 18, color: '#444' }} />
      <div className="np-bar" style={{ left: 40, top: 97, width: 232, height: 10 }}>
        {w > 0 && <div className="np-fill" style={{ width: w, height: 8, borderRadius: 4 }} />}
      </div>
    </div>
  )
}

/* ---------- Note legali ---------- */
export function LegalScreen() {
  return (
    <div className="screen-plain" style={{ padding: '10px 12px', fontSize: 12, lineHeight: '16px', color: '#000' }}>
      {t('legalText')}
    </div>
  )
}

/* ---------- Info ---------- */
function formatBytes(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} TB`
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`
  return `${Math.round(n / 1e3)} KB`
}

function serial(): string {
  try {
    const k = 'ipod:serial'
    let s = localStorage.getItem(k)
    if (!s) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'
      s = Array.from({ length: 11 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
      localStorage.setItem(k, s)
    }
    return s
  } catch {
    return 'WEB00000000'
  }
}

export function aboutInput(e: InputEvent, screen: Screen): boolean {
  if (e.type === 'press' && e.button === 'center') {
    nav.update({ mode: screen.mode === 'page2' ? '' : 'page2' })
    return true
  }
  return false
}

export function AboutScreen({ screen }: { screen: Screen }) {
  const count = useLibrary((s) => s.tracks.size)
  const albums = useLibrary((s) => s.index.albums.length)
  const artists = useLibrary((s) => s.index.artists.length)
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  useEffect(() => {
    let alive = true
    void db.storageEstimate().then((s) => {
      if (alive) setStorage(s)
    })
    return () => {
      alive = false
    }
  }, [count])
  const rows: Array<[string, string]> =
    screen.mode === 'page2'
      ? [
          [t('aboutModel'), 'Classic (web)'],
          [t('aboutFormat'), 'IndexedDB'],
          [t('aboutAlbums'), String(albums)],
          [t('artists'), String(artists)],
          [t('aboutSerial'), serial()],
        ]
      : [
          [t('aboutName'), 'iPod'],
          [t('aboutSongs'), String(count)],
          [t('aboutCapacity'), storage ? formatBytes(storage.quota) : '—'],
          [t('aboutAvailable'), storage ? formatBytes(Math.max(0, storage.quota - storage.usage)) : '—'],
          [t('aboutVersion'), APP_VERSION],
        ]
  return (
    <div className="screen-plain">
      {rows.map(([k, v], i) => (
        <div key={k} className="about-row" style={{ top: i * 24 }}>
          <span>{k}</span>
          <span className="about-value">{v}</span>
        </div>
      ))}
    </div>
  )
}

/* ---------- Sincronizzazione ---------- */
export function syncInput(e: InputEvent): boolean {
  const phase = syncStore.get().phase
  if (phase === 'syncing' || phase === 'generating') {
    if (e.type === 'press' && e.button === 'menu') cancelSync()
    return true
  }
  if (phase === 'connected') {
    // il selettore di file è aperto: MENU lo "chiude" tornando indietro
    if (e.type === 'press' && e.button === 'menu') finishSync()
    return true
  }
  if (e.type === 'press') {
    finishSync()
    return true
  }
  return e.type !== 'release'
}
export function SyncScreen() {
  const sync = useSync()
  let icon: React.ReactNode
  let title = ''
  let body = ''
  let sub = ''
  switch (sync.phase) {
    case 'connected':
      icon = <PlugIcon style={{ width: 48, height: 72, color: '#3c3c3c' }} />
      title = t('connected')
      body = t('ejectBefore')
      break
    case 'generating':
      icon = <SyncArrowsIcon className="spin" style={{ width: 56, height: 56, color: '#3c3c3c' }} />
      title = t('generating')
      body = t('doNotDisconnect')
      sub = sync.total ? `${sync.done} / ${sync.total}` : ''
      break
    case 'syncing':
      icon = <SyncArrowsIcon className="spin" style={{ width: 56, height: 56, color: '#3c3c3c' }} />
      title = t('syncInProgress')
      body = t('doNotDisconnect')
      sub = `${sync.done} ${t('of')} ${sync.total}`
      break
    case 'done':
      icon = <CheckCircleIcon style={{ width: 56, height: 56, color: '#3fb63c' }} />
      title = t('okToDisconnect')
      body = `${sync.added} ${t('syncAdded')}`
      sub = [sync.skipped ? `${sync.skipped} ${t('syncSkipped')}` : '', sync.failed ? `${sync.failed} ${t('syncFailed')}` : ''].filter(Boolean).join(' · ')
      break
    case 'cancelled':
      icon = <PlugIcon style={{ width: 48, height: 72, color: '#3c3c3c' }} />
      title = t('syncCancelled')
      body = sync.added ? `${sync.added} ${t('syncAdded')}` : t('syncNoFiles')
      break
    case 'error':
      icon = <PlugIcon style={{ width: 48, height: 72, color: '#3c3c3c' }} />
      title = t('storageError')
      body = sync.message
      break
    default:
      icon = null
  }
  return (
    <div className="screen-plain">
      <div className="sync-icon">{icon}</div>
      <div className="sync-title">{title}</div>
      <div className="sync-body">{body}</div>
      <div className="sync-sub">{sub}</div>
    </div>
  )
}
