# Specchio iPhone

Una versione "fai da te" di **Duplicazione iPhone** per usare il tuo iPhone dal Mac, anche in Europa,
dove la funzione di Apple non è disponibile. È pensata **solo per uso personale** con il tuo iPhone.

L'app ha due modalità e sceglie da sola quella giusta:

| | **Modalità veloce** (consigliata) | **Modalità compatibilità** |
|---|---|---|
| Serve | macOS 26.4+ con **Xcode 27** e **iOS 27** | Xcode e WebDriverAgent (qualsiasi iOS recente) |
| Tocchi e trascinamento | **dal vivo**, come Duplicazione iPhone | circa 0,2 s, il trascinamento parte al rilascio |
| Scorrimento | trackpad e rotella, fluido | a scatti |
| Tastiera | **completa**, tasto per tasto (anche ⌘A, ⌘Z…) | a blocchi |
| Copia e incolla | ⌘V incolla il testo del Mac, ⌘C/⌘X lo riportano sul Mac | ⌘V incolla il testo del Mac |
| Video | stesso canale di Device Hub di Xcode 27 | dal cavo, come QuickTime |
| iPhone bloccato | va sbloccato | va sbloccato per avviare il controllo |

La modalità veloce usa lo stesso canale di **Device Hub di Xcode 27** ed è basata sul progetto open source
[ipb](https://github.com/ipbtools/ipb) (licenza MIT, vedi `Engine/`). Usa interfacce Apple non documentate:
se un aggiornamento la rompe, l'app passa da sola alla modalità compatibilità.

Tutto è automatico: l'app vive nella **barra dei menu** (icona a forma di iPhone), parte quando accendi il Mac
e **apre l'iPhone da sola quando lo colleghi con il cavo**.

## Comandi (modalità veloce)

- **clic** → tocco · **clic tenuto** → pressione prolungata · **trascina** → trascinamento dal vivo
- **scorrimento con trackpad o rotella** → scorre la pagina
- **tastiera del Mac** → scrive sull'iPhone; le scorciatoie con ⌘ (⌘A, ⌘Z, ⌘F…) vanno all'iPhone
- **⌘V** incolla sull'iPhone il testo copiato sul Mac · **⌘C / ⌘X** copiano dall'iPhone al Mac
- **⌘1** Home · **⌘2** App aperte · **⌘3** Spotlight (come Duplicazione iPhone)
- **⇧⌘H** Home · **⌃⇧⌘H** App aperte · **⌘L** Blocca/riattiva · **⌘↑ / ⌘↓** Volume · **⇧⌘S** foto dello schermo
- **⌘0** adatta la finestra · **⌥⌘0** dimensioni reali · **⌘W / ⌘Q** chiude lo specchio

## Cosa serve

- Un Mac con **Xcode** (gratis dal Mac App Store): **Xcode 27** per la modalità veloce
- Un iPhone con **iOS 27** per la modalità veloce (con iOS più vecchi si usa la compatibilità)
- Il cavo USB dell'iPhone
- Per la sola modalità compatibilità: un **Apple ID** (va bene quello gratuito)

## Installazione (una volta sola)

1. **Scarica questa cartella sul Mac** (ad esempio con `git clone`) ed entra nella cartella `iphone-mirror`.

2. **Prepara l'iPhone**
   - Collegalo al Mac, sbloccalo e tocca **Autorizza** quando ti chiede di dare fiducia al computer.
   - Apri Xcode una volta con l'iPhone collegato per prepararlo allo sviluppo.
   - Attiva **Impostazioni › Privacy e sicurezza › Modalità sviluppatore** e riavvia l'iPhone quando richiesto.

3. **Crea e installa l'app**: lancia `./crea-app.sh`. Compila anche lo specchio veloce (serve Xcode 27),
   copia l'app in **Applicazioni** e la apre. Se lo specchio veloce non si compila, l'app funziona lo stesso
   in modalità compatibilità.

4. **Solo per la modalità compatibilità** (facoltativo): firma WebDriverAgent con il tuo Apple ID
   - Esegui `./avvia-wda.sh`: la prima volta scarica WebDriverAgent e lo apre in Xcode.
   - In Xcode: Settings › Accounts › aggiungi il tuo Apple ID.
   - Seleziona il progetto **WebDriverAgent** › target **WebDriverAgentRunner** › scheda **Signing & Capabilities**:
     spunta *Automatically manage signing*, scegli il tuo **Team** e cambia **Bundle Identifier**
     (ad esempio `com.denis.WebDriverAgentRunner`). Fai lo stesso per **WebDriverAgentLib** (solo il Team).
   - Poi rilancia `./crea-app.sh`.

## Uso quotidiano

Collega l'iPhone e **sbloccalo**: dopo pochi secondi si apre la finestra con il suo schermo.

- Se l'iPhone è bloccato, una piccola finestra te lo ricorda: appena lo sblocchi lo specchio si apre da solo.
  Se chiudi quella finestra smette di aspettare (utile se lo lasci in carica): riaprilo con **Mostra iPhone**.
- Chiudendo lo specchio (⌘W) l'app resta nella barra dei menu. Si riapre ricollegando il cavo
  o con **Mostra iPhone** dal menu dell'icona.
- Dal menu dell'icona puoi anche disattivare la **Modalità veloce** (per usare la compatibilità)
  o **Apri all'accesso al Mac**.
- Senza cavo: se l'iPhone è abbinato a Xcode anche in rete, **Mostra iPhone** funziona pure in Wi‑Fi.

## Limiti da conoscere

- **L'iPhone deve essere sbloccato** (anche Device Hub di Xcode lo richiede alle app esterne). Face ID e codice
  non si possono usare dal Mac.
- **Un solo dito**: niente pizzico a due dita.
- I messaggi di sistema (ad esempio le richieste di permesso) potrebbero non rispondere ai clic: toccali sull'iPhone.
- Centro di controllo e Notifiche non hanno ancora una scorciatoia: prova a trascinare dal bordo in alto.
- Un aggiornamento di Xcode o iOS può rompere la modalità veloce: in quel caso, dopo circa un minuto di tentativi
  con il cavo collegato, l'app passa alla compatibilità; basta riscaricare la cartella aggiornata e rilanciare `./crea-app.sh`.
- Non si può pubblicare sull'App Store: è uno strumento personale.

## Problemi comuni

| Problema | Soluzione |
|---|---|
| Non si apre niente collegando l'iPhone | Sbloccalo; poi menu dell'icona › **Mostra iPhone**. |
| "Il tuo Xcode o iOS non supporta lo specchio veloce" | Servono Xcode 27 sul Mac e iOS 27 sull'iPhone; nel frattempo usa la compatibilità. |
| `crea-app.sh` dice che lo specchio non si è compilato | Controlla che Xcode 27 sia selezionato: `sudo xcode-select -s /Applications/Xcode.app`. |
| L'app non si apre ("sviluppatore non identificato") | Clic destro sull'app › Apri. |
| Compatibilità: pallino arancione per più di 2 minuti | Sblocca l'iPhone, poi ⌘R (Riconnetti). Se il messaggio parla di firma, ripeti il passo 4. |

## File

- `Engine/` – lo specchio veloce (basato su ipb, licenza MIT in `Engine/LICENSE-ipb`)
- `Sources/SpecchioiPhone/MirrorEngine.swift` – trova l'iPhone, tiene vivo il collegamento e apre lo specchio
- `Sources/SpecchioiPhone/AppController.swift`, `AppDelegate.swift` – modalità, barra dei menu, apertura automatica
- `Sources/SpecchioiPhone/CaptureManager.swift`, `MirrorView.swift`, `WDAClient.swift`, `WDARunner.swift`,
  `USBMux.swift` – modalità compatibilità (video dal cavo + WebDriverAgent)
- `crea-app.sh` – crea e installa l'app · `avvia-wda.sh` – WebDriverAgent per la modalità compatibilità
