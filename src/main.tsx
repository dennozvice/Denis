import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Gli stili globali vanno importati PRIMA dei componenti: così gli stili delle singole
// sezioni (importati dai componenti) vengono dopo e possono specializzarli.
// Font Inter incluso nell'app (nessuna richiesta a server esterni come Google Fonts).
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
