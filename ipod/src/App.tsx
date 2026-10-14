/** Pagina: sfondo da foto di prodotto, l'iPod al centro, qualche comando discreto sotto. */
import { useState } from 'react'
import { useSettings, updateSettings } from './core/settings'
import { Device } from './device/Device'
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
  const [coarse] = useState(() => window.matchMedia('(pointer: coarse)').matches)
  // Dopo un clic il pulsante perde il fuoco: Spazio e Invio tornano subito alla ghiera.
  const blur = (e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.blur()
  return (
    <div className="page">
      <main className="stage">
        <Device reserveBottom={110}>
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
