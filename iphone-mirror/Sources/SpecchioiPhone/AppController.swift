import Foundation

/// Tiene insieme video, collegamento via cavo e WebDriverAgent, e lo fa ripartire da solo quando serve.
final class AppController: ObservableObject {
    let capture = CaptureManager()
    let wda = WDAClient()
    private let runner = WDARunner()

    @Published private(set) var ready = false
    @Published private(set) var status = "Collega l'iPhone con il cavo."

    private var device: USBMux.Device?
    private var forwarder: PortForwarder?
    private var runnerStatus: String?
    private var failedPings = 0
    private var pinging = false
    private var timer: Timer?

    init() {
        runner.onStatus = { [weak self] text in
            self?.runnerStatus = text
            self?.refreshStatus()
        }
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            self?.tick()
        }
        tick()
    }

    /// Da chiamare quando l'app si chiude.
    func shutdown() {
        runner.stop()
        forwarder?.stop()
    }

    /// Ricollega tutto da capo (menu iPhone › Riconnetti).
    func reconnect() {
        runner.stop()
        failedPings = 0
        wda.reset()
        tick()
    }

    private func tick() {
        capture.findDevice()
        DispatchQueue.global(qos: .userInitiated).async {
            let found = USBMux.devices().first
            DispatchQueue.main.async { self.update(found) }
        }
    }

    private func update(_ found: USBMux.Device?) {
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

    private func refreshStatus() {
        if ready {
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
}
