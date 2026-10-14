"""Crea Eve.app: un'app macOS che avvia Eve dal Dock con l'HUD in una finestra."""

from __future__ import annotations

import os
import plistlib
import shutil
import stat
import sys
from pathlib import Path

ICON = Path(__file__).parent / "ui" / "static" / "eve.icns"
LAUNCHER_SOURCE = Path(__file__).parent / "launcher.c"


LAUNCHER_TEMPLATE = """#!/bin/bash
# Avviato da @NAME@.app: esegue Eve dall'ambiente del progetto e tiene un log.
# Se Eve termina subito con un errore, lo mostra in una finestra.
cd "@PROJECT@"
mkdir -p "@LOGDIR@"
echo "=== avvio $(date) ===" >> "@LOG@"
"@PYTHON@" -m eve@CONFIG@ run --window >> "@LOG@" 2>&1
status=$?
if [ "$status" -ne 0 ]; then
  tail_text=$(tail -n 12 "@LOG@")
  osascript -e 'on run argv' -e 'display alert (item 1 of argv) message (item 2 of argv) as critical' -e 'end run' "@NAME@ si è fermato (codice $status)" "$tail_text" >/dev/null 2>&1
fi
exit $status
"""


def launcher_script(project_dir: Path, python: Path, config: Path | None, log: Path, name: str = "Eve") -> str:
    config_arg = f' --config "{config}"' if config else ""
    return (
        LAUNCHER_TEMPLATE.replace("@NAME@", name)
        .replace("@PROJECT@", str(project_dir))
        .replace("@LOGDIR@", str(log.parent))
        .replace("@LOG@", str(log))
        .replace("@PYTHON@", str(python))
        .replace("@CONFIG@", config_arg)
    )


def info_plist(name: str, bundle_id: str) -> dict:
    return {
        "CFBundleName": name,
        "CFBundleDisplayName": name,
        "CFBundleIdentifier": bundle_id,
        "CFBundleVersion": "0.1.0",
        "CFBundleShortVersionString": "0.1.0",
        "CFBundlePackageType": "APPL",
        "CFBundleExecutable": "launch",
        "CFBundleIconFile": "eve.icns",
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
    name: str = "Eve",
    bundle_id: str = "it.denis.eve",
    native: bool | None = None,
) -> Path:
    """Crea (o aggiorna) `<dest_dir>/<name>.app` e ritorna il percorso.

    Con `native` (predefinito: su macOS con clang disponibile) l'eseguibile è compilato da
    launcher.c e incorpora Python: è ciò che permette a macOS di chiedere e concedere il
    microfono all'app. Altrimenti si ripiega su uno script di shell.
    """
    python = python or Path(sys.executable)
    app = dest_dir / f"{name}.app"
    contents = app / "Contents"
    if app.exists():
        shutil.rmtree(app)
    (contents / "MacOS").mkdir(parents=True)
    (contents / "Resources").mkdir(parents=True)
    with open(contents / "Info.plist", "wb") as handle:
        plistlib.dump(info_plist(name, bundle_id), handle)
    log = Path.home() / "Library" / "Logs" / f"{name.lower()}.log"
    launcher = contents / "MacOS" / "launch"
    if native is None:
        native = is_macos() and shutil.which("clang") is not None
    compiled = native and compile_launcher(launcher, python, project_dir, config, log, name)
    if not compiled:
        launcher.write_text(launcher_script(project_dir, python, config, log, name))
        launcher.chmod(launcher.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    build_app.last_native = bool(compiled)  # type: ignore[attr-defined]
    if ICON.exists():
        shutil.copy(ICON, contents / "Resources" / "eve.icns")
    (contents / "PkgInfo").write_text("APPL????")
    codesign(app)
    return app


def python_config_tool(python: Path) -> Path | None:
    """Lo strumento pythonX.Y-config dell'installazione di base (non della .venv)."""
    import subprocess

    try:
        out = subprocess.run(
            [str(python), "-c", "import sys; print(sys.base_prefix); print(sys.version_info[0]); print(sys.version_info[1])"],
            capture_output=True,
            text=True,
            timeout=30,
        ).stdout.split()
        base, major, minor = Path(out[0]), out[1], out[2]
    except (OSError, IndexError, subprocess.TimeoutExpired):
        return None
    for candidate in (base / "bin" / f"python{major}.{minor}-config", base / "bin" / "python3-config"):
        if candidate.exists():
            return candidate
    return None


def compile_launcher(target: Path, python: Path, project_dir: Path, config: Path | None, log: Path, name: str) -> bool:
    """Compila launcher.c in `target`. Ritorna False (senza eccezioni) se non è possibile."""
    import subprocess

    tool = python_config_tool(python)
    if tool is None or not LAUNCHER_SOURCE.exists():
        return False
    try:
        cflags = subprocess.run([str(tool), "--cflags"], capture_output=True, text=True, timeout=30).stdout.split()
        ldflags = subprocess.run([str(tool), "--ldflags", "--embed"], capture_output=True, text=True, timeout=30).stdout.split()
    except (OSError, subprocess.TimeoutExpired):
        return False
    try:
        info = subprocess.run(
            [str(python), "-c", "import sys, sysconfig; print(sysconfig.get_paths()['purelib']); print(sys.prefix)"],
            capture_output=True,
            text=True,
            timeout=30,
        ).stdout.split()
        site_dir, venv_dir = info[0], info[1]
    except (OSError, IndexError, subprocess.TimeoutExpired):
        return False
    defines = [
        f'-DEVE_PYTHON="{python}"',
        f'-DEVE_SITE="{site_dir}"',
        f'-DEVE_VENV="{venv_dir}"',
        f'-DEVE_PROJECT="{project_dir}"',
        f'-DEVE_CONFIG="{config or ""}"',
        f'-DEVE_LOG="{log}"',
        f'-DEVE_NAME="{name}"',
    ]
    command = ["clang", "-O2", *cflags, *defines, str(LAUNCHER_SOURCE), "-o", str(target), *ldflags]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=300)
    except (OSError, subprocess.TimeoutExpired):
        return False
    if result.returncode != 0:
        print("Compilazione dell'eseguibile fallita, uso lo script di avvio:\n" + result.stderr[-1500:])
        return False
    return True


def codesign(app: Path) -> bool:
    """Firma locale (ad hoc): su Apple Silicon macOS rifiuta i pacchetti senza firma."""
    if shutil.which("codesign") is None:
        return False
    import subprocess

    result = subprocess.run(["codesign", "--force", "--deep", "--sign", "-", str(app)], capture_output=True, text=True)
    return result.returncode == 0


def default_dest() -> Path:
    apps = Path.home() / "Applications"
    apps.mkdir(exist_ok=True)
    return apps


def is_macos() -> bool:
    return sys.platform == "darwin" or os.uname().sysname == "Darwin"
