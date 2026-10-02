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

Al primo avvio la dashboard è **vuota**: niente clienti, attività o appuntamenti di esempio. Un riquadro di benvenuto ti guida nei primi passi. Se vuoi prima vedere come funziona, puoi caricare dei dati dimostrativi e cancellarli quando vuoi da **Impostazioni › Inizia da zero**.

## Usarla come app sul Mac (o su iPhone, iPad, Android)

La dashboard si può **installare come app**. Avrai un'icona nel Dock e nel Launchpad, una finestra senza barra del browser, e funziona **anche senza internet**. Gli aggiornamenti arrivano da soli.

- **Mac con Chrome:** apri https://dennozvice.github.io/Denis/ e clicca l'icona di installazione nella barra degli indirizzi (uno schermo con una freccia). In alternativa usa **Impostazioni › Installa l'app**.
- **Mac con Safari:** menu **File › Aggiungi al Dock**.
- **iPhone e iPad:** apri il sito con Safari e tocca **Condividi › Aggiungi alla schermata Home**.
- **Android:** con Chrome, menu ⋮ › **Installa app**.

Ogni dispositivo conserva i propri dati. Su Safari anche il browser e l'app nel Dock hanno dati separati. Per spostarli usa **Esporta backup** e **Importa backup**.

> **Avvertenze**
>
> - È un progetto personale e non ufficiale. Non è affiliato né approvato da alcuna compagnia assicurativa, e non contiene loghi o marchi aziendali.
> - **Fondi, valori quota e indici mostrati di default sono simulati** ("Dati dimostrativi") e non sono quotazioni reali. Per usare valori veri si importano da file CSV (vedi sotto).
> - I valori dimostrativi sono fermi a una data fissa e non si aggiornano: non scambiarli per quotazioni correnti e non mostrarli ai clienti.
> - I dati dimostrativi di clienti, attività e appuntamenti (caricabili a richiesta) sono fittizi, con numeri di telefono non validi, e servono solo a mostrare il funzionamento.
> - I nomi degli indici (FTSE MIB, Euro Stoxx 50, MSCI World…) sono marchi dei rispettivi proprietari e qui sono citati solo come riferimento.

## Avvio rapido

Serve [Node.js](https://nodejs.org/) 22 o superiore.

```bash
npm install
npm run dev
```

Poi apri l'indirizzo che compare nel terminale (di solito <http://localhost:5173>).

**Problemi frequenti**

- **Windows: PowerShell risponde "l'esecuzione di script è disabilitata".** Usa il *Prompt dei comandi* (`cmd`) al posto di PowerShell. In alternativa esegui una volta `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **Ho aperto `dist/index.html` con un doppio clic e la pagina è vuota.** È normale: i browser bloccano gli script dei file locali. Usa `npm run preview`, oppure la versione pubblicata su GitHub Pages.
- **PC aziendale con Node o npm bloccati.** Usa direttamente il sito pubblicato su GitHub Pages: si apre come qualunque pagina web.

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

> **Nota sui siti `github.io`.** Tutti i siti GitHub Pages di uno stesso utente (`https://<utente>.github.io/...`) condividono lo stesso "spazio" nel browser. Un'altra pagina pubblicata sullo stesso account potrebbe quindi leggere i dati salvati. Se usi dati reali conviene una di queste soluzioni:
>
> - avviare l'app in locale (`npm run dev` / `npm run preview`);
> - pubblicarla su un dominio dedicato;
> - non pubblicare altre pagine sullo stesso account.
>
> Se un'azione di pubblicazione fallisce, apri la scheda **Actions** su GitHub: il passaggio in rosso indica cosa non va (lint, test o build).

## Come si usa

| Sezione | Cosa trovi |
|---|---|
| **Panoramica** | La giornata in una schermata: mercati, KPI, attività, agenda, fondi, scadenze, obiettivi, ricorrenze, pratiche, formazione e note rapide |
| **Agenda** | Vista giorno, settimana e mese. Importa ed esporta il calendario in formato `.ics`. Registra l'esito degli incontri e crea il follow-up |
| **Attività** | Elenco completo con ricerca e filtri (stato, categoria, priorità, cliente). Puoi rimandare, completare (con annulla) e modificare |
| **Clienti** | Anagrafica essenziale, contatti, stato degli adempimenti (documento, adeguata verifica, questionario), polizze con PAC, attività, appuntamenti e pratiche collegate |
| **Fondi e mercati** | Dettaglio di ogni fondo (grafico, confronto con il benchmark, volatilità, massimo ribasso), confronto tra fondi, indici, tassi e cambi. Import dei valori reali |
| **Pratiche** | Gestione delle pratiche, più lo scadenzario completo a 30, 60, 90 o 180 giorni |
| **Impostazioni** | Nome, nome dell'app, tema chiaro o scuro, regole dei promemoria, backup, dati dimostrativi a richiesta, installazione come app, cancellazione dei dati e informazioni sulla privacy |

Scorciatoie da tastiera:

- `Ctrl K` (o `/`) per cercare clienti, attività, appuntamenti, pratiche e fondi.
- `Ctrl Z` per annullare l'ultima azione (completamento, rimando, eliminazione…) finché la notifica è visibile.

### Importare i valori reali dei fondi

Da **Fondi e mercati › Importa valori** incolli o carichi un file CSV. Il separatore può essere `;` (consigliato), la tabulazione oppure `,`. La virgola decimale va bene, e le date possono essere `gg/mm/aaaa` oppure `aaaa-mm-gg`.

```csv
id;data;valore
f-bil-prud;30/09/2026;11,82
f-bil-prud;01/10/2026;11,87
Il mio fondo;01/10/2026;8,415
```

- Se l'`id` è quello di un fondo già presente, i valori dimostrativi vengono sostituiti da quelli importati. L'elenco degli ID è nella finestra di import.
  - In quel caso rischio (SRI) e descrizione dimostrativi vengono rimossi, e puoi dare al fondo il suo nome reale.
- Se l'`id` è un nome nuovo, viene creato un nuovo fondo.
- Sono accettati anche valori settimanali o mensili: volatilità e variazioni vengono calcolate in base alla frequenza dei dati.
- Le righe con data futura o con valore quota pari a zero o negativo vengono segnalate prima dell'import.
- Con l'interruttore **Mostra fondi dimostrativi** nascondi i fondi demo e lasci solo i tuoi.

### Importare l'agenda da Outlook o Google Calendar

Da **Agenda › Importa calendario (.ics)** carichi un file `.ics`. Si ottiene così:

- **Outlook:** *File › Salva calendario*.
- **Google Calendar:** *Impostazioni › Importa ed esporta*.

Se reimporti lo stesso file, gli eventi già presenti vengono aggiornati senza duplicati:

- titolo, data, orari e luogo arrivano dal calendario;
- tipo, stato, esito, note e cliente collegato restano quelli che hai impostato nell'app.

Delle serie ricorrenti (riunioni settimanali, anniversari…) viene importata la prossima occorrenza.

Con **Esporta .ics** porti gli appuntamenti nel tuo calendario. Puoi scegliere se includere i nomi dei clienti, le note e gli indirizzi: il file può finire su servizi cloud, quindi includi solo ciò che serve.

## Privacy e dati personali (GDPR)

- I dati sono salvati **solo nel `localStorage` di questo browser**. Non sono cifrati e **non sono sincronizzati tra dispositivi**: quello che inserisci sul PC non compare sul telefono. Per spostarli usa *Esporta backup* e *Importa backup*.
- Se apri l'app in più schede, queste restano allineate tra loro.
- **Prima di inserire dati reali dei clienti** verifica le regole della tua compagnia o agenzia. Potrebbe essere obbligatorio usare solo il CRM ufficiale.
- Non usarla su PC condivisi.
- Evita dati sensibili: informazioni sanitarie, codici fiscali completi, numeri di polizza interi. Per le polizze l'app chiede solo le ultime 4 cifre.
- Fai backup regolari da **Impostazioni › Esporta backup** e conserva il file in un luogo sicuro, perché contiene i dati dei clienti.
- **Impostazioni › Cancella tutti i dati** rimuove ogni informazione da questo browser.
- L'app non contatta server esterni, nemmeno per i caratteri: il font Inter è incluso nell'app.
- Se un giorno i dati salvati risultassero illeggibili, l'app non li sovrascrive. Ne conserva una copia e ti propone di scaricarla, importare un backup o ripartire da zero.
- Se carichi i dati dimostrativi, si aggiornano da soli ogni giorno così le scadenze restano realistiche. Smettono di farlo appena modifichi un cliente, un'attività, un appuntamento o una pratica.

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
