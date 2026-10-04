import Foundation

/// Avvia WebDriverAgent sull'iPhone con xcodebuild (al posto di avvia-wda.sh) e lo riavvia se si ferma.
/// La prima volta lo compila; le volte successive parte in pochi secondi.
/// Va usato solo dal thread principale.
final class WDARunner {
    /// Messaggio da mostrare all'utente; nil quando WebDriverAgent è pronto.
    var onStatus: ((String?) -> Void)?

    private var process: Process?
    private var failures = 0
    private var nextAttempt = Date.distantPast
    private var recentLines: [String] = []

    var isRunning: Bool { process != nil }

    /// Cartella di WebDriverAgent: quella indicata da crea-app.sh, altrimenti quella predefinita.
    static var projectDirectory: URL? {
        var candidates: [String] = []
        if let directory = Bundle.main.object(forInfoDictionaryKey: "WDAProjectDir") as? String {
            candidates.append(directory)
        }
        candidates.append(NSHomeDirectory() + "/Denis/iphone-mirror/WebDriverAgent")
        return candidates
            .map { URL(fileURLWithPath: $0) }
            .first { FileManager.default.fileExists(atPath: $0.appendingPathComponent("WebDriverAgent.xcodeproj").path) }
    }

    func start(udid: String) {
        guard process == nil, Date() >= nextAttempt else { return }
        guard let project = Self.projectDirectory else {
            onStatus?("Non trovo WebDriverAgent: esegui una volta ./avvia-wda.sh (vedi LEGGIMI).")
            return
        }
        let derivedData = project.deletingLastPathComponent().appendingPathComponent(".wda-build")

        // Dopo due avvii falliti si ricompila: succede ad esempio quando la firma gratuita scade dopo 7 giorni.
        if failures >= 2 || Self.xctestrun(in: derivedData) == nil {
            onStatus?("Preparazione del controllo (1–2 minuti, solo la prima volta)…")
            run([
                "build-for-testing",
                "-project", project.appendingPathComponent("WebDriverAgent.xcodeproj").path,
                "-scheme", "WebDriverAgentRunner",
                "-destination", "id=\(udid)",
                "-derivedDataPath", derivedData.path,
                "-allowProvisioningUpdates",
            ]) { [weak self] success in
                guard let self else { return }
                if success {
                    self.failures = 0
                    self.launch(udid: udid, derivedData: derivedData)
                } else {
                    self.failed()
                }
            }
        } else {
            launch(udid: udid, derivedData: derivedData)
        }
    }

    func stop() {
        let running = process
        process = nil
        running?.terminate()
    }

    private func launch(udid: String, derivedData: URL) {
        guard let xctestrun = Self.xctestrun(in: derivedData) else {
            failed()
            return
        }
        onStatus?("Avvio del controllo sull'iPhone…")
        // xcodebuild resta in esecuzione finché WebDriverAgent è attivo.
        run(["test-without-building", "-xctestrun", xctestrun.path, "-destination", "id=\(udid)"]) { [weak self] _ in
            self?.failed()
        }
    }

    private func failed() {
        failures += 1
        nextAttempt = Date().addingTimeInterval(min(60, Double(failures) * 5))
        onStatus?(Self.explain(recentLines))
    }

    private func handle(_ line: String) {
        recentLines.append(line)
        if recentLines.count > 60 { recentLines.removeFirst() }
        if line.contains("ServerURLHere") {
            failures = 0
            onStatus?(nil)
        } else if line.localizedCaseInsensitiveContains("locked") {
            onStatus?("Sblocca l'iPhone per attivare il controllo.")
        }
    }

    private func run(_ arguments: [String], completion: @escaping (Bool) -> Void) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/xcodebuild")
        process.arguments = arguments
        let output = Pipe()
        process.standardOutput = output
        process.standardError = output
        recentLines = []

        var pending = Data()
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else {
                handle.readabilityHandler = nil
                return
            }
            pending.append(data)
            while let newline = pending.firstIndex(of: 10) {
                let line = String(decoding: pending[pending.startIndex..<newline], as: UTF8.self)
                pending.removeSubrange(pending.startIndex...newline)
                DispatchQueue.main.async { self?.handle(line) }
            }
        }
        process.terminationHandler = { finished in
            DispatchQueue.main.async { [weak self] in
                guard let self, self.process === finished else { return }
                self.process = nil
                completion(finished.terminationStatus == 0)
            }
        }

        do {
            try process.run()
            self.process = process
        } catch {
            onStatus?("Non riesco ad avviare xcodebuild: Xcode è installato?")
            nextAttempt = Date().addingTimeInterval(60)
        }
    }

    private static func xctestrun(in derivedData: URL) -> URL? {
        let products = derivedData.appendingPathComponent("Build/Products")
        let files = (try? FileManager.default.contentsOfDirectory(at: products, includingPropertiesForKeys: nil)) ?? []
        return files.first { $0.pathExtension == "xctestrun" }
    }

    /// Traduce gli errori più comuni di xcodebuild in istruzioni semplici.
    private static func explain(_ lines: [String]) -> String {
        let text = lines.joined(separator: "\n").lowercased()
        if text.contains("development team") || text.contains("no account") || text.contains("provisioning profile") {
            return "Firma mancante o scaduta: apri WebDriverAgent in Xcode e scegli il tuo Team (vedi LEGGIMI)."
        }
        if text.contains("developer mode") {
            return "Attiva la Modalità sviluppatore sull'iPhone (Impostazioni › Privacy e sicurezza)."
        }
        if text.contains("untrusted") || text.contains("not trusted") || text.contains("invalid code signature") {
            return "Sull'iPhone autorizza lo sviluppatore: Impostazioni › Generali › VPN e gestione dispositivi."
        }
        if text.contains("locked") {
            return "Sblocca l'iPhone per attivare il controllo."
        }
        return "Il controllo si è fermato, riprovo tra poco…"
    }
}
