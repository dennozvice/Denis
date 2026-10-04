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

    /// Chiamato quando l'iPhone viene collegato con il cavo.
    var onWiredConnect: (() -> Void)?

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

    private let queue = DispatchQueue(label: "specchio.engine")
    private var timer: Timer?
    private var active = false
    private var helper: Process?
    private var keepalive: Process?
    private var listing = false
    private var launching = false
    private var stopping = false
    private var failures = 0
    private var nextAttempt = Date.distantPast
    private var sawReady = false
    private var sawLocked = false
    private var recentLines: [String] = []

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
        nextAttempt = .distantPast
        if helper == nil, state == .closed || state == .waiting {
            state = device == nil ? .waiting : .starting
        }
        poll()
    }

    /// Chiude lo specchio e il collegamento (uscita dall'app o cambio di modalità).
    func stop() {
        if let running = helper {
            stopping = true
            running.terminate()
        }
        stopKeepalive()
    }

    /// Riprova da capo dopo un errore.
    func retry() {
        failures = 0
        unsupported = false
        sawLocked = false
        open()
    }

    // MARK: - Ricerca dell'iPhone

    private func poll() {
        guard active, !listing, !launching, helper == nil else { return }
        listing = true
        queue.async {
            let devices = Self.listDevices()
            DispatchQueue.main.async {
                self.listing = false
                self.update(devices)
            }
        }
    }

    private func update(_ devices: [Device]) {
        guard active else { return }
        let found = devices.first { $0.wired } ?? devices.first { $0.tunnelConnected } ?? devices.first
        let previous = device
        device = found

        guard let found else {
            // iPhone scollegato: alla prossima connessione si riparte da zero.
            failures = 0
            sawLocked = false
            unsupported = false
            wantsOpen = false
            state = .waiting
            return
        }

        if found.id != previous?.id || (found.wired && previous?.wired != true) {
            failures = 0
            sawLocked = false
            unsupported = (found.osMajor ?? 27) < 27
            if found.wired {
                wantsOpen = true
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
        state = sawLocked ? .locked : .starting
        queue.async {
            var current = device
            if !current.tunnelConnected || current.tunnelAddress == nil {
                // Qualsiasi comando di devicectl verso l'iPhone apre il collegamento.
                Self.runDevicectl(["device", "info", "details", "--device", device.id, "--timeout", "30"], timeout: 40)
                current = Self.listDevices().first { $0.id == device.id } ?? current
            }
            let route = current.tunnelAddress.flatMap(Self.hostRoute(forDeviceAddress:))
            DispatchQueue.main.async {
                self.launching = false
                guard self.active, self.wantsOpen else { return }
                guard let address = current.tunnelAddress, let route else {
                    self.retryLater(after: 3)
                    self.state = self.sawLocked ? .locked : .starting
                    return
                }
                self.startProcesses(helperURL, device: current, deviceAddress: address, route: route)
            }
        }
    }

    private func startProcesses(_ helperURL: URL, device: Device, deviceAddress: String,
                                route: (interface: String, address: String)) {
        startKeepalive(device.id)

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
        sawReady = false
        recentLines = []

        var pending = Data()
        errors.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else {
                handle.readabilityHandler = nil
                return
            }
            pending.append(data)
            while let newline = pending.firstIndex(of: 10) {
                let line = String(decoding: pending[pending.startIndex..<newline], as: UTF8.self)
                pending.removeSubrange(pending.startIndex...newline)
                DispatchQueue.main.async { self?.handleHelperLine(line) }
            }
        }
        process.terminationHandler = { finished in
            DispatchQueue.main.async { [weak self] in
                self?.helperExited(finished)
            }
        }

        do {
            try process.run()
            helper = process
            stopping = false
        } catch {
            stopKeepalive()
            failures += 1
            state = .failed("Non riesco ad avviare lo specchio: ricrea l'app con ./crea-app.sh.")
            retryLater(after: 30)
        }
    }

    private func handleHelperLine(_ line: String) {
        recentLines.append(line)
        if recentLines.count > 40 { recentLines.removeFirst() }

        let lowered = line.lowercased()
        if line.contains("SPECCHIO: ready") {
            sawReady = true
            sawLocked = false
            failures = 0
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
        let code = process.terminationStatus

        if stopping {
            stopping = false
            state = !active ? .paused : (device == nil ? .waiting : .closed)
            return
        }
        if code == 0 {
            // Finestra chiusa dall'utente: si riapre solo con «Mostra iPhone» o ricollegando il cavo.
            wantsOpen = false
            state = .closed
            return
        }
        if sawLocked {
            state = .locked
            retryLater(after: 3)
            return
        }

        failures = sawReady ? 1 : failures + 1
        // 2 = parametri, 3 = servizio rifiutato, 5 = negoziazione, 6 = video: non si risolvono riprovando.
        if !sawReady, [2, 3, 5, 6].contains(code), failures >= 3 {
            unsupported = true
            state = .failed(Self.explain(code: code, lines: recentLines))
            return
        }
        state = .starting
        retryLater(after: min(30, pow(2, Double(failures))))
    }

    private func retryLater(after seconds: TimeInterval) {
        nextAttempt = Date().addingTimeInterval(seconds)
    }

    private static func explain(code: Int32, lines: [String]) -> String {
        let text = lines.joined(separator: "\n").lowercased()
        if text.contains("not supported") || text.contains("1001") {
            return "Il tuo Xcode o iOS non supporta lo specchio veloce (servono Xcode 27 e iOS 27)."
        }
        switch code {
        case 3: return "L'iPhone ha rifiutato il collegamento veloce (errore 3)."
        case 5, 6: return "Il video veloce non parte (errore \(code))."
        default: return "Lo specchio veloce non parte (errore \(code))."
        }
    }

    // MARK: - Collegamento sempre attivo

    /// Il collegamento con l'iPhone si chiude ~10 s dopo l'ultimo comando di devicectl:
    /// un devicectl che resta in ascolto lo tiene aperto per tutta la sessione.
    private func startKeepalive(_ id: String) {
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
        process.terminationHandler = { finished in
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                guard let self, self.keepalive === finished else { return }
                self.keepalive = nil
                // Si è fermato da solo (ad esempio dopo un'ora): si riavvia finché lo specchio è aperto.
                if self.helper != nil { self.startKeepalive(id) }
            }
        }
        do {
            try process.run()
            keepalive = process
        } catch {
            keepalive = nil
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

    @discardableResult
    private static func runDevicectl(_ arguments: [String], timeout: TimeInterval) -> Int32? {
        let (url, prefix) = devicectlCommand
        let process = Process()
        process.executableURL = url
        process.arguments = prefix + arguments
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
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

    /// iPhone fisici visti da devicectl.
    private static func listDevices() -> [Device] {
        let file = FileManager.default.temporaryDirectory
            .appendingPathComponent("specchio-devices-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: file) }
        runDevicectl(["list", "devices", "--json-output", file.path, "--quiet"], timeout: 20)
        guard let data = try? Data(contentsOf: file),
              let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let result = json["result"] as? [String: Any],
              let devices = result["devices"] as? [[String: Any]] else { return [] }
        return devices.compactMap(parse)
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
