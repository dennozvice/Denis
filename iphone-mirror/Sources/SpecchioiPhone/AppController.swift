import Combine
import Foundation

/// Tiene insieme i due modi di usare l'iPhone e li fa ripartire da soli quando serve:
/// - veloce: lo specchio di Xcode 27 (MirrorEngine), con tocchi e tastiera dal vivo;
/// - compatibilità: video dal cavo + WebDriverAgent, quando il veloce non è disponibile.
final class AppController: ObservableObject {
    enum Mode {
        case fast
        case compatibility
    }

    let capture = CaptureManager()
    let wda = WDAClient()
    let engine = MirrorEngine()
    private let runner = WDARunner()

    @Published private(set) var mode: Mode = .compatibility
    @Published private(set) var ready = false
    @Published private(set) var status = "Collega l'iPhone con il cavo."

    /// Scelta dell'utente nel menu (attiva di serie).
    var prefersFastMode: Bool {
        get { UserDefaults.standard.object(forKey: "prefersFastMode") as? Bool ?? true }
        set {
            UserDefaults.standard.set(newValue, forKey: "prefersFastMode")
            if newValue { engine.retry() }
            refreshMode()
        }
    }

    private var device: USBMux.Device?
    private var forwarder: PortForwarder?
    private var runnerStatus: String?
    private var failedPings = 0
    private var pinging = false
    private var timer: Timer?
    private var cancellables: Set<AnyCancellable> = []

    init() {
        runner.onStatus = { [weak self] text in
            self?.runnerStatus = text
            self?.refreshStatus()
        }
        // I @Published avvisano prima di cambiare valore: si rilegge lo stato al giro successivo.
        engine.$unsupported
            .removeDuplicates()
            .sink { [weak self] _ in
                DispatchQueue.main.async { self?.refreshMode() }
            }
            .store(in: &cancellables)
        engine.$state
            .sink { [weak self] _ in
                DispatchQueue.main.async { self?.refreshStatus() }
            }
            .store(in: &cancellables)
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            self?.tick()
        }
        applyMode(currentMode(), force: true)
    }

    /// Da chiamare quando l'app si chiude.
    func shutdown() {
        engine.stop()
        runner.stop()
        forwarder?.stop()
    }

    /// Ricollega tutto da capo (menu iPhone › Riconnetti).
    func reconnect() {
        if mode == .fast {
            engine.retry()
            return
        }
        runner.stop()
        failedPings = 0
        wda.reset()
        tick()
    }

    // MARK: - Modalità

    private func currentMode() -> Mode {
        prefersFastMode && MirrorEngine.isInstalled && !engine.unsupported ? .fast : .compatibility
    }

    private func refreshMode() {
        applyMode(currentMode(), force: false)
    }

    private func applyMode(_ newMode: Mode, force: Bool) {
        // Il motore resta attivo anche in compatibilità finché l'utente lo vuole: così, quando
        // l'iPhone viene ricollegato (o aggiornato a iOS 27), si torna da soli alla modalità veloce.
        engine.setActive(prefersFastMode)
        guard force || newMode != mode else {
            refreshStatus()
            return
        }
        mode = newMode
        if newMode == .fast {
            // Il video e i comandi della compatibilità disturberebbero lo specchio.
            capture.isEnabled = false
            runner.stop()
            forwarder?.stop()
            forwarder = nil
            device = nil
            wda.cableAddress = nil
            runnerStatus = nil
            ready = false
        } else {
            capture.isEnabled = true
            tick()
        }
        refreshStatus()
    }

    // MARK: - Compatibilità (video dal cavo + WebDriverAgent)

    private func tick() {
        guard mode == .compatibility else { return }
        capture.findDevice()
        DispatchQueue.global(qos: .userInitiated).async {
            let found = USBMux.devices().first
            DispatchQueue.main.async { self.update(found) }
        }
    }

    private func update(_ found: USBMux.Device?) {
        guard mode == .compatibility else { return }
        if found != device {
            forwarder?.stop()
            forwarder = nil
            runner.stop()
            runnerStatus = nil
            failedPings = 0
            device = found
            if let found, let forwarder = PortForwarder(deviceID: found.id, remotePort: 8100) {
                self.forwarder = forwarder
                wda.cableAddress = "http://127.0.0.1:\(forwarder.localPort)"
            } else {
                wda.cableAddress = nil
            }
            wda.reset()
        }

        guard device != nil || wda.usesManualAddress else {
            ready = false
            refreshStatus()
            return
        }
        guard !pinging else { return }
        pinging = true
        wda.ping { [weak self] ok in
            guard let self else { return }
            self.pinging = false
            guard self.mode == .compatibility else { return }
            self.ready = ok
            if ok {
                self.failedPings = 0
                self.runnerStatus = nil
            } else {
                self.failedPings += 1
                // Qualche controllo andato a vuoto (WebDriverAgent può essere occupato): poi lo si avvia.
                if self.failedPings >= 2, let device = self.device, !self.wda.usesManualAddress, !self.runner.isRunning {
                    self.runner.start(udid: device.udid)
                }
            }
            self.refreshStatus()
        }
    }

    // MARK: - Stato

    private func refreshStatus() {
        if mode == .fast {
            status = fastStatus
        } else if ready {
            status = "Pronto"
        } else if device == nil && !wda.usesManualAddress {
            status = capture.deviceName == nil
                ? "Collega l'iPhone con il cavo."
                : "Collega l'iPhone con il cavo per poterlo controllare."
        } else if let runnerStatus {
            status = runnerStatus
        } else {
            status = "Collegamento all'iPhone…"
        }
    }

    private var fastStatus: String {
        switch engine.state {
        case .unavailable, .paused, .waiting:
            return "Collega l'iPhone con il cavo."
        case .starting:
            return "Apertura dello specchio…"
        case .running:
            return "Specchio aperto."
        case .locked:
            return "Sblocca l'iPhone per vederlo sul Mac."
        case .closed:
            return "Specchio chiuso: usa «Mostra iPhone» per riaprirlo."
        case .failed(let message):
            return message
        }
    }
}
