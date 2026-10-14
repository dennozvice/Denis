import type { CapacitorConfig } from '@capacitor/cli'

/**
 * App nativa per iPhone (Capacitor): la stessa app web, impacchettata in un progetto Xcode (cartella ios/).
 * Vedi README › "App vera per iPhone".
 */
const config: CapacitorConfig = {
  appId: 'com.dennozvice.ipod',
  appName: 'iPod',
  webDir: 'dist',
  // Sfondo della vista web mentre l'app parte (bianco, come l'iPod argento senza cornice).
  backgroundColor: '#ffffff',
  ios: {
    // La pagina gestisce da sé le aree sicure (env(safe-area-inset-*)), la vista web occupa tutto lo schermo.
    contentInset: 'never',
    // Niente anteprime dei link con pressione prolungata: non è un sito.
    allowsLinkPreview: false,
    // Scorrimento disattivato: l'interfaccia è fissa come su un iPod vero (la pagina non scorre).
    scrollEnabled: false,
  },
}

export default config
