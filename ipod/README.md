# iPod: la tua musica con la ghiera cliccabile

Un lettore musicale che riproduce nel browser un **iPod Classic**: scocca in alluminio (argento o nero), schermo 320×240 con i menu originali, Cover Flow, schermata "In riproduzione" e la **ghiera cliccabile** con cui si fa tutto: si ruota per scorrere, si preme al centro per scegliere, MENU per tornare indietro.

Suona **la tua musica**: file MP3, M4A/AAC, FLAC, WAV, AIFF, OGG presi dal tuo computer. Legge i tag (titolo, artista, album, numero di traccia, genere, compositore) e le copertine, e li organizza come farebbe iTunes.

Tutto funziona nel browser: nessun server, nessun account, nessun file inviato in rete. La musica resta salvata nel browser (IndexedDB), così la ritrovi alla prossima apertura.

Versione pubblicata: <https://dennozvice.github.io/Denis/ipod/>

## Come si usa

**La ghiera**

- **Ruota** (trascina il dito o il mouse in cerchio sull'anello) per scorrere liste, regolare il volume, cercare nel brano. Scorrendo veloce in una lista lunga compare la lettera dell'indice.
- **Tasto centrale**: sceglie la riga. Tenuto premuto su un brano, un album o un artista: lo aggiunge alla playlist **On-The-Go**.
- **MENU**: torna indietro. Tenuto premuto: torna al menu principale.
- **⏮ / ⏭**: brano precedente/successivo. Tenuti premuti: riavvolgimento/avanzamento veloce.
- **▶⏸**: play/pausa. Tenuto premuto 2 secondi: spegne l'iPod (un tasto qualsiasi lo riaccende).
- **Interruttore Hold** (in alto): blocca i tasti; compare il lucchetto.
- Sopra l'iPod funziona anche la **rotella del mouse** o il trackpad.

**Da tastiera**: frecce su/giù = ghiera, Invio = centro, Esc o Backspace = MENU, Spazio o P = play/pausa, frecce sinistra/destra = ⏮/⏭ (tenute premute: avanzamento veloce), H = interruttore Hold.

**Nella schermata In riproduzione**: ruotare la ghiera regola il volume; il tasto centrale passa alla modalità di scorrimento (il rombo sulla barra, ruota per spostarti nel brano), poi alla valutazione a stelle, poi di nuovo alla barra.

## Aggiungere la musica

- Dai pulsanti sotto l'iPod: **Aggiungi musica** (scegli i file) oppure **Aggiungi cartella** (tutta una cartella, sottocartelle comprese). Gli stessi comandi sono in **Impostazioni › Sincronizza musica / Sincronizza cartella**.
- Su Chrome ed Edge la cartella viene ricordata: **Impostazioni › Aggiorna da cartella** importa solo i file nuovi.
- Mentre importa, l'iPod mostra "Sincronizzazione in corso": i brani già presenti vengono saltati, quelli non leggibili contati a parte.
- Senza musica a portata di mano, **Prova con brani dimostrativi** crea dieci brevi pezzi strumentali generati al momento (tre album inventati, con copertine) per provare l'interfaccia. Si cancellano come tutto il resto da **Impostazioni › Cancella tutta la musica**.

I file vengono copiati dentro il browser. Lo spazio disponibile si vede in **Impostazioni › Info**. Browser e profili diversi hanno librerie separate; svuotando i dati del sito la musica va rimossa anche dall'iPod.

## Menu

- **Musica**: Cover Flow, Playlist (con On-The-Go), Artisti, Album, Brani, Generi, Compositori, Audiolibri.
- **Podcast**: i file con genere "Podcast".
- **Extra**: Orologi (fusi orari diversi), Cronometro.
- **Impostazioni**: Info, sincronizzazione, Casuale (brani/album), Ripeti (uno/tutti), EQ (i preset dell'iPod), Retroilluminazione, Luminosità, Clicker (il tic della ghiera), formato ora, Lingua (italiano/inglese), colore dell'iPod, note legali, cancellazione della musica, ripristino.
- **Brani casuali**: tutta la libreria in ordine casuale.
- **In riproduzione**: compare quando c'è un brano caricato.

## Installarla come app

Si installa come le altre app web: su Mac con Chrome dall'icona nella barra degli indirizzi (o dal pulsante **Installa come app** sotto l'iPod), con Safari da **File › Aggiungi al Dock**; su iPhone da **Condividi › Aggiungi alla schermata Home**; su Android dal menu di Chrome › **Installa app**. Una volta installata si apre anche senza connessione. Su iPhone e iPad il volume si regola con i tasti fisici (il browser non permette di cambiarlo via software) e l'equalizzatore non è attivo.

## Sviluppo

Serve [Node.js](https://nodejs.org/) 22 o superiore.

```bash
cd ipod
npm install
npm run dev        # http://localhost:5173
npm run build      # crea dist/
npm run preview    # prova la build
npm test           # test unitari (vitest)
npm run lint       # eslint
npm run typecheck  # tsc
```

`scripts/screenshot.mjs` fotografa l'app con Chromium (richiede Playwright): `node scripts/screenshot.mjs http://localhost:4173 ./shots`.

Struttura di `src/`:

- `core/`: store minimale, impostazioni, pila delle schermate, eventi della ghiera, smistamento degli input, stato di sistema (retroilluminazione, sospensione, Hold).
- `device/`: la scocca (CSS in millimetri reali), la ghiera e la lettura di dito/mouse, tastiera e rotella.
- `screen/`: lo schermo 320×240: barra di stato, liste, pannello diviso, In riproduzione, Cover Flow, Impostazioni, Extra, sincronizzazione.
- `audio/`: motore di riproduzione (coda, casuale, ripeti, equalizzatore, Media Session) e il clicker sintetizzato.
- `library/`: IndexedDB, importazione con lettura dei tag in un worker, copertine, ordinamento, playlist, brani dimostrativi.
- `i18n/`: testi in italiano e inglese.

La pubblicazione su GitHub Pages avviene con il workflow del repository (`.github/workflows/deploy.yml`), che costruisce la dashboard alla radice e questa app in `/ipod/`.

> **Note.** Progetto personale non ufficiale, un omaggio all'iPod Classic. iPod, Cover Flow e Click Wheel sono marchi di Apple Inc.; questo software non è affiliato né approvato da Apple e non contiene loghi o risorse Apple. I brani dimostrativi sono generati dal programma e non riproducono musica esistente.
