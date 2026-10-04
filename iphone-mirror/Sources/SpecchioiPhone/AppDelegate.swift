import AppKit
import Combine
import ServiceManagement
import SwiftUI

/// Avvio dell'app: icona nella barra dei menu, apertura all'accesso al Mac,
/// e finestra che compare da sola quando colleghi l'iPhone.
@main
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private var controller: AppController!
    private var window: NSWindow?
    private var statusItem: NSStatusItem?
    private var loginMenuItem: NSMenuItem?
    private var actions: [MenuAction] = []
    private var cancellables: Set<AnyCancellable> = []
    private var launchedAtLogin = false

    static func main() {
        signal(SIGPIPE, SIG_IGN)
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

        // Appena l'iPhone viene collegato, la finestra si apre da sola.
        controller.capture.$deviceName
            .removeDuplicates()
            .dropFirst()
            .sink { [weak self] name in
                if name != nil { self?.showWindow() }
            }
            .store(in: &cancellables)

        if !launchedAtLogin {
            showWindow()
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWindow()
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationWillTerminate(_ notification: Notification) {
        controller.shutdown()
    }

    // MARK: - Finestra

    @objc func showWindow() {
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
        NSApp.setActivationPolicy(.regular)
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Chiudendo la finestra l'app resta nella barra dei menu, pronta per la prossima volta.
    func windowWillClose(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
    }

    // MARK: - Menu

    private func makeStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "iphone", accessibilityDescription: "Specchio iPhone")
        let menu = NSMenu()
        menu.addItem(action("Mostra iPhone") { [weak self] in self?.showWindow() })
        let login = action("Apri all'accesso al Mac") { [weak self] in self?.toggleLoginItem() }
        loginMenuItem = login
        menu.addItem(login)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Esci", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        item.menu = menu
        statusItem = item
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
