import CoreGraphics
import Foundation

/// Invia tocchi, gesti e testo all'iPhone tramite WebDriverAgent (lo stesso strumento usato da Appium).
/// I comandi vengono eseguiti uno alla volta, nell'ordine in cui arrivano.
final class WDAClient: ObservableObject {
    /// Indirizzo scritto a mano (facoltativo). Vuoto = collegamento automatico dal cavo.
    @Published var manualAddress: String {
        didSet { UserDefaults.standard.set(manualAddress, forKey: "wdaManualAddress") }
    }
    /// Indirizzo del collegamento via cavo, impostato da AppController.
    var cableAddress: String?
    @Published private(set) var lastError: String?

    var usesManualAddress: Bool {
        !manualAddress.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var address: String? {
        usesManualAddress ? manualAddress : cableAddress
    }

    // Usati solo dentro la coda dei comandi.
    private var sessionId: String?
    private var screenSize: CGSize?
    // Usati solo sul thread principale.
    private var tail: Task<Void, Never>?
    private var pendingText = ""

    init() {
        manualAddress = UserDefaults.standard.string(forKey: "wdaManualAddress") ?? ""
    }

    // MARK: - Comandi

    /// Si dimentica la sessione: la prossima azione ne crea una nuova.
    func reset() {
        enqueue {
            self.sessionId = nil
            self.screenSize = nil
        }
    }

    /// Controlla velocemente se WebDriverAgent risponde.
    func ping(_ completion: @escaping (Bool) -> Void) {
        guard let url = Self.url(address, "/status") else {
            completion(false)
            return
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 3
        URLSession.shared.dataTask(with: request) { _, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async { completion(ok) }
        }.resume()
    }

    /// Da chiamare quando l'iPhone ruota: la dimensione dello schermo va riletta.
    func screenChanged() {
        enqueue { self.screenSize = nil }
    }

    /// Tocco, pressione prolungata o trascinamento. I punti vanno da 0 a 1 rispetto allo schermo.
    func gesture(from start: CGPoint, to end: CGPoint, duration: TimeInterval, holdAtEnd: TimeInterval = 0) {
        enqueue {
            try await self.withSession { id, size in
                let x1 = Double(start.x * size.width), y1 = Double(start.y * size.height)
                let x2 = Double(end.x * size.width), y2 = Double(end.y * size.height)
                let ms = Int(min(max(duration, 0.05), 10) * 1000)
                var actions: [[String: Any]] = [
                    ["type": "pointerMove", "duration": 0, "x": x1, "y": y1],
                    ["type": "pointerDown", "button": 0],
                ]
                if hypot(end.x - start.x, end.y - start.y) > 0.01 {
                    actions.append(["type": "pause", "duration": 50])
                    actions.append(["type": "pointerMove", "duration": max(ms, 100), "x": x2, "y": y2])
                } else {
                    actions.append(["type": "pause", "duration": ms])
                }
                if holdAtEnd > 0 {
                    actions.append(["type": "pause", "duration": Int(holdAtEnd * 1000)])
                }
                actions.append(["type": "pointerUp", "button": 0])
                let finger: [String: Any] = [
                    "type": "pointer",
                    "id": "dito",
                    "parameters": ["pointerType": "touch"],
                    "actions": actions,
                ]
                _ = try await self.request("POST", "/session/\(id)/actions", body: ["actions": [finger]])
            }
        }
    }

    /// Scrive testo nel campo attivo dell'iPhone. "\u{8}" cancella, "\n" va a capo/invio.
    func type(_ text: String) {
        let needsFlush = pendingText.isEmpty
        pendingText += text
        guard needsFlush else { return }
        // I tasti premuti mentre la richiesta precedente è in corso vengono inviati insieme.
        enqueue {
            let text = await MainActor.run { () -> String in
                let text = self.pendingText
                self.pendingText = ""
                return text
            }
            guard !text.isEmpty else { return }
            try await self.withSession { id, _ in
                _ = try await self.request("POST", "/session/\(id)/wda/keys", body: ["value": text.map { String($0) }])
            }
        }
    }

    func home() {
        enqueue { _ = try await self.request("POST", "/wda/homescreen") }
    }

    func lock() {
        enqueue { _ = try await self.request("POST", "/wda/lock") }
    }

    func unlock() {
        enqueue { _ = try await self.request("POST", "/wda/unlock") }
    }

    /// "volumeUp" o "volumeDown".
    func pressButton(_ name: String) {
        enqueue {
            try await self.withSession { id, _ in
                _ = try await self.request("POST", "/session/\(id)/wda/pressButton", body: ["name": name])
            }
        }
    }

    // Gesti dai bordi dello schermo: usano il trascinamento "nativo" di XCTest,
    // che iOS riconosce meglio come gesto di sistema.

    func appSwitcher() {
        systemSwipe(from: CGPoint(x: 0.5, y: 0.999), to: CGPoint(x: 0.5, y: 0.6), velocity: 700, hold: 0.7)
    }

    func controlCenter() {
        systemSwipe(from: CGPoint(x: 0.92, y: 0.001), to: CGPoint(x: 0.92, y: 0.6), velocity: 2500, hold: 0)
    }

    func notifications() {
        systemSwipe(from: CGPoint(x: 0.3, y: 0.001), to: CGPoint(x: 0.3, y: 0.7), velocity: 2500, hold: 0)
    }

    /// Torna indietro con lo swipe dal bordo sinistro.
    func back() {
        systemSwipe(from: CGPoint(x: 0.001, y: 0.45), to: CGPoint(x: 0.75, y: 0.45), velocity: 1500, hold: 0)
    }

    private func systemSwipe(from start: CGPoint, to end: CGPoint, velocity: Double, hold: TimeInterval) {
        enqueue {
            try await self.withSession { id, size in
                let body: [String: Any] = [
                    "fromX": Double(start.x * size.width), "fromY": Double(start.y * size.height),
                    "toX": Double(end.x * size.width), "toY": Double(end.y * size.height),
                    "pressDuration": 0.05, "holdDuration": hold, "velocity": velocity,
                ]
                do {
                    _ = try await self.request("POST", "/session/\(id)/wda/pressAndDragWithVelocity", body: body)
                } catch WDAError.invalidSession {
                    throw WDAError.invalidSession
                } catch {
                    // Versioni vecchie di WebDriverAgent: si usa il gesto normale.
                    let distance = Double(hypot((end.x - start.x) * size.width, (end.y - start.y) * size.height))
                    await MainActor.run {
                        self.gesture(from: start, to: end, duration: distance / velocity, holdAtEnd: hold)
                    }
                }
            }
        }
    }

    // MARK: - Coda dei comandi

    private func enqueue(_ operation: @escaping () async throws -> Void) {
        let previous = tail
        tail = Task {
            await previous?.value
            do {
                try await operation()
                await self.report(nil)
            } catch {
                await self.report(error)
            }
        }
    }

    @MainActor
    private func report(_ error: Error?) {
        switch error {
        case nil:
            lastError = nil
        case is URLError:
            lastError = "L'iPhone non risponde ai comandi, riprovo appena il controllo è di nuovo attivo."
        default:
            lastError = error?.localizedDescription
        }
    }

    // MARK: - Sessione e richieste HTTP

    private func withSession(_ body: (String, CGSize) async throws -> Void) async throws {
        let (id, size) = try await ensureSession()
        do {
            try await body(id, size)
        } catch WDAError.invalidSession {
            // WebDriverAgent è stato riavviato: si crea una nuova sessione e si riprova una volta.
            sessionId = nil
            let (id, size) = try await ensureSession()
            try await body(id, size)
        }
    }

    private func ensureSession() async throws -> (String, CGSize) {
        if sessionId == nil {
            // Senza attese: di norma WebDriverAgent aspetta che l'app sia "ferma" prima di ogni tocco.
            let fast: [String: Any] = [
                "shouldWaitForQuiescence": false,
                "waitForIdleTimeout": 0,
                "animationCoolOffTimeout": 0,
            ]
            let json = try await request("POST", "/session", body: ["capabilities": ["alwaysMatch": fast]])
            let value = json["value"] as? [String: Any]
            guard let id = (json["sessionId"] as? String) ?? (value?["sessionId"] as? String) else {
                throw WDAError.server("WebDriverAgent non ha restituito una sessione.")
            }
            sessionId = id
            screenSize = nil
            _ = try? await request("POST", "/session/\(id)/appium/settings", body: ["settings": fast])
        }
        guard let id = sessionId else { throw WDAError.invalidSession }
        if screenSize == nil {
            let json = try await request("GET", "/session/\(id)/window/size")
            guard let value = json["value"] as? [String: Any],
                  let width = (value["width"] as? NSNumber)?.doubleValue,
                  let height = (value["height"] as? NSNumber)?.doubleValue,
                  width > 0, height > 0 else {
                throw WDAError.server("Dimensione dello schermo non disponibile.")
            }
            screenSize = CGSize(width: width, height: height)
        }
        guard let size = screenSize else { throw WDAError.invalidSession }
        return (id, size)
    }

    private func request(_ method: String, _ path: String, body: [String: Any]? = nil) async throws -> [String: Any] {
        let base = await MainActor.run { self.address }
        guard let url = Self.url(base, path) else { throw WDAError.notConnected }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if let value = json["value"] as? [String: Any], let error = value["error"] as? String {
            if error == "invalid session id" { throw WDAError.invalidSession }
            throw WDAError.server((value["message"] as? String) ?? error)
        }
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw WDAError.server("Errore HTTP \(http.statusCode) su \(path)")
        }
        return json
    }
}

extension WDAClient {
    static func url(_ base: String?, _ path: String) -> URL? {
        guard var base = base?.trimmingCharacters(in: .whitespacesAndNewlines), !base.isEmpty else { return nil }
        if !base.contains("://") { base = "http://" + base }
        while base.hasSuffix("/") { base.removeLast() }
        return URL(string: base + path)
    }
}

enum WDAError: LocalizedError {
    case notConnected
    case invalidSession
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notConnected: return "Collega l'iPhone con il cavo."
        case .invalidSession: return "Sessione di WebDriverAgent scaduta."
        case .server(let message): return message
        }
    }
}
