import CoreGraphics
import Foundation

/// Invia tocchi, gesti e testo all'iPhone tramite WebDriverAgent (lo stesso strumento usato da Appium).
/// I comandi vengono eseguiti uno alla volta, nell'ordine in cui arrivano.
final class WDAClient: ObservableObject {
    @Published var address: String {
        didSet { UserDefaults.standard.set(address, forKey: "wdaAddress") }
    }
    @Published private(set) var connected = false
    @Published private(set) var lastError: String?

    // Usati solo dentro la coda dei comandi.
    private var sessionId: String?
    private var screenSize: CGSize?
    // Usati solo sul thread principale.
    private var tail: Task<Void, Never>?
    private var pendingText = ""

    init() {
        address = UserDefaults.standard.string(forKey: "wdaAddress") ?? "http://localhost:8100"
    }

    // MARK: - Comandi

    func connect() {
        enqueue {
            self.sessionId = nil
            self.screenSize = nil
            _ = try await self.ensureSession()
        }
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

    func appSwitcher() {
        gesture(from: CGPoint(x: 0.5, y: 0.995), to: CGPoint(x: 0.5, y: 0.6), duration: 0.6, holdAtEnd: 0.6)
    }

    func controlCenter() {
        gesture(from: CGPoint(x: 0.9, y: 0.003), to: CGPoint(x: 0.9, y: 0.5), duration: 0.3)
    }

    func notifications() {
        gesture(from: CGPoint(x: 0.3, y: 0.003), to: CGPoint(x: 0.3, y: 0.6), duration: 0.3)
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
        connected = error == nil
        switch error {
        case nil:
            lastError = nil
        case is URLError:
            lastError = "WebDriverAgent non risponde su \(address). È avviato sull'iPhone? (Con il cavo serve anche iproxy.)"
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
            let json = try await request("POST", "/session", body: ["capabilities": ["alwaysMatch": [String: Any]()]])
            let value = json["value"] as? [String: Any]
            guard let id = (json["sessionId"] as? String) ?? (value?["sessionId"] as? String) else {
                throw WDAError.server("WebDriverAgent non ha restituito una sessione.")
            }
            sessionId = id
            screenSize = nil
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
        var base = await MainActor.run { self.address }.trimmingCharacters(in: .whitespacesAndNewlines)
        if !base.contains("://") { base = "http://" + base }
        while base.hasSuffix("/") { base.removeLast() }
        guard let url = URL(string: base + path) else { throw WDAError.badAddress }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 60
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

enum WDAError: LocalizedError {
    case badAddress
    case invalidSession
    case server(String)

    var errorDescription: String? {
        switch self {
        case .badAddress: return "Indirizzo di WebDriverAgent non valido."
        case .invalidSession: return "Sessione di WebDriverAgent scaduta."
        case .server(let message): return message
        }
    }
}
