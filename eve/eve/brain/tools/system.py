"""Controllo del computer: volume, schermo, screenshot, scrittura, comandi di terminale."""

from __future__ import annotations

import datetime as dt
import shutil
import subprocess
from pathlib import Path
from typing import Any

from eve.brain.tools.base import NeedsConfirmation, Tool, ToolRegistry, current_os, osascript, run


def get_datetime(args: dict[str, Any]) -> str:
    now = dt.datetime.now()
    giorni = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]
    return f"{giorni[now.weekday()]} {now.day}/{now.month}/{now.year}, ore {now:%H:%M}"


def set_volume(args: dict[str, Any]) -> str:
    level = args.get("level")
    mute = bool(args.get("mute"))
    system = current_os()
    if system == "macos":
        if mute:
            osascript("set volume with output muted")
            return "Audio disattivato."
        if level is None:
            return "Indica un livello tra 0 e 100."
        level = int(max(0, min(100, level)))
        osascript(f"set volume without output muted\nset volume output volume {level}")
        return f"Volume al {level} percento."
    if system == "linux":
        if shutil.which("pactl"):
            if mute:
                run(["pactl", "set-sink-mute", "@DEFAULT_SINK@", "1"])
                return "Audio disattivato."
            level = int(max(0, min(100, level or 0)))
            run(["pactl", "set-sink-mute", "@DEFAULT_SINK@", "0"])
            run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{level}%"])
            return f"Volume al {level} percento."
        if shutil.which("amixer"):
            level = int(max(0, min(100, level or 0)))
            run(["amixer", "set", "Master", "mute" if mute else f"{level}%"])
            return "Audio disattivato." if mute else f"Volume al {level} percento."
        return "Nessun controllo del volume disponibile."
    if system == "windows":
        return "Controllo del volume non ancora disponibile su Windows."
    return "Sistema non supportato."


def lock_screen(args: dict[str, Any]) -> str:
    system = current_os()
    if system == "macos":
        run(["pmset", "displaysleepnow"])
        return "Schermo bloccato."
    if system == "windows":
        run(["rundll32.exe", "user32.dll,LockWorkStation"])
        return "Schermo bloccato."
    for cmd in (["loginctl", "lock-session"], ["xdg-screensaver", "lock"], ["gnome-screensaver-command", "-l"]):
        if shutil.which(cmd[0]):
            run(cmd)
            return "Schermo bloccato."
    return "Nessun comando di blocco disponibile."


def power(args: dict[str, Any]) -> str:
    action = str(args["action"])
    if not args.get("_confirmed"):
        raise NeedsConfirmation({"sleep": "mettere il computer in standby", "shutdown": "spegnere il computer", "restart": "riavviare il computer"}[action])
    system = current_os()
    commands = {
        "macos": {
            "sleep": ["pmset", "sleepnow"],
            "shutdown": ["osascript", "-e", 'tell application "System Events" to shut down'],
            "restart": ["osascript", "-e", 'tell application "System Events" to restart'],
        },
        "windows": {
            "sleep": ["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"],
            "shutdown": ["shutdown", "/s", "/t", "5"],
            "restart": ["shutdown", "/r", "/t", "5"],
        },
        "linux": {
            "sleep": ["systemctl", "suspend"],
            "shutdown": ["systemctl", "poweroff"],
            "restart": ["systemctl", "reboot"],
        },
    }
    run(commands[system][action])
    return {"sleep": "Vado in standby.", "shutdown": "Spengo il computer.", "restart": "Riavvio il computer."}[action]


def screenshot(args: dict[str, Any]) -> str:
    folder = Path.home() / "Desktop"
    if not folder.exists():
        folder = Path.home()
    target = folder / f"screenshot-{dt.datetime.now():%Y%m%d-%H%M%S}.png"
    system = current_os()
    if system == "macos":
        run(["screencapture", "-x", str(target)])
    elif system == "linux":
        for cmd in (["gnome-screenshot", "-f", str(target)], ["scrot", str(target)], ["import", "-window", "root", str(target)]):
            if shutil.which(cmd[0]):
                run(cmd)
                break
        else:
            return "Nessuno strumento per gli screenshot trovato."
    else:
        return "Screenshot non ancora disponibile su Windows."
    return f"Screenshot salvato in {target}." if target.exists() else "Lo screenshot non è stato salvato."


def type_text(args: dict[str, Any]) -> str:
    text = str(args["text"])
    system = current_os()
    if system == "macos":
        escaped = text.replace("\\", "\\\\").replace('"', '\\"')
        osascript(f'tell application "System Events" to keystroke "{escaped}"')
        return "Scritto."
    if system == "linux" and shutil.which("xdotool"):
        run(["xdotool", "type", "--delay", "20", text])
        return "Scritto."
    return "Scrittura automatica non disponibile su questo sistema."


def run_shell(args: dict[str, Any]) -> str:
    command = str(args["command"])
    if not args.get("_confirmed"):
        raise NeedsConfirmation(f"eseguire il comando: {command}")
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=60)
    except subprocess.TimeoutExpired:
        return "Il comando non ha terminato entro un minuto."
    output = (result.stdout + result.stderr).strip()
    output = output[-2000:] if len(output) > 2000 else output
    return f"Codice di uscita {result.returncode}.\n{output}" if output else f"Codice di uscita {result.returncode}, nessun output."


def system_info(args: dict[str, Any]) -> str:
    import os
    import platform

    parts = [f"Sistema: {platform.system()} {platform.release()}", f"Processori: {os.cpu_count()}"]
    usage = shutil.disk_usage(Path.home())
    parts.append(f"Disco libero: {usage.free / 1e9:.0f} GB su {usage.total / 1e9:.0f} GB")
    if current_os() == "macos":
        result = run(["pmset", "-g", "batt"])
        for line in result.stdout.splitlines():
            if "%" in line:
                parts.append("Batteria: " + line.split("\t")[-1].strip())
    elif current_os() == "linux":
        capacity = Path("/sys/class/power_supply/BAT0/capacity")
        if capacity.exists():
            parts.append(f"Batteria: {capacity.read_text().strip()}%")
    return "\n".join(parts)


def register(registry: ToolRegistry, allow_shell: bool = False, allow_power: bool = True, typing: bool = True) -> None:
    registry.add(Tool("get_datetime", "Data e ora correnti del computer.", get_datetime))
    registry.add(
        Tool(
            "set_volume",
            "Imposta il volume dell'audio di sistema o lo disattiva.",
            set_volume,
            properties={
                "level": {"type": ["integer", "null"], "description": "Volume da 0 a 100 (null se si vuole solo disattivare)."},
                "mute": {"type": "boolean", "description": "true per disattivare l'audio."},
            },
        )
    )
    registry.add(Tool("lock_screen", "Blocca lo schermo del computer.", lock_screen))
    registry.add(Tool("screenshot", "Scatta uno screenshot dello schermo e lo salva sulla scrivania.", screenshot))
    registry.add(Tool("system_info", "Informazioni sul computer: sistema, batteria, spazio su disco.", system_info))
    if allow_power:
        registry.add(
            Tool(
                "power",
                "Standby, spegnimento o riavvio del computer. Richiede conferma dell'utente.",
                power,
                properties={"action": {"type": "string", "enum": ["sleep", "shutdown", "restart"]}},
                dangerous=True,
            )
        )
    if typing:
        registry.add(
            Tool(
                "type_text",
                "Scrive un testo nella finestra attualmente attiva, come se lo digitasse l'utente.",
                type_text,
                properties={"text": {"type": "string", "description": "Testo da scrivere."}},
            )
        )
    if allow_shell:
        registry.add(
            Tool(
                "run_shell",
                "Esegue un comando nel terminale del computer e restituisce l'output. Richiede conferma dell'utente.",
                run_shell,
                properties={"command": {"type": "string", "description": "Comando shell completo."}},
                dangerous=True,
            )
        )
