import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { player, playerStore, setTrackProvider } from './audio/player'
import { setClickerEnabled, settingsStore } from './boot'
import { system, setPlayingProbe } from './core/system'
import { setupPwa } from './lib/pwa'
import { nav } from './core/navigation'
import { artworkUrl, library, libraryStore, loadLibrary } from './library/index'
import { refreshFolderName } from './library/syncFlow'
import { unknownLabels } from './i18n/strings'
import { invalidateLists } from './screen/listModel'
import { registerAllInputs } from './screen/registry'
import { syncStore } from './library/syncFlow'
import { uiStore } from './core/ui'

setupPwa()
registerAllInputs()

// La libreria fornisce i metadati al motore audio (evita dipendenze circolari tra i moduli).
setTrackProvider({
  getTrack: (id) => library.track(id),
  getArtworkUrl: artworkUrl,
  onTrackPlayed: (track) => void library.markPlayed(track.id),
  onDurationKnown: (track, d) => void library.setDuration(track.id, d),
})
setPlayingProbe(() => playerStore.get().status === 'playing')

// Impostazioni iniziali del motore audio e del clicker.
{
  const s = settingsStore.get()
  player.setVolume(s.volume)
  player.setShuffle(s.shuffle)
  player.setRepeat(s.repeat)
  player.setEq(s.eq)
  setClickerEnabled(s.clicker)
}
settingsStore.subscribe((s) => setClickerEnabled(s.clicker))

// Le righe dei menu dipendono da libreria, impostazioni, lettore e sincronizzazione.
for (const store of [libraryStore, settingsStore, playerStore, syncStore]) store.subscribe(() => invalidateLists())
uiStore.subscribe(() => {})

// Avvio: carica la libreria, poi "accende" lo schermo (sequenza di avvio ≈ 2 s).
const bootAt = Date.now()
void Promise.all([loadLibrary(unknownLabels()), refreshFolderName()]).finally(() => {
  const wait = Math.max(0, 2200 - (Date.now() - bootAt))
  setTimeout(() => {
    system.boot()
    // La prima volta l'iPod chiede la lingua (come il vero dispositivo appena acceso).
    if (!settingsStore.get().welcomed) nav.push('option', { setting: 'language', first: '1' })
  }, wait)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
