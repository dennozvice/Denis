import Darwin
import Foundation

/// Motore veloce: lo stesso canale usato da Device Hub di Xcode 27 (CoreDevice), con tocchi dal vivo.
/// La finestra con lo schermo dell'iPhone è un programma a parte ("specchio", in Engine/), che questa
/// classe avvia: trova l'iPhone con `devicectl`, tiene vivo il collegamento e lo riavvia se si chiude.
/// Va usata solo dal thread principale.
final class MirrorEngine: ObservableObject {
    enum State: Equatable {
        case unavailable      // manca lo specchio nell'app o Xcode 27
        case paused           // modalità veloce disattivata
        case waiting          // nessun iPhone collegato
        case starting
        case running
        case locked
        case closed           // l'utente ha chiuso la finestra
        case failed(String)
    }

    struct Device: Equatable {
        let id: String        // identificativo CoreDevice (non l'UDID)
        let name: String
        let productType: String
        let osMajor: Int?
        let wired: Bool
        let tunnelConnected: Bool
        let tunnelAddress: String?
    }

    @Published private(set) var state: State = .unavailable
    @Published private(set) var device: Device?
    /// iPhone con iOS precedente al 27 o avvii falliti di continuo: serve la modalità compatibilità.
    @Published private(set) var unsupported = false
    /// L'utente vuole vedere l'iPhone (cavo appena collegato o «Mostra iPhone»).
    @Published private(set) var wantsOpen = false
    /// Lo specchio si sta riaprendo da solo dopo un'interruzione (ad esempio l'iPhone si è bloccato
    /// durante l'uso), non perché l'utente l'ha chiesto: gli avvisi non devono rubare la tastiera.
    private(set) var reopening = false

    /// Chiamato quando l'iPhone viene collegato con il cavo.
    var onWiredConnect: (() -> Void)?
    /// Chiamato subito prima di avviare lo specchio (per passargli il primo piano).
    var willLaunchMirror: (() -> Void)?

    static let devicectlPath = "/Library/Developer/PrivateFrameworks/CoreDevice.framework/Resources/bin/devicectl"

    /// Lo specchio viene messo dentro l'app da crea-app.sh.
    static var helperURL: URL? {
        let url = Bundle.main.bundleURL
            .appendingPathComponent("Contents/Helpers/Specchio Mirror.app/Contents/MacOS/specchio-mirror")
        return FileManager.default.isExecutableFile(atPath: url.path) ? url : nil
    }

    static var isInstalled: Bool {
        helperURL != nil && FileManager.default.fileExists(atPath: "/Library/Developer/PrivateFrameworks/CoreDevice.framework")
    }

    /// Processo della finestra dello specchio, se è aperta.
    var helperProcessIdentifier: pid_t? {
        helper?.processIdentifier
    }

    private let queue = DispatchQueue(label: "specchio.engine")
    private var timer: Timer?
    private var active = false
    private var helper: Process?
    private var keepalive: Process?
    private var listing = false
    private var launching = false
    private var stopping = false
    /// Cambia a ogni avvio (e quando si annulla): i risultati di un avvio vecchio vengono ignorati.
    private var attempt = 0
    /// Cambia a ogni specchio avviato: righe e devicectl di uno specchio già chiuso vengono ignorati.
    private var runID = 0
    private var failures = 0
    private var firstFailure: Date?
    private var lastFailure: Date?
    private var lockedRounds = 0
    private var keepaliveFailures = 0
    private var nextAttempt = Date.distantPast
    private var readyAt: Date?
    private var sawLocked = false
    private var recentLines: [String] = []
    // Ricerca dell'iPhone: usbmuxd (immediato) dice quando serve chiedere a devicectl (più pesante).
    private var usbIDs: [Int]?
    private var nextListing = Date.distantPast
    private var watchUntil = Date.distantPast
    private var missedOnce = false

    // MARK: - Comandi

    /// Attiva o sospende il motore (menu «Modalità veloce»).
    func setActive(_ value: Bool) {
        guard Self.isInstalled else {
            state = .unavailable
            return
        }
        guard value != active else { return }
        active = value
        if value {
            state = .waiting
            timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
                self?.poll()
            }
            poll()
        } else {
            timer?.invalidate()
            timer = nil
            wantsOpen = false
            stop()
            state = .paused
        }
    }

    /// Mostra l'iPhone: menu «Mostra iPhone» oppure cavo appena collegato.
    func open() {
        guard active else { return }
        wantsOpen = true
        reopening = false
        nextAttempt = .distantPast
        resetFailures()
        if helper == nil, !launching, state == .closed || state == .waiting {
            state = device == nil ? .waiting : .starting
        }
        poll()
    }

    /// Chiude lo specchio e il collegamento (uscita dall'app o cambio di modalità).
    func stop() {
        attempt += 1
        if let running = helper {
            stopping = true
            running.terminate()
        }
        stopKeepalive()
    }

    /// Riprova da capo dopo un errore.
    func retry() {
        resetFailures()
        lockedRounds = 0
        unsupported = false
        open()
    }

    /// La finestra di stato è stata chiusa: niente più tentativi (ad esempio con l'iPhone bloccato
    /// in carica tutta la notte) finché non si ricollega il cavo o si sceglie «Mostra iPhone».
    /// Un avvio già in corso arriva fino in fondo; uno specchio già aperto resta aperto.
    func dismiss() {
        guard active, wantsOpen, state != .running else { return }
        wantsOpen = false
        nextAttempt = .distantPast
        resetFailures()
        guard helper == nil else { return }
        if launching && state == .starting { return }
        attempt += 1
        launching = false
        state = device == nil ? .waiting : .closed
    }

    // MARK: - Ricerca dell'iPhone

    private func poll() {
        guard active, !listing, !launching, helper == nil else { return }
        let known = usbIDs
        let now = Date()
        // devicectl solo quando serve: per riprovare ad aprire lo specchio, subito dopo che il cavo
        // è stato collegato o scollegato, e altrimenti una volta al minuto (iPhone in Wi‑Fi).
        let due = wantsOpen && !unsupported ? now >= nextAttempt : (now >= nextListing || now < watchUntil)
        listing = true
        queue.async {
            // usbmuxd risponde subito, senza avviare programmi.
            let ids = USBMux.devices().map(\.id).sorted()
            let changed = ids != known
            let devices = due || changed ? Self.listDevices() : nil
            DispatchQueue.main.async {
                self.listing = false
                self.usbIDs = ids
                if changed {
                    // CoreDevice vede l'iPhone qualche secondo dopo usbmuxd: per un po' si controlla spesso.
                    self.watchUntil = Date().addingTimeInterval(60)
                    if ids.contains(where: { !(known ?? []).contains($0) }) { self.nextAttempt = .distantPast }
                }
                guard due || changed else { return }
                self.nextListing = Date().addingTimeInterval(60)
                // devicectl non ha risposto o è andato in errore: non vuol dire che l'iPhone sia stato scollegato.
                guard let devices else { return }
                self.update(devices, cableAttached: !ids.isEmpty)
                if (self.device?.wired == true) == !ids.isEmpty { self.watchUntil = .distantPast }
            }
        }
    }

    private func update(_ devices: [Device], cableAttached: Bool) {
        guard active else { return }
        let found = devices.first { $0.wired } ?? devices.first { $0.tunnelConnected } ?? devices.first
        let previous = device

        guard let found else {
            // Un elenco vuoto con il cavo ancora collegato può essere un attimo di CoreDevice:
            // l'iPhone si considera scollegato solo alla seconda volta di fila.
            if previous != nil, cableAttached, !missedOnce {
                missedOnce = true
                nextListing = .distantPast // si ricontrolla al prossimo giro
                return
            }
            // iPhone scollegato: alla prossima connessione si riparte da zero.
            missedOnce = false
            device = nil
            resetFailures()
            lockedRounds = 0
            unsupported = false
            wantsOpen = false
            state = .waiting
            return
        }
        missedOnce = false
        device = found

        if found.id != previous?.id || (found.wired && previous?.wired != true) {
            resetFailures()
            lockedRounds = 0
            unsupported = (found.osMajor ?? 27) < 27
            if found.wired {
                wantsOpen = true
                reopening = false
                nextAttempt = .distantPast
                onWiredConnect?()
            }
        }

        guard !unsupported else { return }
        guard wantsOpen else {
            if state == .waiting { state = .closed }
            return
        }
        guard Date() >= nextAttempt else { return }
        launch(found)
    }

    // MARK: - Avvio dello specchio

    private func launch(_ device: Device) {
        guard let helperURL = Self.helperURL else { return }
        launching = true
        attempt += 1
        let token = attempt
        state = lockedRounds > 0 ? .locked : .starting
        queue.async {
            // Come ipb, prima dello specchio un comando di devicectl verso l'iPhone apre (o rinnova)
            // il collegamento; con l'iPhone bloccato risponde con un errore e lo specchio non si avvia.
            let locked = Self.warmUpFindsLocked(device.id)
            let current = locked ? device : Self.withTunnel(device)
            let route = locked ? nil : current.tunnelAddress.flatMap(Self.hostRoute(forDeviceAddress:))
            DispatchQueue.main.async {
                self.launching = false
                guard self.active, token == self.attempt else { return }
                if locked {
                    self.lockedRounds += 1
                    guard self.wantsOpen else {
                        self.state = .closed
                        return
                    }
                    self.state = .locked
                    self.retryLater(after: self.lockedDelay)
                    return
                }
                guard let address = current.tunnelAddress, let route else {
                    // Nessun collegamento con l'iPhone: conta come un tentativo fallito (errore 4).
                    self.lockedRounds = 0
                    guard self.wantsOpen else {
                        self.state = .closed
                        return
                    }
                    self.recentLines = []
                    self.attemptFailed(code: 4)
                    return
                }
                self.startProcesses(helperURL, device: current, deviceAddress: address, route: route)
            }
        }
    }

    /// iPhone bloccato: all'inizio si controlla spesso (di solito lo stai sbloccando), poi sempre più di rado.
    private var lockedDelay: TimeInterval {
        lockedRounds <= 5 ? 3 : (lockedRounds <= 10 ? 10 : 30)
    }

    private func startProcesses(_ helperURL: URL, device: Device, deviceAddress: String,
                                route: (interface: String, address: String)) {
        runID += 1
        let run = runID
        keepaliveFailures = 0
        startKeepalive(device.id, run: run)

        let process = Process()
        process.executableURL = helperURL
        process.arguments = [
            device.id, route.interface, route.address, deviceAddress, device.productType,
            "--seconds", "0",
            "--title", device.name,
        ]
        let errors = Pipe()
        process.standardError = errors
        process.standardOutput = FileHandle.nullDevice
        readyAt = nil
        sawLocked = false
        recentLines = []

        willLaunchMirror?()
        do {
            try process.run()
        } catch {
            stopKeepalive()
            failures += 1
            state = .failed("Non riesco ad avviare lo specchio: ricrea l'app con ./crea-app.sh.")
            retryLater(after: 30)
            return
        }
        helper = process
        stopping = false

        // L'uscita si gestisce dopo l'ultima riga di stderr: una riga «SPECCHIO: locked» arrivata
        // in ritardo deve contare per questo avvio. I gestori si impostano dopo run(): quello di uscita
        // viene chiamato anche se lo specchio è già uscito, e stderr resta nella pipe finché non si legge.
        let finished = DispatchGroup()
        finished.enter() // stderr chiuso
        finished.enter() // programma uscito
        let output = LineBuffer()
        errors.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else {
                handle.readabilityHandler = nil
                if !output.closed {
                    output.closed = true
                    finished.leave()
                }
                return
            }
            output.pending.append(data)
            while let newline = output.pending.firstIndex(of: 10) {
                let line = String(decoding: output.pending[output.pending.startIndex..<newline], as: UTF8.self)
                output.pending.removeSubrange(output.pending.startIndex...newline)
                DispatchQueue.main.async { self?.handleHelperLine(line, run: run) }
            }
        }
        process.terminationHandler = { exited in
            finished.leave()
            // Se qualcosa tiene aperto stderr, si va avanti lo stesso dopo 2 secondi.
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                self?.helperExited(exited)
            }
        }
        finished.notify(queue: .main) { [weak self, weak process] in
            if let process { self?.helperExited(process) }
        }
    }

    private func handleHelperLine(_ line: String, run: Int) {
        guard run == runID, helper != nil else { return }
        recentLines.append(line)
        if recentLines.count > 40 { recentLines.removeFirst() }

        let lowered = line.lowercased()
        if line.contains("SPECCHIO: ready") {
            readyAt = Date()
            sawLocked = false
            lockedRounds = 0
            // Lo specchio è aperto: se poi si interrompe, si riapre come ogni altra sessione.
            wantsOpen = true
            state = .running
        } else if line.contains("SPECCHIO: locked") || lowered.contains("unlockrequired")
                    || (lowered.contains("remotepairing") && lowered.contains("1016")) {
            sawLocked = true
            if state != .running { state = .locked }
        }
    }

    private func helperExited(_ process: Process) {
        guard helper === process else { return }
        helper = nil
        stopKeepalive()
        // Se lo specchio è terminato per un segnale (crash), terminationStatus è il numero del segnale:
        // 5 (SIGTRAP) e 6 (SIGABRT) si confonderebbero con i codici di uscita 5 e 6. Come la shell, 128 + segnale.
        let crashed = process.terminationReason == .uncaughtSignal
        let code = crashed ? 128 + process.terminationStatus : process.terminationStatus

        if stopping {
            stopping = false
            state = !active ? .paused : (device == nil ? .waiting : .closed)
            return
        }
        if code == 0 {
            // Finestra chiusa dall'utente: si riapre solo con «Mostra iPhone» o ricollegando il cavo.
            // La sessione è finita bene: gli errori di prima non contano più.
            wantsOpen = false
            resetFailures()
            state = .closed
            return
        }
        let ranFor = readyAt.map { Date().timeIntervalSince($0) }
        if ranFor != nil { reopening = true }
        guard wantsOpen else {
            // La finestra di stato era stata chiusa durante l'avvio: niente nuovi tentativi.
            state = device == nil ? .waiting : .closed
            return
        }
        if sawLocked {
            lockedRounds += 1
            state = .locked
            retryLater(after: lockedDelay)
            return
        }
        lockedRounds = 0
        if let ranFor, ranFor >= 60 {
            // Lo specchio ha funzionato per un po': si riapre subito e si riparte da zero.
            resetFailures()
            state = .starting
            retryLater(after: 2)
            return
        }
        attemptFailed(code: code)
    }

    /// Un avvio non è arrivato al video (o si è chiuso subito dopo). Se succede per almeno un minuto
    /// di tentativi, il veloce non va (ad esempio dopo un aggiornamento di Xcode o iOS) e si passa alla
    /// modalità compatibilità. Un problema passeggero non basta: l'iPhone appena collegato che prepara
    /// gli strumenti per sviluppatori, un collegamento da riaprire.
    private func attemptFailed(code: Int32) {
        let now = Date()
        // Contano solo gli errori uno dopo l'altro: uno di parecchi minuti fa (prima di una sessione
        // andata bene o di una lunga attesa con l'iPhone bloccato) non conta più.
        if let last = lastFailure, now.timeIntervalSince(last) > 300 { resetFailures() }
        failures += 1
        let first = firstFailure ?? now
        firstFailure = first
        lastFailure = now
        if failures >= 4, now.timeIntervalSince(first) >= 60 {
            let wired = device?.wired == true
            // La compatibilità prende video e comandi dal cavo: senza cavo non servirebbe a niente,
            // si resta nella modalità veloce e si riprova ogni tanto.
            if wired {
                unsupported = true
            } else {
                retryLater(after: 30)
            }
            state = .failed(Self.explain(code: code, lines: recentLines, wired: wired))
            return
        }
        state = .starting
        retryLater(after: min(30, pow(2, Double(failures))))
    }

    private func resetFailures() {
        failures = 0
        firstFailure = nil
        lastFailure = nil
    }

    private func retryLater(after seconds: TimeInterval) {
        nextAttempt = Date().addingTimeInterval(seconds)
    }

    private static func explain(code: Int32, lines: [String], wired: Bool) -> String {
        let text = lines.joined(separator: "\n").lowercased()
        if text.contains("not supported") || text.contains("1001") {
            return "Il tuo Xcode o iOS non supporta lo specchio veloce (servono Xcode 27 e iOS 27)."
        }
        switch code {
        case 3: return "L'iPhone ha rifiutato il collegamento veloce (errore 3)."
        case 4 where !wired: return "Non riesco a raggiungere l'iPhone in Wi‑Fi: sbloccalo e tienilo vicino al Mac, oppure collegalo con il cavo."
        case 4: return "Non riesco a collegarmi all'iPhone: aprilo una volta in Xcode con il cavo collegato e l'iPhone sbloccato."
        case 5, 6, 7: return "Il video veloce non parte (errore \(code))."
        case 9: return "Lo specchio veloce non risponde (errore 9)."
        case 129...255: return "Lo specchio veloce si è chiuso per un errore interno (segnale \(code - 128))."
        default: return "Lo specchio veloce non parte (errore \(code))."
        }
    }

    // MARK: - Collegamento sempre attivo

    /// Il collegamento con l'iPhone si chiude ~10 s dopo l'ultimo comando di devicectl:
    /// un devicectl che resta in ascolto lo tiene aperto per tutta la sessione.
    private func startKeepalive(_ id: String, run: Int) {
        stopKeepalive()
        let (url, prefix) = Self.devicectlCommand
        let process = Process()
        process.executableURL = url
        process.arguments = prefix + [
            "device", "notification", "observe",
            "--device", id,
            "--name", "com.dennozvice.specchio.keepalive",
            "--session-timeout", "3600",
            "--timeout", "3600",
        ]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        let started = Date()
        process.terminationHandler = { finished in
            DispatchQueue.main.async { [weak self] in
                guard let self, self.keepalive === finished else { return }
                self.keepalive = nil
                self.keepaliveEnded(id, run: run, ranFor: Date().timeIntervalSince(started))
            }
        }
        do {
            try process.run()
            keepalive = process
        } catch {
            keepalive = nil
        }
    }

    /// Il devicectl che tiene vivo il collegamento si è fermato da solo. Dopo un'ora è normale e si
    /// riavvia subito. Se si ferma appena partito (iPhone bloccato o non raggiungibile) si riprova
    /// sempre più piano e dopo qualche volta si lascia perdere: se il collegamento cade davvero,
    /// lo specchio si chiude e il prossimo avvio riparte con un devicectl nuovo.
    private func keepaliveEnded(_ id: String, run: Int, ranFor: TimeInterval) {
        guard helper != nil, run == runID else { return }
        keepaliveFailures = ranFor < 10 ? keepaliveFailures + 1 : 0
        guard keepaliveFailures <= 5 else { return }
        let delay = keepaliveFailures == 0 ? 1 : min(30, pow(2, Double(keepaliveFailures)))
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, self.helper != nil, run == self.runID, self.keepalive == nil else { return }
            self.startKeepalive(id, run: run)
        }
    }

    private func stopKeepalive() {
        let running = keepalive
        keepalive = nil
        running?.terminate()
    }

    // MARK: - devicectl

    private static var devicectlCommand: (URL, [String]) {
        if FileManager.default.isExecutableFile(atPath: devicectlPath) {
            return (URL(fileURLWithPath: devicectlPath), [])
        }
        return (URL(fileURLWithPath: "/usr/bin/xcrun"), ["devicectl"])
    }

    /// Esegue devicectl e ne restituisce il codice di uscita (nil se non parte o non finisce in tempo).
    /// Con `errorLog` i messaggi di errore finiscono in quel file (una pipe piena bloccherebbe devicectl).
    @discardableResult
    private static func runDevicectl(_ arguments: [String], timeout: TimeInterval, errorLog: URL? = nil) -> Int32? {
        let (url, prefix) = devicectlCommand
        let process = Process()
        process.executableURL = url
        process.arguments = prefix + arguments
        process.standardOutput = FileHandle.nullDevice
        var log: FileHandle?
        if let errorLog, FileManager.default.createFile(atPath: errorLog.path, contents: nil) {
            log = try? FileHandle(forWritingTo: errorLog)
        }
        defer { try? log?.close() }
        process.standardError = log ?? FileHandle.nullDevice
        let done = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in done.signal() }
        do {
            try process.run()
        } catch {
            return nil
        }
        if done.wait(timeout: .now() + timeout) == .timedOut {
            process.terminate()
            _ = done.wait(timeout: .now() + 2)
            return nil
        }
        return process.terminationStatus
    }

    /// iPhone fisici visti da devicectl; nil se devicectl non risponde o va in errore.
    private static func listDevices() -> [Device]? {
        let file = FileManager.default.temporaryDirectory
            .appendingPathComponent("specchio-devices-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: file) }
        guard runDevicectl(["list", "devices", "--json-output", file.path, "--quiet"], timeout: 20) == 0,
              let data = try? Data(contentsOf: file),
              let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let result = json["result"] as? [String: Any],
              let devices = result["devices"] as? [[String: Any]] else { return nil }
        return devices.compactMap(parse)
    }

    /// L'iPhone come lo vede devicectl dopo il primo comando, con l'indirizzo del collegamento.
    /// Se manca ancora la strada verso l'iPhone, si riprova con `device info details` (come ipb).
    private static func withTunnel(_ device: Device) -> Device {
        let listed = listDevices()?.first { $0.id == device.id } ?? device
        if listed.tunnelAddress.flatMap(hostRoute(forDeviceAddress:)) != nil {
            return listed
        }
        runDevicectl(["device", "info", "details", "--device", device.id, "--timeout", "30"], timeout: 40)
        return listDevices()?.first { $0.id == device.id } ?? listed
    }

    /// Comando leggero verso l'iPhone (`device info lockState`) che apre o rinnova il collegamento.
    /// Con l'iPhone bloccato CoreDevice risponde «10003 / RemotePairing 1016» (lo stesso errore che
    /// fermerebbe lo specchio): true solo in quel caso, così non serve avviare lo specchio per scoprirlo.
    private static func warmUpFindsLocked(_ id: String) -> Bool {
        let name = "specchio-lock-\(UUID().uuidString)"
        let output = FileManager.default.temporaryDirectory.appendingPathComponent(name + ".json")
        let log = FileManager.default.temporaryDirectory.appendingPathComponent(name + ".txt")
        defer {
            try? FileManager.default.removeItem(at: output)
            try? FileManager.default.removeItem(at: log)
        }
        let status = runDevicectl(["device", "info", "lockState", "--device", id, "--timeout", "30",
                                   "--json-output", output.path], timeout: 40, errorLog: log)
        guard status != 0 else { return false }
        let text = ((try? String(contentsOf: log, encoding: .utf8)) ?? "").lowercased()
        if text.contains("unlockrequired") || text.contains("error 10003") || text.contains("still locked")
            || (text.contains("remotepairing") && text.contains("1016")) {
            return true
        }
        guard let data = try? Data(contentsOf: output),
              let json = try? JSONSerialization.jsonObject(with: data) else { return false }
        return containsLockError(json)
    }

    /// Cerca nell'errore di devicectl (anche negli errori annidati) CoreDeviceError 10003 o RemotePairingError 1016.
    private static func containsLockError(_ value: Any) -> Bool {
        if let entry = value as? [String: Any] {
            let code = (entry["code"] as? NSNumber)?.intValue
            let domain = (entry["domain"] as? String ?? "").lowercased()
            if (code == 10003 && domain.contains("coredevice")) || (code == 1016 && domain.contains("remotepairing")) {
                return true
            }
            return entry.values.contains { containsLockError($0) }
        }
        if let list = value as? [Any] {
            return list.contains { containsLockError($0) }
        }
        return false
    }

    private static func parse(_ entry: [String: Any]) -> Device? {
        let hardware = entry["hardwareProperties"] as? [String: Any] ?? [:]
        let properties = entry["deviceProperties"] as? [String: Any] ?? [:]
        let connection = entry["connectionProperties"] as? [String: Any] ?? [:]
        guard let id = entry["identifier"] as? String,
              (hardware["reality"] as? String ?? "physical") == "physical",
              (hardware["platform"] as? String ?? "iOS") == "iOS" else { return nil }

        let transport = connection["transportType"] as? String
        let wired = transport == "wired"
        let tunnelConnected = (connection["tunnelState"] as? String) == "connected"
        // In rete (Wi‑Fi) l'iPhone compare come "localNetwork": il collegamento si apre al primo comando.
        guard wired || tunnelConnected || transport == "localNetwork" else { return nil }

        let version = properties["osVersionNumber"] as? String ?? ""
        return Device(
            id: id,
            name: properties["name"] as? String ?? "iPhone",
            productType: hardware["productType"] as? String ?? "",
            osMajor: version.split(separator: ".").first.flatMap { Int($0) },
            wired: wired,
            tunnelConnected: tunnelConnected,
            tunnelAddress: connection["tunnelIPAddress"] as? String
        )
    }

    /// Interfaccia del Mac (utunN) e indirizzo che portano all'iPhone: l'iPhone è <prefisso>::1,
    /// il Mac ha un indirizzo con lo stesso prefisso su una delle interfacce utun.
    private static func hostRoute(forDeviceAddress deviceAddress: String) -> (interface: String, address: String)? {
        let device = deviceAddress.lowercased()
        guard let separator = device.range(of: "::", options: .backwards) else { return nil }
        let prefix = String(device[..<separator.lowerBound]) + "::"

        var list: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&list) == 0 else { return nil }
        defer { freeifaddrs(list) }

        var pointer = list
        while let entry = pointer {
            pointer = entry.pointee.ifa_next
            let name = String(cString: entry.pointee.ifa_name)
            guard name.hasPrefix("utun"),
                  let address = entry.pointee.ifa_addr,
                  address.pointee.sa_family == sa_family_t(AF_INET6) else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            guard getnameinfo(address, socklen_t(address.pointee.sa_len), &host, socklen_t(host.count),
                              nil, 0, NI_NUMERICHOST) == 0 else { continue }
            let text = String(cString: host).split(separator: "%").first.map { String($0).lowercased() } ?? ""
            if text.hasPrefix(prefix), text != device {
                return (name, text)
            }
        }
        return nil
    }
}

/// Righe di stderr dello specchio ancora incomplete (usato solo dalla coda di lettura di stderr).
private final class LineBuffer {
    var pending = Data()
    var closed = false
}
