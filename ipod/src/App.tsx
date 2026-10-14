/** Pagina: sfondo da foto di prodotto, l'iPod al centro, qualche comando discreto sotto. */
import { useEffect, useState } from 'react'
import { useSettings, updateSettings } from './core/settings'
import { Device, useFlat } from './device/Device'
import { t } from './i18n/strings'
import { useInstallPrompt } from './lib/pwa'
import { startSync, supportsFolderPicker } from './library/syncFlow'
import { useLibrary } from './library/index'
import { Lcd } from './screen/Lcd'
import './app.css'

export function App() {
  const lang = useSettings((s) => s.language)
  const color = useSettings((s) => s.color)
  const count = useLibrary((s) => s.tracks.size)
  const ready = useLibrary((s) => s.ready)
  const install = useInstallPrompt()
  const flat = useFlat()
  const frame = useSettings((s) => s.frame)
  const [coarse] = useState(() => window.matchMedia('(pointer: coarse)').matches)
  // Senza cornice la pagina diventa tutta bianca o tutta nera; anche la barra di stato del telefono segue.
  useEffect(() => {
    const theme = flat ? (color === 'silver' ? '#ffffff' : '#000000') : '#141414'
    document.body.dataset.flat = flat ? (color === 'silver' ? 'light' : 'dark') : ''
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme)
  }, [flat, color])
  // Dopo un clic il pulsante perde il fuoco: Spazio e Invio tornano subito alla ghiera.
  const blur = (e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.blur()
  return (
    <div className="page">
      <main className="stage">
        <Device reserveBottom={flat ? 118 : 110}>
          <Lcd />
        </Device>
      </main>
      <footer className="dock">
        <div className="dock-row">
          <button type="button" className="dock-btn" onClick={(e) => { blur(e); void startSync('files') }}>
            {t('pageAddMusic', lang)}
          </button>
          <button type="button" className="dock-btn" onClick={(e) => { blur(e); void startSync(supportsFolderPicker() ? 'picker' : 'folder') }}>
            {t('pageAddFolder', lang)}
          </button>
          {ready && count === 0 && (
            <button type="button" className="dock-btn dock-btn-accent" onClick={(e) => { blur(e); void startSync('demo') }}>
              {t('pageDemo', lang)}
            </button>
          )}
          <span className="dock-sep" />
          <button type="button" className="dock-btn" data-active={color === 'silver'} onClick={(e) => { blur(e); updateSettings({ color: 'silver' }) }}>
            {t('pageSilver', lang)}
          </button>
          <button type="button" className="dock-btn" data-active={color === 'black'} onClick={(e) => { blur(e); updateSettings({ color: 'black' }) }}>
            {t('pageBlack', lang)}
          </button>
          <button type="button" className="dock-btn" onClick={(e) => { blur(e); updateSettings({ frame: flat ? 'on' : 'off' }) }} title={frame === 'auto' ? t('frameAuto', lang) : undefined}>
            {t(flat ? 'pageFrame' : 'pageNoFrame', lang)}
          </button>
          {install && (
            <>
              <span className="dock-sep" />
              <button type="button" className="dock-btn" onClick={(e) => { blur(e); void install() }}>
                {t('pageInstall', lang)}
              </button>
            </>
          )}
        </div>
        {!coarse && <div className="dock-hint">{t('pageHint', lang)}</div>}
      </footer>
    </div>
  )
}
