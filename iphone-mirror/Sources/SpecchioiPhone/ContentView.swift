import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var capture: CaptureManager
    @EnvironmentObject private var wda: WDAClient

    var body: some View {
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
        .onAppear { wda.connect() }
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
                Text("Collega l'iPhone con il cavo, sbloccalo e tocca «Autorizza» se ti chiede di dare fiducia a questo computer.")
            }
        }
        .multilineTextAlignment(.center)
        .foregroundStyle(.white)
        .padding(32)
    }

    private var controls: some View {
        VStack(spacing: 8) {
            HStack(spacing: 14) {
                button("house", "Home (⇧⌘H)") { wda.home() }
                button("square.stack", "App aperte (⇧⌘A)") { wda.appSwitcher() }
                button("switch.2", "Centro di controllo (⇧⌘C)") { wda.controlCenter() }
                button("bell", "Notifiche (⇧⌘N)") { wda.notifications() }
                button("speaker.wave.1", "Volume giù") { wda.pressButton("volumeDown") }
                button("speaker.wave.3", "Volume su") { wda.pressButton("volumeUp") }
                button("lock", "Blocca (⇧⌘L)") { wda.lock() }
            }
            HStack(spacing: 6) {
                Circle()
                    .fill(wda.connected ? Color.green : Color.red)
                    .frame(width: 8, height: 8)
                    .help(wda.connected ? "Controllo attivo" : "Controllo non attivo: vedi lo schermo ma non puoi toccarlo")
                TextField("http://localhost:8100", text: $wda.address)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { wda.connect() }
                Button("Connetti") { wda.connect() }
            }
            if let error = wda.lastError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .lineLimit(3)
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
