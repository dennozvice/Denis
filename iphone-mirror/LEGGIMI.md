# Specchio iPhone

Una versione "fai da te" di **Duplicazione iPhone** per usare il tuo iPhone dal Mac, anche in Europa,
dove la funzione di Apple non è disponibile. È pensata **solo per uso personale** con il tuo iPhone.

## Come funziona

| Cosa | Come |
|---|---|
| **Vedere** lo schermo | Stesso sistema di QuickTime: l'immagine arriva dal cavo USB, in tempo reale. |
| **Toccare / scrivere** | Anche questo passa dal cavo, grazie a [WebDriverAgent](https://github.com/appium/WebDriverAgent), lo strumento open source di Appium: un piccolo programma di test che gira sull'iPhone e riceve comandi di tocco e testo dal Mac. |

Tutto è automatico: l'app vive nella **barra dei menu** (icona a forma di iPhone), parte quando accendi il Mac
e **apre la finestra da sola quando colleghi l'iPhone**. I comandi passano dal cavo e WebDriverAgent
viene avviato (e riavviato se si ferma) dall'app stessa: non serve tenere aperto il Terminale.

Comandi:

- **clic** → tocco · **clic tenuto** → pressione prolungata · **trascina** → swipe
- **scorrimento con trackpad o rotella** → scorre la pagina
- **tastiera del Mac** → scrive nel campo attivo · **⌘V** → incolla sull'iPhone il testo copiato sul Mac
- pulsanti in basso e menu **iPhone**: Indietro (⇧⌘B), Home (⇧⌘H), App aperte (⇧⌘A), Centro di controllo (⇧⌘C),
  Notifiche (⇧⌘N), Volume (⇧⌘+ / ⇧⌘-), Blocca (⇧⌘L), Riconnetti (⌘R)

## Cosa serve

- Un Mac con macOS 13 o successivo e **Xcode** (gratis dal Mac App Store)
- Un **Apple ID** (va bene quello gratuito; vedi i limiti sotto)
- Il cavo USB dell'iPhone

## Installazione (una volta sola)

1. **Scarica questa cartella sul Mac** (ad esempio con `git clone`) ed entra nella cartella `iphone-mirror`.

2. **Prepara l'iPhone**
   - Collegalo al Mac, sbloccalo e tocca **Autorizza** quando ti chiede di dare fiducia al computer.
   - Apri Xcode una volta con l'iPhone collegato (Window › Devices and Simulators) per prepararlo allo sviluppo.
   - Attiva **Impostazioni › Privacy e sicurezza › Modalità sviluppatore** e riavvia l'iPhone quando richiesto.

3. **Firma WebDriverAgent con il tuo Apple ID**
   - Esegui `./avvia-wda.sh`: la prima volta scarica WebDriverAgent e lo apre in Xcode.
   - In Xcode: Settings › Accounts › aggiungi il tuo Apple ID.
   - Seleziona il progetto **WebDriverAgent** › target **WebDriverAgentRunner** › scheda **Signing & Capabilities**:
     - spunta *Automatically manage signing* e scegli il tuo **Team** (il tuo nome, "Personal Team");
     - cambia **Bundle Identifier** in qualcosa di tuo, ad esempio `com.denis.WebDriverAgentRunner`.
   - Fai lo stesso per il target **WebDriverAgentLib** (solo il Team).

4. **Crea e installa l'app**: chiudi eventuali finestre con `./avvia-wda.sh` (Ctrl+C) e lancia `./crea-app.sh`.
   L'app viene copiata in **Applicazioni** e si apre. Al primo avvio macOS chiede il permesso della *Fotocamera*:
   serve per ricevere l'immagine dell'iPhone, quindi accettalo.

## Uso quotidiano

Collega l'iPhone: la finestra si apre da sola. Il pallino in basso diventa **verde** quando puoi controllarlo.

- La **prima volta** l'app prepara WebDriverAgent (1–2 minuti); poi parte in pochi secondi.
- Se il pallino resta arancione, leggi il messaggio accanto: di solito basta **sbloccare l'iPhone**.
- Se l'iPhone dice "Sviluppatore non attendibile": **Impostazioni › Generali › VPN e gestione dispositivi**,
  tocca il tuo Apple ID e scegli **Autorizza**.
- Chiudendo la finestra l'app resta nella barra dei menu. Da lì puoi riaprirla, uscire o disattivare
  **Apri all'accesso al Mac**.
- Senza cavo puoi usare il Wi‑Fi: rotellina ⚙︎ in basso › scrivi l'indirizzo mostrato da `./avvia-wda.sh`.

## Limiti da conoscere

- **Apple ID gratuito**: la firma di WebDriverAgent scade dopo **7 giorni**. L'app prova a rifirmarlo da sola;
  se non ci riesce, apri Xcode una volta (con l'account collegato) e premi **⌘R** nell'app.
  Con l'Apple Developer Program a pagamento dura un anno.
- **Serve il cavo**: senza cavo non vedi lo schermo.
- I tocchi arrivano con un piccolo ritardo (circa 0,1–0,3 s) e i trascinamenti vengono inviati quando rilasci il mouse,
  quindi giochi e disegno a mano libera non vanno bene.
- Face ID non si può usare dal Mac. Se l'iPhone si blocca mentre il controllo è attivo vedi la schermata di blocco
  e puoi provare a inserire il codice cliccando; per avviare il controllo la prima volta l'iPhone deve essere sbloccato.
- In **orizzontale** la posizione dei tocchi può essere imprecisa con alcune app.
- Non si può pubblicare sull'App Store: è uno strumento personale.

## Problemi comuni

| Problema | Soluzione |
|---|---|
| "In attesa dell'iPhone…" non sparisce | Scollega e ricollega il cavo, sblocca l'iPhone, chiudi QuickTime se lo stai usando. |
| Pallino arancione per più di 2 minuti | Sblocca l'iPhone, poi ⌘R (Riconnetti). Se il messaggio parla di firma, ripeti il passo 3. |
| Per capire l'errore | Lancia `./avvia-wda.sh` nel Terminale: mostra i messaggi di Xcode. |
| L'app non si apre ("sviluppatore non identificato") | Clic destro sull'app › Apri. |

## File

- `Sources/SpecchioiPhone/CaptureManager.swift` – riceve il video dell'iPhone
- `Sources/SpecchioiPhone/MirrorView.swift` – mostra il video e traduce mouse/tastiera
- `Sources/SpecchioiPhone/WDAClient.swift` – invia tocchi e testo a WebDriverAgent
- `Sources/SpecchioiPhone/WDARunner.swift` – avvia WebDriverAgent sull'iPhone e lo riavvia se si ferma
- `Sources/SpecchioiPhone/USBMux.swift` – collegamento con l'iPhone attraverso il cavo
- `Sources/SpecchioiPhone/AppController.swift`, `AppDelegate.swift` – automatismi, barra dei menu, apertura all'accesso
- `crea-app.sh` – crea e installa l'app · `avvia-wda.sh` – prima installazione e diagnosi di WebDriverAgent
