import SwiftUI

struct ContentView: View {
    @ObservedObject var controller: AppController
    @ObservedObject private var capture: CaptureManager
    @ObservedObject private var wda: WDAClient
    @ObservedObject private var engine: MirrorEngine
    @State private var showAdvanced = false

    init(controller: AppController) {
        _controller = ObservedObject(wrappedValue: controller)
        _capture = ObservedObject(wrappedValue: controller.capture)
        _wda = ObservedObject(wrappedValue: controller.wda)
        _engine = ObservedObject(wrappedValue: controller.engine)
    }

    var body: some View {
        if controller.mode == .fast {
            fastModeStatus
        } else {
            compatibilityMirror
        }
    }

    // MARK: - Modalità veloce: solo lo stato (l'iPhone si vede nella finestra dello specchio)

    private var fastModeStatus: some View {
        VStack(spacing: 14) {
            Image(systemName: fastSymbol)
                .font(.system(size: 48))
            Text(controller.status)
                .font(.headline)
                .multilineTextAlignment(.center)
            Text(fastHint)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            HStack {
                Button("Mostra iPhone") { engine.retry() }
                    .keyboardShortcut(.defaultAction)
                Button("Usa la modalità compatibilità") { controller.prefersFastMode = false }
            }
            .padding(.top, 6)
        }
        .padding(32)
        .frame(minWidth: 320, maxWidth: .infinity, minHeight: 520, maxHeight: .infinity)
    }

    private var fastSymbol: String {
        switch engine.state {
        case .locked: return "lock.iphone"
        case .failed: return "exclamationmark.triangle"
        case .starting: return "iphone.radiowaves.left.and.right"
        default: return "iphone"
        }
    }

    private var fastHint: String {
        switch engine.state {
        case .locked:
            return "Lo specchio veloce funziona solo con l'iPhone sbloccato. Appena lo sblocchi si apre da solo (se chiudi questa finestra, smette di aspettare)."
        case .starting:
            return "Tieni l'iPhone sbloccato: tra pochi secondi compare la finestra con il suo schermo."
        case .failed:
            return "Puoi riprovare oppure passare alla modalità compatibilità (più lenta, ma funziona sempre)."
        case .closed:
            return "Riapri lo specchio quando vuoi. Ricollegando il cavo si riapre da solo."
        default:
            return "Collega l'iPhone con il cavo e sbloccalo: lo specchio si apre da solo."
        }
    }

    // MARK: - Modalità compatibilità: video dal cavo + WebDriverAgent

    private var compatibilityMirror: some View {
        VStack(spacing: 0) {
            ZStack {
                Color.black
                if capture.deviceName != nil {
                    MirrorView(session: capture.session, videoSize: capture.videoSize, wda: wda)
                } else {
                    waiting
                }
            }
            Divider()
            controls
        }
        .frame(minWidth: 320, minHeight: 520)
        .onChange(of: capture.videoSize) { _ in wda.screenChanged() }
    }

    private var waiting: some View {
        VStack(spacing: 12) {
            Image(systemName: "iphone")
                .font(.system(size: 48))
            if capture.cameraDenied {
                Text("Permesso negato")
                    .font(.headline)
                Text("Apri Impostazioni di Sistema › Privacy e sicurezza › Fotocamera e attiva «Specchio iPhone». Serve per ricevere l'immagine dell'iPhone.")
            } else {
                Text("In attesa dell'iPhone…")
                    .font(.headline)
                Text("Collega l'iPhone con il cavo e sbloccalo. La prima volta tocca «Autorizza» quando ti chiede di dare fiducia a questo computer.")
            }
        }
        .multilineTextAlignment(.center)
        .foregroundStyle(.white)
        .padding(32)
    }

    private var controls: some View {
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                button("chevron.backward", "Indietro (⇧⌘B)") { wda.back() }
                button("house", "Home (⇧⌘H)") { wda.home() }
                button("square.stack", "App aperte (⇧⌘A)") { wda.appSwitcher() }
                button("switch.2", "Centro di controllo (⇧⌘C)") { wda.controlCenter() }
                button("bell", "Notifiche (⇧⌘N)") { wda.notifications() }
                button("speaker.wave.1", "Abbassa volume (⇧⌘-)") { wda.pressButton("volumeDown") }
                button("speaker.wave.3", "Alza volume (⇧⌘+)") { wda.pressButton("volumeUp") }
                button("lock", "Blocca (⇧⌘L)") { wda.lock() }
            }
            .disabled(!controller.ready)

            HStack(spacing: 6) {
                Circle()
                    .fill(controller.ready ? Color.green : Color.orange)
                    .frame(width: 8, height: 8)
                Text(controller.ready ? (wda.lastError ?? controller.status) : controller.status)
                    .font(.caption)
                    .foregroundStyle(controller.ready && wda.lastError == nil ? Color.secondary : Color.primary)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button {
                    showAdvanced.toggle()
                } label: {
                    Image(systemName: "gearshape")
                }
                .buttonStyle(.borderless)
                .help("Impostazioni avanzate")
            }

            if showAdvanced {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Indirizzo WebDriverAgent (lascia vuoto per usare il cavo):")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    HStack {
                        TextField("automatico (cavo)", text: $wda.manualAddress)
                            .textFieldStyle(.roundedBorder)
                        Button("Riconnetti") { controller.reconnect() }
                    }
                }
            }
        }
        .padding(10)
    }

    private func button(_ symbol: String, _ help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 15))
                .frame(width: 22, height: 22)
        }
        .buttonStyle(.borderless)
        .help(help)
    }
}
