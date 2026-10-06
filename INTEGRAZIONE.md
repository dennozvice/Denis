# Advisor Desk: guida per integrarla in un'altra app

Questa guida è per chi sviluppa un'altra applicazione (per esempio **FinAdvisor**) e vuole aggiungere Advisor Desk come sezione o modulo. Per l'uso quotidiano e le funzioni vedi il [README](README.md).

## In breve

- **Che cos'è:** una dashboard per il consulente assicurativo-finanziario. Comprende attività, agenda, clienti con adempimenti (documenti, antiriciclaggio, adeguatezza), polizze e PAC, pratiche, scadenzario, fondi e mercati, obiettivi e formazione IVASS. È tutta in italiano.
- **Tecnologia:** Vite, React 19 e TypeScript (strict). Usa solo `lucide-react` per le icone e `@fontsource/inter` per il font. Non ci sono librerie di stato, UI o grafici: grafici e calendario sono in SVG e CSS scritti a mano.
- **Niente server:** non c'è backend né login, e nessuna chiamata di rete. I dati stanno nel `localStorage` del browser.
- **Qualità:** 419 test (Vitest), ESLint e controllo dei tipi passano tutti.

## Avvio in due minuti

Serve Node.js 22 o superiore.

```bash
npm install
npm run dev          # http://localhost:5173
```

Altri comandi utili:

```bash
npm run typecheck    # controllo dei tipi
npm run lint         # ESLint
npm test             # test
npm run build        # build statica in dist/
npm run preview      # prova la build
```

## Tre modi per aggiungerla a FinAdvisor

Sono in ordine, dal più semplice al più profondo.

### A. Come sottosezione statica, con un link o un iframe

È il modo più rapido: non si modifica nulla.

1. Esegui `npm run build`.
2. Copia il contenuto di `dist/` in una cartella servita da FinAdvisor, per esempio `/advisor-desk/`.
   - La build usa percorsi relativi (`base: './'` in `vite.config.ts`), quindi funziona in qualunque sottocartella.
   - Le rotte interne usano l'hash (`#/agenda`, `#/clienti?id=…`), quindi il server non ha bisogno di regole di rewrite.
3. Collegala dal menu di FinAdvisor con un link, oppure incorporala in un `<iframe src="/advisor-desk/">`.

Da sapere:

- **Dati.** Se gira sullo stesso dominio di FinAdvisor, condivide il `localStorage` dell'origine. Tutte le chiavi però hanno il prefisso `advisor-desk:` e non si sovrappongono a quelle di altre app.
- **Service worker.** `sw.js` serve per l'uso offline e controlla solo la cartella in cui si trova. Se non serve, togli la registrazione in `src/lib/pwa.ts` e il file `public/sw.js`.

### B. Come sezione nativa dentro un'app React

Copia `src/` in una cartella del progetto (per esempio `src/advisor-desk/`) e monta il componente `<App />` di `src/App.tsx` dove deve comparire.

L'app è nata per stare da sola, quindi alcuni punti toccano la pagina intera. Vanno adattati:

| Punto | Dove | Cosa fare |
|---|---|---|
| Stili globali su `body`, `h1`–`h4`, `a`, `*` | `src/styles/base.css`, `src/styles/layout.css` | Limitarli a un contenitore, per esempio anteponendo `.advisor-desk` ai selettori |
| Variabili colore su `:root` e `:root[data-theme='dark']` | `src/styles/tokens.css` | Spostarle sul contenitore, o allinearle ai colori di FinAdvisor |
| Tema chiaro/scuro scritto su `<html data-theme>` | `src/components/layout/useTheme.ts`, script in `index.html` | Usare il tema di FinAdvisor, oppure applicare l'attributo al contenitore |
| Titolo della scheda (`document.title`) | `src/App.tsx` | Togliere, se lo gestisce FinAdvisor |
| Router a hash (`#/agenda`) | `src/router/router.ts` | È l'unico punto da cambiare: `useRoute`, `navigate` e `buildHref` si possono collegare al router di FinAdvisor |
| Menu laterale, barra in alto, navigazione mobile | `src/components/layout/AppShell.tsx` | Se FinAdvisor ha già il suo menu, togliere `Sidebar` e `MobileNav` e mostrare solo le pagine |
| Scorciatoie da tastiera (`Ctrl K`, `/`, `Ctrl Z`, `Esc`) | `GlobalSearch.tsx`, `Toast.tsx`, `NotificationsMenu.tsx`, `MobileNav.tsx` | Verificare che non si scontrino con quelle di FinAdvisor |
| Font, service worker, pulsante "Installa l'app" | `src/main.tsx`, `src/lib/pwa.ts` | Non chiamare `setupPwa()` e non importare i font se FinAdvisor ha già i suoi |

Le pagine (`HomePage`, `AgendaPage`, `TasksPage`, `ClientsPage`, `FundsPage`, `CasesPage`, `SettingsPage`) funzionano dentro questi provider, nell'ordine di `src/App.tsx`: `StoreProvider` › `NowProvider` › `MarketProvider` › `ToastProvider`.

### C. In un'app non React, oppure solo la logica

La logica non dipende dall'interfaccia ed è coperta dai test, quindi si può riusare anche in un altro stack:

- `src/domain/`: tipi del modello dati ed etichette in italiano;
- `src/lib/`: date nel fuso Europe/Rome (immuni all'ora legale), formattazione it-IT, calcoli finanziari (rendimenti, volatilità, massimo ribasso), lettura CSV, import/export ICS;
- `src/store/reducer.ts` e `src/store/selectors.ts`: tutte le azioni sui dati e i calcoli derivati;
- `src/features/*/*Utils.ts` e `*Logic.ts`: scadenze, ricorrenze, KPI, filtri e ricerca.

Basta riscrivere l'interfaccia.

## Dati

### Dove sono salvati

| Chiave `localStorage` | Contenuto |
|---|---|
| `advisor-desk:data` | Tutti i dati dell'utente (tipo `AppData`) |
| `advisor-desk:market-imports` | Valori dei fondi importati da CSV |
| `advisor-desk:data.bak*` | Copia di sicurezza, se i dati salvati risultano illeggibili |
| `advisor-desk:empty-start` | Segnala che la partenza "vuota" è già stata applicata |

Il salvataggio passa tutto da `src/data/persistence.ts` (`loadAppDataResult`, `saveAppData`) ed è chiamato da `src/store/StoreContext.tsx`.

### Collegarla al database di FinAdvisor

Per salvare sul server invece che nel browser bisogna sostituire, in `StoreContext.tsx`:

- la lettura iniziale (`loadAppDataResult`), con una chiamata alle API di FinAdvisor;
- la scrittura (`saveAppData`, già ritardata di 300 ms), con un salvataggio sulle API.

Il resto dell'app non cambia.

Clienti, attività e appuntamenti hanno un `id` di tipo stringa. Se FinAdvisor ha già un'anagrafica clienti, si possono usare i suoi ID.

### Formato dei dati

Il modello completo è in `src/domain/types.ts`: `AppData` con `schemaVersion: 1`, `tasks`, `appointments`, `clients` (con `policies`), `cases`, `goals`, `training`, `settings` e `quickNote`.

- Le date sono stringhe `YYYY-MM-DD` (fuso Europe/Rome).
- Gli orari sono stringhe `HH:mm`.

`normalizeAppData` (in `persistence.ts`) valida qualunque JSON in ingresso e scarta i record malformati. Va usata anche per i dati che arrivano da un server.

### Migrare i dati di chi la usa già

Da **Impostazioni › Esporta backup** l'utente scarica un file JSON con tutti i dati, nello stesso formato `AppData`. Quel file si può importare in FinAdvisor.

## Dati di mercato

I fondi e gli indici mostrati di default sono **simulati** e portano il badge "Dati dimostrativi". Per usare le quotazioni di FinAdvisor:

1. Implementa l'interfaccia `MarketDataProvider` di `src/data/market/provider.ts`. Ha un solo metodo: `getInstruments(asOf)`, che restituisce gli strumenti con la serie storica.
2. Passa il provider a `<MarketProvider provider={…}>` in `src/App.tsx`.

## Attenzioni

- **Dati personali (GDPR).** Contiene anagrafiche e adempimenti dei clienti. Se i dati passano su un server, servono cifratura, controllo degli accessi e le verifiche privacy della compagnia o agenzia. Per le polizze l'app salva solo le ultime 4 cifre del numero.
- **Marchi.** È un progetto personale. Non contiene loghi né marchi di compagnie e non è affiliato ad alcuna di esse. I nomi degli indici (FTSE MIB, MSCI World…) sono citati solo come riferimento.
- **Date.** Non usare mai `new Date('YYYY-MM-DD')`: tutta l'aritmetica sulle date passa da `src/lib/dates.ts`.
