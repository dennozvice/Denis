"""Crea Jarvis.app: un'app macOS che avvia Jarvis dal Dock con l'HUD in una finestra."""

from __future__ import annotations

import os
import plistlib
import shutil
import stat
import sys
from pathlib import Path

ICON = Path(__file__).parent / "ui" / "static" / "jarvis.icns"


def launcher_script(project_dir: Path, python: Path, config: Path | None, log: Path) -> str:
    config_arg = f' --config "{config}"' if config else ""
    return f"""#!/bin/bash
# Avviato da Jarvis.app: esegue Jarvis dall'ambiente del progetto e tiene un log.
cd "{project_dir}"
mkdir -p "{log.parent}"
exec "{python}" -m jarvis run --window{config_arg} >> "{log}" 2>&1
"""


def info_plist(name: str, bundle_id: str) -> dict:
    return {
        "CFBundleName": name,
        "CFBundleDisplayName": name,
        "CFBundleIdentifier": bundle_id,
        "CFBundleVersion": "0.1.0",
        "CFBundleShortVersionString": "0.1.0",
        "CFBundlePackageType": "APPL",
        "CFBundleExecutable": "launch",
        "CFBundleIconFile": "jarvis.icns",
        "LSMinimumSystemVersion": "12.0",
        "NSHighResolutionCapable": True,
        "NSMicrophoneUsageDescription": f"{name} ascolta la parola di attivazione e le tue richieste.",
        "NSAppleEventsUsageDescription": f"{name} apre e chiude le applicazioni e scrive al posto tuo.",
        "NSSpeechRecognitionUsageDescription": f"{name} trascrive la tua voce in locale.",
    }


def build_app(
    dest_dir: Path,
    project_dir: Path,
    python: Path | None = None,
    config: Path | None = None,
    name: str = "Jarvis",
    bundle_id: str = "it.denis.jarvis",
) -> Path:
    """Crea (o aggiorna) `<dest_dir>/<name>.app` e ritorna il percorso."""
    python = python or Path(sys.executable)
    app = dest_dir / f"{name}.app"
    contents = app / "Contents"
    if app.exists():
        shutil.rmtree(app)
    (contents / "MacOS").mkdir(parents=True)
    (contents / "Resources").mkdir(parents=True)
    with open(contents / "Info.plist", "wb") as handle:
        plistlib.dump(info_plist(name, bundle_id), handle)
    log = Path.home() / "Library" / "Logs" / "jarvis.log"
    launcher = contents / "MacOS" / "launch"
    launcher.write_text(launcher_script(project_dir, python, config, log))
    launcher.chmod(launcher.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    if ICON.exists():
        shutil.copy(ICON, contents / "Resources" / "jarvis.icns")
    (contents / "PkgInfo").write_text("APPL????")
    return app


def default_dest() -> Path:
    apps = Path.home() / "Applications"
    apps.mkdir(exist_ok=True)
    return apps


def is_macos() -> bool:
    return sys.platform == "darwin" or os.uname().sysname == "Darwin"
