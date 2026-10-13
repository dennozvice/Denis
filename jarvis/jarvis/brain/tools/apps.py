"""Aprire e chiudere applicazioni, siti e file."""

from __future__ import annotations

import os
import shutil
import subprocess
import webbrowser
from pathlib import Path
from typing import Any

from jarvis.brain.tools.base import Tool, ToolRegistry, current_os, osascript, run


def open_app(args: dict[str, Any]) -> str:
    name = str(args["name"]).strip()
    system = current_os()
    if system == "macos":
        result = run(["open", "-a", name])
        if result.returncode != 0:
            return f"Non trovo un'applicazione chiamata {name}."
        return f"{name} aperta."
    if system == "windows":
        subprocess.Popen(["cmd", "/c", "start", "", name], shell=False)
        return f"{name} avviata."
    binary = shutil.which(name) or shutil.which(name.lower())
    if binary:
        subprocess.Popen([binary], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return f"{name} avviata."
    if shutil.which("gtk-launch"):
        result = run(["gtk-launch", name.lower()])
        if result.returncode == 0:
            return f"{name} avviata."
    return f"Non trovo un'applicazione chiamata {name}."


def close_app(args: dict[str, Any]) -> str:
    name = str(args["name"]).strip()
    system = current_os()
    if system == "macos":
        osascript(f'tell application "{name}" to quit')
        return f"{name} chiusa."
    if system == "windows":
        exe = name if name.lower().endswith(".exe") else f"{name}.exe"
        result = run(["taskkill", "/IM", exe])
        return f"{name} chiusa." if result.returncode == 0 else f"Non riesco a chiudere {name}."
    result = run(["pkill", "-f", "-i", name])
    return f"{name} chiusa." if result.returncode == 0 else f"{name} non sembra in esecuzione."


def open_url(args: dict[str, Any]) -> str:
    url = str(args["url"]).strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    webbrowser.open(url)
    return f"Apro {url}."


def open_path(args: dict[str, Any]) -> str:
    path = Path(os.path.expanduser(str(args["path"]))).resolve()
    if not path.exists():
        return f"Il percorso {path} non esiste."
    system = current_os()
    if system == "macos":
        run(["open", str(path)])
    elif system == "windows":
        os.startfile(str(path))  # type: ignore[attr-defined]
    else:
        subprocess.Popen(["xdg-open", str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return f"Apro {path.name}."


def register(registry: ToolRegistry) -> None:
    registry.add(
        Tool(
            name="open_app",
            description="Apre o porta in primo piano un'applicazione installata sul computer (es. Safari, Spotify, Mail, Terminal, Visual Studio Code).",
            properties={"name": {"type": "string", "description": "Nome dell'applicazione come appare nel sistema."}},
            handler=open_app,
        )
    )
    registry.add(
        Tool(
            name="close_app",
            description="Chiude un'applicazione in esecuzione.",
            properties={"name": {"type": "string", "description": "Nome dell'applicazione."}},
            handler=close_app,
        )
    )
    registry.add(
        Tool(
            name="open_url",
            description="Apre un indirizzo web nel browser predefinito. Per una ricerca su Google usa https://www.google.com/search?q=... (per rispondere a una domanda usa invece web_search).",
            properties={"url": {"type": "string", "description": "URL completo."}},
            handler=open_url,
        )
    )
    registry.add(
        Tool(
            name="open_path",
            description="Apre un file o una cartella del computer con l'applicazione predefinita (es. ~/Downloads, ~/Documents/relazione.pdf).",
            properties={"path": {"type": "string", "description": "Percorso del file o della cartella; ~ indica la home."}},
            handler=open_path,
        )
    )
