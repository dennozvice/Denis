import Foundation

/// Parla con usbmuxd, il servizio di macOS che gestisce gli iPhone collegati via USB
/// (lo stesso usato da Finder e Xcode). Serve per raggiungere WebDriverAgent passando dal cavo.
enum USBMux {
    struct Device: Equatable {
        let id: Int
        let udid: String
    }

    /// iPhone collegati con il cavo.
    static func devices() -> [Device] {
        guard let fd = openSocket() else { return [] }
        defer { close(fd) }
        guard let reply = exchange(fd, ["MessageType": "ListDevices"]),
              let list = reply["DeviceList"] as? [[String: Any]] else { return [] }
        return list.compactMap { entry in
            guard let properties = entry["Properties"] as? [String: Any],
                  (properties["ConnectionType"] as? String) == "USB",
                  let id = (entry["DeviceID"] as? NSNumber)?.intValue,
                  let udid = properties["SerialNumber"] as? String else { return nil }
            return Device(id: id, udid: udid)
        }
    }

    /// Apre un collegamento diretto con una porta TCP dell'iPhone. Restituisce il socket, oppure nil.
    static func connect(deviceID: Int, port: UInt16) -> Int32? {
        guard let fd = openSocket() else { return nil }
        let message: [String: Any] = [
            "MessageType": "Connect",
            "DeviceID": deviceID,
            "PortNumber": Int(port.bigEndian),
        ]
        guard let reply = exchange(fd, message), (reply["Number"] as? NSNumber)?.intValue == 0 else {
            close(fd)
            return nil
        }
        return fd
    }

    private static func openSocket() -> Int32? {
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { return nil }
        var address = sockaddr_un()
        address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
        address.sun_family = sa_family_t(AF_UNIX)
        withUnsafeMutableBytes(of: &address.sun_path) { destination in
            "/var/run/usbmuxd".utf8CString.withUnsafeBytes { source in
                destination.copyMemory(from: UnsafeRawBufferPointer(rebasing: source.prefix(destination.count)))
            }
        }
        let result = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard result == 0 else {
            close(fd)
            return nil
        }
        Socket.disableSigPipe(fd)
        return fd
    }

    /// Invia un messaggio (plist) e legge la risposta.
    private static func exchange(_ fd: Int32, _ message: [String: Any]) -> [String: Any]? {
        var payload = message
        payload["ClientVersionString"] = "SpecchioiPhone"
        payload["ProgName"] = "SpecchioiPhone"
        guard let body = try? PropertyListSerialization.data(fromPropertyList: payload, format: .xml, options: 0) else { return nil }

        // Intestazione: lunghezza totale, versione 1, tipo 8 (plist), numero del messaggio.
        var header = Data()
        for value in [UInt32(16 + body.count), 1, 8, 1] {
            withUnsafeBytes(of: value.littleEndian) { header.append(contentsOf: $0) }
        }
        guard Socket.writeAll(fd, header + body),
              let replyHeader = Socket.readExactly(fd, 16) else { return nil }
        let length = replyHeader.prefix(4).enumerated().reduce(0) { $0 | Int($1.element) << (8 * $1.offset) }
        guard length >= 16, length < 1 << 24,
              let replyBody = Socket.readExactly(fd, length - 16) else { return nil }
        return (try? PropertyListSerialization.propertyList(from: replyBody, format: nil)) as? [String: Any]
    }
}

enum Socket {
    static func disableSigPipe(_ fd: Int32) {
        var one: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size))
    }

    static func writeAll(_ fd: Int32, _ data: Data) -> Bool {
        data.withUnsafeBytes { buffer in
            writeAll(fd, buffer.baseAddress, buffer.count)
        }
    }

    static func writeAll(_ fd: Int32, _ pointer: UnsafeRawPointer?, _ count: Int) -> Bool {
        guard let pointer else { return count == 0 }
        var sent = 0
        while sent < count {
            let n = write(fd, pointer + sent, count - sent)
            if n < 0 && errno == EINTR { continue }
            if n <= 0 { return false }
            sent += n
        }
        return true
    }

    static func readExactly(_ fd: Int32, _ count: Int) -> Data? {
        var data = Data(count: count)
        var received = 0
        let ok = data.withUnsafeMutableBytes { buffer -> Bool in
            guard let base = buffer.baseAddress else { return count == 0 }
            while received < count {
                let n = read(fd, base + received, count - received)
                if n < 0 && errno == EINTR { continue }
                if n <= 0 { return false }
                received += n
            }
            return true
        }
        return ok ? data : nil
    }
}

/// Rende raggiungibile una porta dell'iPhone su 127.0.0.1 passando dal cavo USB (come fa iproxy).
final class PortForwarder {
    let localPort: UInt16
    private let listener: Int32
    private let deviceID: Int
    private let remotePort: UInt16

    init?(deviceID: Int, remotePort: UInt16) {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return nil }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = 0 // porta libera scelta dal sistema
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let bound = withUnsafeMutablePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(fd, $0, length) == 0 && listen(fd, 16) == 0 && getsockname(fd, $0, &length) == 0
            }
        }
        guard bound else {
            close(fd)
            return nil
        }
        listener = fd
        localPort = UInt16(bigEndian: address.sin_port)
        self.deviceID = deviceID
        self.remotePort = remotePort
        Thread.detachNewThread { [listener, deviceID, remotePort] in
            Self.acceptLoop(listener: listener, deviceID: deviceID, remotePort: remotePort)
        }
    }

    func stop() {
        shutdown(listener, SHUT_RDWR)
        close(listener)
    }

    private static func acceptLoop(listener: Int32, deviceID: Int, remotePort: UInt16) {
        while true {
            let client = accept(listener, nil, nil)
            if client < 0 {
                if errno == EINTR { continue }
                return // fermato
            }
            Socket.disableSigPipe(client)
            Thread.detachNewThread {
                guard let device = USBMux.connect(deviceID: deviceID, port: remotePort) else {
                    close(client)
                    return
                }
                PortForwarder.relay(client, device)
            }
        }
    }

    /// Copia i dati nei due sensi finché uno dei due lati chiude.
    private static func relay(_ a: Int32, _ b: Int32) {
        let group = DispatchGroup()
        for (from, to) in [(a, b), (b, a)] {
            group.enter()
            Thread.detachNewThread {
                var buffer = [UInt8](repeating: 0, count: 65536)
                while true {
                    let n = read(from, &buffer, buffer.count)
                    if n < 0 && errno == EINTR { continue }
                    if n <= 0 { break }
                    let ok = buffer.withUnsafeBytes { Socket.writeAll(to, $0.baseAddress, n) }
                    if !ok { break }
                }
                shutdown(a, SHUT_RDWR)
                shutdown(b, SHUT_RDWR)
                group.leave()
            }
        }
        group.wait()
        close(a)
        close(b)
    }
}
