# Specchio iPhone

Una versione "fai da te" di **Duplicazione iPhone** per usare il tuo iPhone dal Mac, anche in Europa,
dove la funzione di Apple non è disponibile. È pensata **solo per uso personale** con il tuo iPhone.

## Come funziona

| Cosa | Come |
|---|---|
| **Vedere** lo schermo | Stesso sistema di QuickTime: l'immagine arriva dal cavo USB, in tempo reale. |
| **Toccare / scrivere** | [WebDriverAgent](https://github.com/appium/WebDriverAgent), lo strumento open source di Appium: un piccolo programma di test che gira sull'iPhone e riceve comandi di tocco e testo dal Mac. |

Comandi:

- **clic** → tocco · **clic tenuto** → pressione prolungata · **trascina** → swipe
- **scorrimento con trackpad o rotella** → scorre la pagina
- **tastiera del Mac** → scrive nel campo attivo · **⌘V** → incolla sull'iPhone il testo copiato sul Mac
- menu **iPhone** e pulsanti in basso: Home (⇧⌘H), App aperte (⇧⌘A), Centro di controllo (⇧⌘C),
  Notifiche (⇧⌘N), Volume, Blocca (⇧⌘L)

## Cosa serve

- Un Mac con macOS 13 o successivo e **Xcode** (gratis dal Mac App Store)
- Un **Apple ID** (va bene quello gratuito; vedi i limiti sotto)
- Il cavo USB dell'iPhone
- Facoltativo ma consigliato: [Homebrew](https://brew.sh) e `brew install libimobiledevice` (fornisce `iproxy`)

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

4. **Crea l'app per Mac**: `./crea-app.sh` → trovi `build/Specchio iPhone.app` (trascinala in Applicazioni se vuoi).

## Uso quotidiano

1. Collega l'iPhone con il cavo e sbloccalo.
2. In un Terminale: `./avvia-wda.sh` e lascialo aperto. Quando compare **✅ WebDriverAgent è pronto**, sei a posto.
   - La prima volta l'iPhone potrebbe dire "Sviluppatore non attendibile": vai in
     **Impostazioni › Generali › VPN e gestione dispositivi**, tocca il tuo Apple ID e scegli **Autorizza**, poi rilancia lo script.
3. Apri **Specchio iPhone**. Al primo avvio macOS chiede il permesso della *Fotocamera*: serve per ricevere l'immagine dell'iPhone, quindi accettalo.
4. Il pallino in basso diventa **verde** quando puoi controllare l'iPhone. L'indirizzo è `http://localhost:8100`;
   se non hai installato `iproxy`, scrivi l'indirizzo Wi‑Fi mostrato dallo script (es. `http://192.168.1.23:8100`) e premi **Connetti**.

## Limiti da conoscere

- **Apple ID gratuito**: la firma di WebDriverAgent scade dopo **7 giorni**. Quando smette di funzionare, rilancia
  `./avvia-wda.sh` (rifirma da solo). Con l'Apple Developer Program a pagamento dura un anno.
- **Il video passa dal cavo**: senza cavo non vedi lo schermo (i comandi funzionerebbero anche in Wi‑Fi).
- I tocchi arrivano con un piccolo ritardo (circa 0,1–0,3 s) e i trascinamenti vengono inviati quando rilasci il mouse,
  quindi giochi e disegno a mano libera non vanno bene.
- Non può inserire il **codice di sblocco** né usare Face ID: sblocca l'iPhone a mano. "Sblocca" nel menu funziona solo se l'iPhone non ha codice.
- In **orizzontale** la posizione dei tocchi può essere imprecisa con alcune app.
- Non si può pubblicare sull'App Store: è uno strumento personale.

## Problemi comuni

| Problema | Soluzione |
|---|---|
| "In attesa dell'iPhone…" non sparisce | Scollega e ricollega il cavo, sblocca l'iPhone, chiudi QuickTime se lo stai usando. |
| Pallino rosso / "WebDriverAgent non risponde" | Controlla che `./avvia-wda.sh` sia in esecuzione e mostri ✅; se non usi `iproxy`, usa l'indirizzo Wi‑Fi. |
| Errore di firma in `avvia-wda.sh` | Ripeti il passo 3 (Team e Bundle Identifier). |
| L'app non si apre ("sviluppatore non identificato") | Clic destro sull'app › Apri. |

## File

- `Sources/SpecchioiPhone/CaptureManager.swift` – riceve il video dell'iPhone
- `Sources/SpecchioiPhone/MirrorView.swift` – mostra il video e traduce mouse/tastiera
- `Sources/SpecchioiPhone/WDAClient.swift` – invia tocchi e testo a WebDriverAgent
- `crea-app.sh` – crea l'app · `avvia-wda.sh` – avvia WebDriverAgent sull'iPhone
