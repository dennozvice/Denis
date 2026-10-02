import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Gli stili globali vanno importati PRIMA dei componenti: così gli stili delle singole
// sezioni (importati dai componenti) vengono dopo e possono specializzarli.
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
