import { useEffect } from 'react'
import type { ThemePreference } from '../../domain/types'

/** Applica il tema a <html data-theme>. "sistema" segue le preferenze del sistema operativo e i loro cambiamenti. */
export function useApplyTheme(preference: ThemePreference): void {
  useEffect(() => {
    const root = document.documentElement
    if (preference !== 'sistema') {
      root.dataset.theme = preference === 'scuro' ? 'dark' : 'light'
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      root.dataset.theme = media.matches ? 'dark' : 'light'
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preference])
}
