import AVFoundation
import CoreMediaIO
import Foundation

/// Riceve lo schermo dell'iPhone collegato con il cavo, come fa QuickTime.
final class CaptureManager: ObservableObject {
    @Published private(set) var deviceName: String?
    @Published private(set) var videoSize: CGSize = .zero
    @Published private(set) var cameraDenied = false

    /// Falso nella modalità veloce: il video arriva dallo specchio, non da qui.
    var isEnabled = true {
        didSet {
            guard isEnabled != oldValue else { return }
            if isEnabled { findDevice() } else { stop() }
        }
    }

    let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "specchio.capture")
    private var currentDevice: AVCaptureDevice?
    private var observers: [NSObjectProtocol] = []
    private var accessRequested = false

    init() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: .AVCaptureDeviceWasConnected, object: nil, queue: .main) { [weak self] _ in
            self?.findDevice()
        })
        observers.append(center.addObserver(forName: .AVCaptureDeviceWasDisconnected, object: nil, queue: .main) { [weak self] note in
            guard let self, let device = note.object as? AVCaptureDevice, device == self.currentDevice else { return }
            self.stop()
        })
        // Cambia quando l'iPhone ruota o cambia risoluzione.
        observers.append(center.addObserver(forName: .AVCaptureInputPortFormatDescriptionDidChange, object: nil, queue: .main) { [weak self] note in
            guard let port = note.object as? AVCaptureInput.Port, port.mediaType == .video,
                  let description = port.formatDescription else { return }
            self?.updateVideoSize(description)
        })
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    /// Senza questa opzione macOS non mostra gli iPhone collegati come sorgenti video.
    private static func allowScreenCaptureDevices() {
        var address = CMIOObjectPropertyAddress(
            mSelector: CMIOObjectPropertySelector(kCMIOHardwarePropertyAllowScreenCaptureDevices),
            mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
            mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain)
        )
        var allow: UInt32 = 1
        CMIOObjectSetPropertyData(CMIOObjectID(kCMIOObjectSystemObject), &address, 0, nil,
                                  UInt32(MemoryLayout<UInt32>.size), &allow)
    }

    func findDevice() {
        guard isEnabled, currentDevice == nil, !cameraDenied else { return }
        // Permesso e sorgenti iPhone si preparano solo la prima volta che servono
        // (nella modalità veloce non servono affatto).
        guard accessRequested else {
            accessRequested = true
            Self.allowScreenCaptureDevices()
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    self.cameraDenied = !granted
                    self.findDevice()
                }
            }
            return
        }
        let types: [AVCaptureDevice.DeviceType]
        if #available(macOS 14.0, *) {
            types = [.external]
        } else {
            types = [.externalUnknown]
        }
        // Gli iPhone compaiono come dispositivi "muxed" (audio + video insieme).
        let discovery = AVCaptureDevice.DiscoverySession(deviceTypes: types, mediaType: .muxed, position: .unspecified)
        guard let device = discovery.devices.first else { return }
        start(device)
    }

    private func start(_ device: AVCaptureDevice) {
        currentDevice = device
        deviceName = device.localizedName
        updateVideoSize(device.activeFormat.formatDescription)

        sessionQueue.async { [session] in
            session.beginConfiguration()
            session.inputs.forEach(session.removeInput)
            if let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) {
                session.addInput(input)
            }
            session.commitConfiguration()
            if !session.isRunning { session.startRunning() }
        }
    }

    func stop() {
        currentDevice = nil
        deviceName = nil
        videoSize = .zero
        sessionQueue.async { [session] in
            session.stopRunning()
            session.inputs.forEach(session.removeInput)
        }
    }

    private func updateVideoSize(_ description: CMFormatDescription) {
        let dimensions = CMVideoFormatDescriptionGetDimensions(description)
        guard dimensions.width > 0, dimensions.height > 0 else { return }
        videoSize = CGSize(width: Int(dimensions.width), height: Int(dimensions.height))
    }
}
