import AppKit
import AVFoundation
import SwiftUI

/// Mostra lo schermo dell'iPhone e trasforma mouse, trackpad e tastiera in comandi per l'iPhone.
struct MirrorView: NSViewRepresentable {
    let session: AVCaptureSession
    let videoSize: CGSize
    let wda: WDAClient

    func makeNSView(context: Context) -> MirrorNSView {
        MirrorNSView(session: session)
    }

    func updateNSView(_ view: MirrorNSView, context: Context) {
        view.videoSize = videoSize
        view.wda = wda
    }
}

final class MirrorNSView: NSView {
    var videoSize: CGSize = .zero
    weak var wda: WDAClient?

    private let previewLayer: AVCaptureVideoPreviewLayer
    private var pressStart: (point: CGPoint, time: TimeInterval)?
    private var scrollOrigin: CGPoint?
    private var scrollAmount: CGSize = .zero
    private var scrollTimer: Timer?

    init(session: AVCaptureSession) {
        previewLayer = AVCaptureVideoPreviewLayer(session: session)
        super.init(frame: .zero)
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor
        previewLayer.videoGravity = .resizeAspect
        layer?.addSublayer(previewLayer)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) non supportato")
    }

    override var isFlipped: Bool { true }
    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func layout() {
        super.layout()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        previewLayer.frame = bounds
        CATransaction.commit()
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        window?.makeFirstResponder(self)
    }

    // MARK: - Coordinate

    /// Zona della finestra occupata dall'immagine dell'iPhone (senza le bande nere).
    private var videoRect: CGRect {
        guard videoSize.width > 0, videoSize.height > 0 else { return .zero }
        return AVMakeRect(aspectRatio: videoSize, insideRect: bounds)
    }

    /// Posizione del mouse da 0 a 1 rispetto allo schermo dell'iPhone.
    private func normalized(_ event: NSEvent) -> CGPoint? {
        let rect = videoRect
        guard rect.width > 0, rect.height > 0 else { return nil }
        let point = convert(event.locationInWindow, from: nil)
        return CGPoint(x: clamp((point.x - rect.minX) / rect.width, 0, 1),
                       y: clamp((point.y - rect.minY) / rect.height, 0, 1))
    }

    // MARK: - Mouse e trackpad

    override func mouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        guard videoRect.contains(convert(event.locationInWindow, from: nil)), let point = normalized(event) else {
            pressStart = nil
            return
        }
        pressStart = (point: point, time: event.timestamp)
    }

    override func mouseUp(with event: NSEvent) {
        guard let start = pressStart, let end = normalized(event) else { return }
        pressStart = nil
        // Clic = tocco, clic tenuto = pressione prolungata, trascinamento = swipe.
        wda?.gesture(from: start.point, to: end, duration: event.timestamp - start.time)
    }

    override func scrollWheel(with event: NSEvent) {
        // L'inerzia la aggiunge già l'iPhone: si ignora quella del Mac.
        guard event.momentumPhase.isEmpty, let point = normalized(event) else { return }
        let rect = videoRect
        if scrollOrigin == nil {
            scrollOrigin = point
            scrollAmount = .zero
        }
        let factor: CGFloat = event.hasPreciseScrollingDeltas ? 1 : 10
        scrollAmount.width += event.scrollingDeltaX * factor / rect.width
        scrollAmount.height += event.scrollingDeltaY * factor / rect.height

        // Lo scorrimento viene inviato come un unico swipe quando le dita si fermano.
        scrollTimer?.invalidate()
        scrollTimer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: false) { [weak self] _ in
            self?.flushScroll()
        }
    }

    private func flushScroll() {
        guard let origin = scrollOrigin else { return }
        scrollOrigin = nil
        let dx = clamp(scrollAmount.width, -0.6, 0.6)
        let dy = clamp(scrollAmount.height, -0.6, 0.6)
        guard abs(dx) > 0.01 || abs(dy) > 0.01 else { return }
        let start = CGPoint(x: clamp(origin.x, 0.1, 0.9), y: clamp(origin.y, 0.1, 0.9))
        let end = CGPoint(x: clamp(start.x + dx, 0.02, 0.98), y: clamp(start.y + dy, 0.02, 0.98))
        wda?.gesture(from: start, to: end, duration: 0.25)
    }

    // MARK: - Tastiera

    override func keyDown(with event: NSEvent) {
        if event.modifierFlags.contains(.command) {
            super.keyDown(with: event)
            return
        }
        switch event.keyCode {
        case 51: wda?.type("\u{8}")       // Cancella
        case 117: wda?.type("\u{7F}")     // Cancella avanti
        case 36, 76: wda?.type("\n")      // Invio
        case 48: wda?.type("\t")          // Tab
        default:
            guard let characters = event.characters else { return }
            // Si scartano i tasti speciali (frecce, funzione…), che l'iPhone non capisce.
            let printable = characters.unicodeScalars.filter {
                !CharacterSet.controlCharacters.contains($0) && !(0xF700...0xF8FF).contains($0.value)
            }
            var text = ""
            text.unicodeScalars.append(contentsOf: printable)
            if !text.isEmpty { wda?.type(text) }
        }
    }

    /// ⌘V: incolla sull'iPhone il testo copiato sul Mac.
    @objc func paste(_ sender: Any?) {
        if let text = NSPasteboard.general.string(forType: .string), !text.isEmpty {
            wda?.type(text)
        }
    }
}

private func clamp(_ value: CGFloat, _ low: CGFloat, _ high: CGFloat) -> CGFloat {
    min(max(value, low), high)
}
