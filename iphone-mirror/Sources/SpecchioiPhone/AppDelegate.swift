import AppKit
import Combine
import ServiceManagement
import SwiftUI

/// Avvio dell'app: icona nella barra dei menu, apertura all'accesso al Mac,
/// e iPhone che compare da solo quando lo colleghi.
/// Nella modalità veloce l'iPhone si vede nella finestra dello specchio (un programma a parte):
/// la finestra dell'app mostra solo cosa sta succedendo e si nasconde quando lo specchio è aperto.
@main
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, NSMenuDelegate {
    private var controller: AppController!
    private var window: NSWindow?
    private var statusItem: NSStatusItem?
    private var statusMenuItem: NSMenuItem?
    private var loginMenuItem: NSMenuItem?
    private var fastModeMenuItem: NSMenuItem?
    private var actions: [MenuAction] = []
    private var cancellables: Set<AnyCancellable> = []
    private var launchedAtLogin = false

    static let mirrorBundleIdentifier = "com.dennozvice.specchioiphone.mirror"
    private static var terminationSignal: DispatchSourceSignal?

    static func main() {
        signal(SIGPIPE, SIG_IGN)
        // SIGTERM (ad esempio da crea-app.sh): l'app si chiude come con «Esci», così ferma anche
        // lo specchio, il devicectl che tiene vivo il collegamento e WebDriverAgent.
        // Un gestore vuoto e non SIG_IGN: SIG_IGN passerebbe ai programmi avviati dall'app, che poi
        // non si fermerebbero più con terminate(). La sorgente qui sotto riceve il segnale lo stesso.
        signal(SIGTERM, { _ in })
        let terminate = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        terminate.setEventHandler { NSApplication.shared.terminate(nil) }
        terminate.resume()
        terminationSignal = terminate
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.run()
    }

    func applicationWillFinishLaunching(_ notification: Notification) {
        // Codici Apple Event: 'oapp' (apertura), 'prdt' (dettagli), 'lgit' (avvio all'accesso).
        let event = NSAppleEventManager.shared().currentAppleEvent
        launchedAtLogin = event?.eventID == fourCharCode("oapp")
            && event?.paramDescriptor(forKeyword: fourCharCode("prdt"))?.enumCodeValue == fourCharCode("lgit")
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        controller = AppController()
        NSApp.mainMenu = makeMainMenu()
        makeStatusItem()
        setUpLoginItem()

        // Appena l'iPhone viene collegato, si apre da solo.
        controller.engine.onWiredConnect = { [weak self] in
            self?.showWindow()
        }
        // Su macOS 14 e successivi un'app passa al primo piano solo se quella attiva glielo concede:
        // lo specchio deve poter prendere la tastiera appena si apre.
        controller.engine.willLaunchMirror = {
            if #available(macOS 14, *) {
                NSApp.yieldActivation(toApplicationWithBundleIdentifier: AppDelegate.mirrorBundleIdentifier)
            }
        }
        controller.capture.$deviceName
            .removeDuplicates()
            .dropFirst()
            .sink { [weak self] name in
                if name != nil, self?.controller.mode == .compatibility { self?.showWindow() }
            }
            .store(in: &cancellables)

        // Modalità veloce: la finestra di stato sparisce quando lo specchio è aperto,
        // e ricompare se serve un intervento (iPhone bloccato, errore).
        controller.engine.$state
            .removeDuplicates()
            .sink { [weak self] state in
                DispatchQueue.main.async { self?.engineStateChanged(state) }
            }
            .store(in: &cancellables)

        if !launchedAtLogin {
            showIPhone()
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showIPhone()
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationWillTerminate(_ notification: Notification) {
        controller.shutdown()
    }

    // MARK: - Finestra

    /// «Mostra iPhone»: lo specchio nella modalità veloce, altrimenti la finestra dell'app.
    @objc func showIPhone() {
        guard controller.mode == .fast else {
            showWindow()
            return
        }
        if controller.engine.state == .running {
            mirrorApplication?.activate(options: [.activateAllWindows])
        } else {
            controller.engine.open()
            showWindow()
        }
    }

    /// La finestra dello specchio (un programma a parte), se è aperta.
    private var mirrorApplication: NSRunningApplication? {
        controller.engine.helperProcessIdentifier.flatMap { NSRunningApplication(processIdentifier: $0) }
            ?? NSRunningApplication.runningApplications(withBundleIdentifier: Self.mirrorBundleIdentifier).first
    }

    private func engineStateChanged(_ state: MirrorEngine.State) {
        guard controller.mode == .fast else { return }
        switch state {
        case .running:
            // Se in primo piano c'è questa app (la finestra di stato), passa la tastiera allo specchio
            // prima di nascondersi: su macOS 14 e successivi lo specchio da solo potrebbe non riuscirci.
            if NSApp.isActive {
                mirrorApplication?.activate(options: [])
            }
            hideWindow()
        case .locked, .failed:
            guard controller.engine.wantsOpen || state != .locked else { break }
            // Già in vista: si aggiorna da sola, senza rubare di nuovo la tastiera.
            guard window?.isVisible != true else { break }
            if controller.engine.reopening {
                // Lo specchio si è interrotto da solo (ad esempio l'iPhone si è bloccato durante l'uso):
                // l'avviso compare senza togliere la tastiera all'app che stai usando.
                showWindowInBackground()
            } else {
                showWindow()
            }
        default:
            break
        }
    }

    private func hideWindow() {
        guard let window, window.isVisible else { return }
        window.orderOut(nil)
        NSApp.setActivationPolicy(.accessory)
    }

    @objc func showWindow() {
        makeWindowIfNeeded()
        NSApp.setActivationPolicy(.regular)
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        // Su macOS 14 e successivi l'attivazione può essere rifiutata (cavo collegato mentre usi
        // un'altra app): la finestra compare comunque davanti.
        window?.orderFrontRegardless()
    }

    /// Mostra la finestra di stato senza attivare l'app: per avvisi che l'utente non ha chiesto.
    private func showWindowInBackground() {
        makeWindowIfNeeded()
        window?.orderFrontRegardless()
    }

    private func makeWindowIfNeeded() {
        if window == nil {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 430, height: 900),
                styleMask: [.titled, .closable, .miniaturizable, .resizable],
                backing: .buffered,
                defer: false
            )
            window.title = "Specchio iPhone"
            window.isReleasedWhenClosed = false
            window.delegate = self
            window.contentView = NSHostingView(rootView: ContentView(controller: controller))
            if !window.setFrameUsingName("SpecchioiPhone") {
                window.center()
            }
            window.setFrameAutosaveName("SpecchioiPhone")
            self.window = window
        }
    }

    /// Chiudendo la finestra l'app resta nella barra dei menu, pronta per la prossima volta.
    /// Nella modalità veloce vuol dire anche «non ora»: lo specchio smette di riprovare da solo
    /// (ad esempio con l'iPhone bloccato) finché non ricolleghi il cavo o scegli «Mostra iPhone».
    func windowWillClose(_ notification: Notification) {
        if controller.mode == .fast {
            controller.engine.dismiss()
        }
        NSApp.setActivationPolicy(.accessory)
    }

    // MARK: - Menu

    private func makeStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "iphone", accessibilityDescription: "Specchio iPhone")
        let menu = NSMenu()
        menu.delegate = self
        let status = NSMenuItem(title: controller.status, action: nil, keyEquivalent: "")
        status.isEnabled = false
        statusMenuItem = status
        menu.addItem(status)
        menu.addItem(.separator())
        menu.addItem(action("Mostra iPhone") { [weak self] in self?.showIPhone() })
        let fast = action("Modalità veloce (Xcode 27)") { [weak self] in self?.toggleFastMode() }
        fastModeMenuItem = fast
        menu.addItem(fast)
        let login = action("Apri all'accesso al Mac") { [weak self] in self?.toggleLoginItem() }
        loginMenuItem = login
        menu.addItem(login)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Esci", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        item.menu = menu
        statusItem = item
    }

    /// Aggiorna le voci ogni volta che il menu viene aperto.
    func menuWillOpen(_ menu: NSMenu) {
        statusMenuItem?.title = controller.status
        fastModeMenuItem?.state = controller.prefersFastMode ? .on : .off
        if !MirrorEngine.isInstalled {
            fastModeMenuItem?.title = "Modalità veloce (non disponibile: ricrea l'app con Xcode 27)"
            fastModeMenuItem?.action = nil
        }
        updateLoginMenuItem()
    }

    private func toggleFastMode() {
        controller.prefersFastMode.toggle()
        if controller.mode == .compatibility { showWindow() } else { showIPhone() }
    }

    private func makeMainMenu() -> NSMenu {
        let main = NSMenu()
        func add(_ title: String, _ items: [NSMenuItem]) {
            let menu = NSMenu(title: title)
            items.forEach { menu.addItem($0) }
            let holder = NSMenuItem()
            holder.submenu = menu
            main.addItem(holder)
        }
        func shortcut(_ item: NSMenuItem, _ key: String, _ modifiers: NSEvent.ModifierFlags = [.command, .shift]) -> NSMenuItem {
            item.keyEquivalent = key
            item.keyEquivalentModifierMask = modifiers
            return item
        }
        let wda = controller.wda

        add("Specchio iPhone", [
            NSMenuItem(title: "Nascondi Specchio iPhone", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h"),
            .separator(),
            NSMenuItem(title: "Esci da Specchio iPhone", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"),
        ])
        add("Composizione", [
            NSMenuItem(title: "Taglia", action: #selector(NSText.cut(_:)), keyEquivalent: "x"),
            NSMenuItem(title: "Copia", action: #selector(NSText.copy(_:)), keyEquivalent: "c"),
            NSMenuItem(title: "Incolla sull'iPhone", action: #selector(NSText.paste(_:)), keyEquivalent: "v"),
            NSMenuItem(title: "Seleziona tutto", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"),
        ])
        add("iPhone", [
            shortcut(action("Indietro") { wda.back() }, "b"),
            shortcut(action("Home") { wda.home() }, "h"),
            shortcut(action("App aperte") { wda.appSwitcher() }, "a"),
            shortcut(action("Centro di controllo") { wda.controlCenter() }, "c"),
            shortcut(action("Notifiche") { wda.notifications() }, "n"),
            .separator(),
            shortcut(action("Alza volume") { wda.pressButton("volumeUp") }, "+"),
            shortcut(action("Abbassa volume") { wda.pressButton("volumeDown") }, "-"),
            shortcut(action("Blocca") { wda.lock() }, "l"),
            .separator(),
            shortcut(action("Riconnetti") { [weak self] in self?.controller.reconnect() }, "r", [.command]),
        ])
        add("Finestra", [
            NSMenuItem(title: "Riduci a icona", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"),
            NSMenuItem(title: "Chiudi", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w"),
        ])
        return main
    }

    private func action(_ title: String, _ block: @escaping () -> Void) -> NSMenuItem {
        let handler = MenuAction(block)
        actions.append(handler)
        let item = NSMenuItem(title: title, action: #selector(MenuAction.run), keyEquivalent: "")
        item.target = handler
        return item
    }

    // MARK: - Apertura all'accesso

    private func setUpLoginItem() {
        // La prima volta si attiva da sola: è quello che serve per avere l'app sempre pronta.
        if !UserDefaults.standard.bool(forKey: "loginItemConfigured") {
            UserDefaults.standard.set(true, forKey: "loginItemConfigured")
            try? SMAppService.mainApp.register()
        }
        updateLoginMenuItem()
    }

    private func toggleLoginItem() {
        if SMAppService.mainApp.status == .enabled {
            try? SMAppService.mainApp.unregister()
        } else {
            try? SMAppService.mainApp.register()
        }
        updateLoginMenuItem()
    }

    private func updateLoginMenuItem() {
        loginMenuItem?.state = SMAppService.mainApp.status == .enabled ? .on : .off
    }
}

private func fourCharCode(_ text: String) -> UInt32 {
    text.utf8.reduce(0) { $0 << 8 | UInt32($1) }
}

private final class MenuAction: NSObject {
    private let block: () -> Void

    init(_ block: @escaping () -> Void) {
        self.block = block
    }

    @objc func run() {
        block()
    }
}
