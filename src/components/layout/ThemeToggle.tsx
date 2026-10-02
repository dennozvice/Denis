import { Monitor, Moon, Sun } from 'lucide-react'
import type { ThemePreference } from '../../domain/types'
import { useActions, useAppData } from '../../store/StoreContext'

const NEXT: Record<ThemePreference, ThemePreference> = { sistema: 'chiaro', chiaro: 'scuro', scuro: 'sistema' }
const LABEL: Record<ThemePreference, string> = { sistema: 'Tema: sistema', chiaro: 'Tema: chiaro', scuro: 'Tema: scuro' }

/** Bottone che cicla tra tema di sistema, chiaro e scuro. */
export function ThemeToggle() {
  const { settings } = useAppData()
  const { updateSettings } = useActions()
  const Icon = settings.theme === 'chiaro' ? Sun : settings.theme === 'scuro' ? Moon : Monitor
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => updateSettings({ theme: NEXT[settings.theme] })}
      aria-label={`${LABEL[settings.theme]}. Cambia tema`}
      title={`${LABEL[settings.theme]} (clic per cambiare)`}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  )
}
