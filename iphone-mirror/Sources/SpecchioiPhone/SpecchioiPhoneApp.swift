import SwiftUI

@main
struct SpecchioiPhoneApp: App {
    @StateObject private var capture = CaptureManager()
    @StateObject private var wda = WDAClient()

    var body: some Scene {
        WindowGroup("Specchio iPhone") {
            ContentView()
                .environmentObject(capture)
                .environmentObject(wda)
        }
        .defaultSize(width: 430, height: 920)
        .commands {
            CommandMenu("iPhone") {
                Button("Home") { wda.home() }
                    .keyboardShortcut("h", modifiers: [.command, .shift])
                Button("App aperte") { wda.appSwitcher() }
                    .keyboardShortcut("a", modifiers: [.command, .shift])
                Button("Centro di controllo") { wda.controlCenter() }
                    .keyboardShortcut("c", modifiers: [.command, .shift])
                Button("Notifiche") { wda.notifications() }
                    .keyboardShortcut("n", modifiers: [.command, .shift])
                Divider()
                Button("Blocca") { wda.lock() }
                    .keyboardShortcut("l", modifiers: [.command, .shift])
                Button("Sblocca (senza codice)") { wda.unlock() }
                    .keyboardShortcut("u", modifiers: [.command, .shift])
                Divider()
                Button("Riconnetti a WebDriverAgent") { wda.connect() }
                    .keyboardShortcut("r", modifiers: [.command])
            }
        }
    }
}
