// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "SpecchioiPhone",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "SpecchioiPhone", path: "Sources/SpecchioiPhone")
    ]
)
