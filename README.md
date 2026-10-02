# Advisor Desk: la dashboard del consulente

Una dashboard personale per il consulente assicurativo-finanziario. In una sola schermata mostra:

- **le attività di oggi**, con le priorità e quelle in ritardo;
- **l'agenda degli appuntamenti**, con la timeline del giorno e il calendario mensile;
- **l'andamento dei fondi e i principali indici di mercato**, con grafici e variazioni per periodo;
- **le scadenze e gli adempimenti**: documenti scaduti, adeguata verifica antiriciclaggio, questionario di adeguatezza, polizze in scadenza, reclami;
- **le ricorrenze e i clienti da ricontattare**;
- **le pratiche aperte**: riscatti, sinistri, liquidazioni, switch, reclami;
- **gli obiettivi di produzione e la formazione IVASS**.

L'app funziona tutta nel browser. Non c'è un server, non serve un login e nessun dato viene inviato in rete.

> **Avvertenze**
>
> - È un progetto personale e non ufficiale. Non è affiliato né approvato da alcuna compagnia assicurativa, e non contiene loghi o marchi aziendali.
> - **Fondi, valori quota e indici mostrati di default sono simulati** ("Dati dimostrativi") e non sono quotazioni reali. Per usare valori veri si importano da file CSV (vedi sotto).
> - Anche i clienti precaricati sono fittizi e servono solo a mostrare il funzionamento.

## Avvio rapido

Serve [Node.js](https://nodejs.org/) 22 o superiore.

```bash
npm install
npm run dev
```

Poi apri l'indirizzo che compare nel terminale (di solito <http://localhost:5173>).

Per creare la versione da pubblicare:

```bash
npm run build      # crea la cartella dist/
npm run preview    # prova la build in locale
```

## Pubblicazione su GitHub Pages

Il workflow `.github/workflows/deploy.yml` fa due cose:

- a ogni pull request controlla il codice (lint, tipi, test, build);
- a ogni push sul branch `main` pubblica il sito.

La prima volta va attivato:

1. Su GitHub apri **Settings › Pages**.
2. In **Build and deployment** scegli **Source: GitHub Actions**.
3. Fai un push su `main`, oppure avvia il workflow a mano da **Actions › Verifica e pubblica › Run workflow**.

Il sito sarà su `https://<utente>.github.io/<repository>/`.

Il sito pubblicato è pubblico ma **contiene solo il codice**. I dati che inserisci restano nel browser di chi li inserisce.

## Come si usa

| Sezione | Cosa trovi |
|---|---|
| **Panoramica** | La giornata in una schermata: mercati, KPI, attività, agenda, fondi, scadenze, obiettivi, ricorrenze, pratiche, formazione e note rapide |
| **Agenda** | Vista giorno, settimana e mese. Importa ed esporta il calendario in formato `.ics`. Registra l'esito degli incontri e crea il follow-up |
| **Attività** | Elenco completo con ricerca e filtri (stato, categoria, priorità, cliente). Puoi rimandare, completare (con annulla) e modificare |
| **Clienti** | Anagrafica essenziale, contatti, stato degli adempimenti (documento, adeguata verifica, questionario), polizze con PAC, attività, appuntamenti e pratiche collegate |
| **Fondi e mercati** | Dettaglio di ogni fondo (grafico, confronto con il benchmark, volatilità, massimo ribasso), confronto tra fondi, indici, tassi e cambi. Import dei valori reali |
| **Pratiche** | Gestione delle pratiche, più lo scadenzario completo a 30, 60, 90 o 180 giorni |
| **Impostazioni** | Nome, nome dell'app, tema chiaro o scuro, regole dei promemoria, backup, ripristino della demo, cancellazione dei dati e informazioni sulla privacy |

Scorciatoie da tastiera: `Ctrl K` (o `/`) per cercare clienti, attività, appuntamenti, pratiche e fondi.

### Importare i valori reali dei fondi

Da **Fondi e mercati › Importa valori** incolli o carichi un file CSV. Il separatore può essere `;` (consigliato), la tabulazione oppure `,`. La virgola decimale va bene, e le date possono essere `gg/mm/aaaa` oppure `aaaa-mm-gg`.

```csv
id;data;valore
f-bil-prud;30/09/2026;11,82
f-bil-prud;01/10/2026;11,87
Il mio fondo;01/10/2026;8,415
```

- Se l'`id` è quello di un fondo già presente, i valori dimostrativi vengono sostituiti da quelli importati. L'elenco degli ID è nella finestra di import.
- Se l'`id` è un nome nuovo, viene creato un nuovo fondo.

### Importare l'agenda da Outlook o Google Calendar

Da **Agenda › Importa calendario (.ics)** carichi un file `.ics`. Si ottiene così:

- **Outlook:** *File › Salva calendario*.
- **Google Calendar:** *Impostazioni › Importa ed esporta*.

Se reimporti lo stesso file, gli eventi già presenti vengono aggiornati senza duplicati. Con **Esporta .ics** porti invece gli appuntamenti nel tuo calendario.

## Privacy e dati personali (GDPR)

- I dati sono salvati **solo nel `localStorage` di questo browser**. Non sono cifrati e non sono sincronizzati tra dispositivi.
- **Prima di inserire dati reali dei clienti** verifica le regole della tua compagnia o agenzia. Potrebbe essere obbligatorio usare solo il CRM ufficiale.
- Non usarla su PC condivisi.
- Evita dati sensibili: informazioni sanitarie, codici fiscali completi, numeri di polizza interi. Per le polizze l'app chiede solo le ultime 4 cifre.
- Fai backup regolari da **Impostazioni › Esporta backup** e conserva il file in un luogo sicuro, perché contiene i dati dei clienti.
- **Impostazioni › Cancella tutti i dati** rimuove ogni informazione da questo browser.

## Personalizzazione

- **Nome, agenzia e nome dell'app:** da Impostazioni.
- **Colori:** sono tutti definiti in `src/styles/tokens.css`, con un tema chiaro e uno scuro. Basta cambiare i valori.
- **Validità del questionario di adeguatezza** (24 mesi di default) e **soglia per ricontattare i clienti** (180 giorni): da Impostazioni.

## Per sviluppatori

```bash
npm run dev         # server di sviluppo
npm run typecheck   # controllo dei tipi TypeScript
npm run lint        # ESLint
npm test            # test (Vitest)
npm run build       # build di produzione in dist/
node scripts/screenshot.mjs http://localhost:4173 ./shots   # screenshot desktop/tablet/mobile (richiede Playwright)
```

**Stack:** Vite, React 19, TypeScript e le icone `lucide-react`. Non ci sono altre dipendenze: grafici e calendario sono scritti a mano in SVG e CSS.

### Struttura

```
src/
  domain/      tipi del modello dati ed etichette in italiano
  lib/         date (fuso Europe/Rome), formattazione it-IT, calcoli finanziari, CSV, ICS
  data/        dati dimostrativi, provider dei dati di mercato, salvataggio nel browser
  store/       stato dell'app (reducer + context), orologio, dati di mercato, selettori
  router/      router a hash (#/agenda, #/clienti?id=…), compatibile con GitHub Pages
  components/  layout (sidebar, topbar, nav mobile), componenti UI, grafici
  features/    una cartella per area: home, tasks, agenda, funds, clients, cases, deadlines, settings, shell
  styles/      design tokens, stili di base, layout
```

### Collegare una fonte dati reale

I dati di mercato passano dall'interfaccia `MarketDataProvider` (`src/data/market/provider.ts`). Per usare una fonte vera (un servizio interno o un'API di quotazioni) si implementa `getInstruments(asOf)` e si passa il provider a `<MarketProvider provider={…}>` in `src/App.tsx`.

Le serie importate via CSV restano sovrapposte a quelle del provider.

Per il calendario, un'integrazione diretta con Outlook o Microsoft 365 passerebbe da Microsoft Graph. Serve però una registrazione dell'app nel tenant aziendale, da concordare con l'IT. Nel frattempo si usa l'import/export `.ics`.

### Date e fusi orari

- Le date di calendario sono stringhe `YYYY-MM-DD` riferite a Europe/Rome; gli orari sono `HH:mm`.
- Tutta l'aritmetica sulle date passa da `src/lib/dates.ts`, che è immune al cambio dell'ora legale.
- Non si usa mai `new Date('YYYY-MM-DD')`.
