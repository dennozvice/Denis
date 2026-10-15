/**
 * App nativa per iPhone (Capacitor): qui si riconosce se l'app gira dentro il guscio nativo
 * e si tiene la barra di stato del telefono dello stesso colore della pagina.
 * Nel browser e come PWA queste funzioni non fanno nulla.
 */
import { Capacitor } from '@capacitor/core'

/** true quando l'app è l'app nativa (progetto Xcode in ios/), non il sito né la PWA. */
export const isNative: boolean = Capacitor.isNativePlatform()

/**
 * Testo della barra di stato: scuro su pagina bianca, chiaro su pagina nera (o sullo sfondo scuro con cornice).
 * Il plugin viene caricato solo nell'app nativa, così il sito non lo scarica.
 */
export async function syncStatusBar(theme: 'light' | 'dark' | ''): Promise<void> {
  if (!isNative) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: theme === 'light' ? Style.Light : Style.Dark })
  } catch {
    // Plugin assente (es. piattaforma senza barra di stato): la pagina funziona lo stesso.
  }
}
