"""Sintesi vocale tramite gli strumenti di sistema (nessuna dipendenza extra)."""

from __future__ import annotations

import platform
import shlex
import shutil
import subprocess
import threading
from typing import Protocol


class Speaker(Protocol):
    def speak(self, text: str) -> None: ...

    def stop(self) -> None: ...


class SilentSpeaker:
    """Per i test e la modalità solo testo."""

    def __init__(self) -> None:
        self.spoken: list[str] = []

    def speak(self, text: str) -> None:
        self.spoken.append(text)

    def stop(self) -> None:
        pass


def detect_backend() -> str:
    system = platform.system()
    if system == "Darwin" and shutil.which("say"):
        return "say"
    if system == "Windows":
        return "powershell"
    if shutil.which("espeak-ng") or shutil.which("espeak"):
        return "espeak"
    return "none"


def build_command(backend: str, text: str, voice: str = "", rate: int = 0, command: str = "", language: str = "it") -> list[str]:
    if backend == "say":
        cmd = ["say"]
        if voice:
            cmd += ["-v", voice]
        if rate:
            cmd += ["-r", str(rate)]
        return cmd + [text]
    if backend == "espeak":
        binary = "espeak-ng" if shutil.which("espeak-ng") else "espeak"
        cmd = [binary, "-v", voice or language]
        if rate:
            cmd += ["-s", str(rate)]
        return cmd + [text]
    if backend == "powershell":
        escaped = text.replace("'", "''")
        script = (
            "Add-Type -AssemblyName System.Speech; "
            "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
            + (f"$s.SelectVoice('{voice}'); " if voice else "")
            + (f"$s.Rate = {rate}; " if rate else "")
            + f"$s.Speak('{escaped}')"
        )
        return ["powershell", "-NoProfile", "-Command", script]
    if backend == "command":
        if not command:
            raise ValueError("tts.command vuoto")
        if "{text}" in command:
            return ["sh", "-c", command.replace("{text}", shlex.quote(text))]
        return ["sh", "-c", f"printf %s {shlex.quote(text)} | {command}"]
    raise ValueError(f"backend TTS sconosciuto: {backend}")


class SystemSpeaker:
    def __init__(self, backend: str = "auto", voice: str = "", rate: int = 0, command: str = "", language: str = "it"):
        self.backend = detect_backend() if backend == "auto" else backend
        self.voice = voice
        self.rate = rate
        self.command = command
        self.language = language
        self._process: subprocess.Popen | None = None
        self._lock = threading.Lock()
        if self.backend == "none":
            raise RuntimeError(
                "Nessun sintetizzatore vocale trovato. Su Linux installa espeak-ng, "
                "oppure imposta [tts].backend = \"command\" nel file di configurazione."
            )

    def speak(self, text: str) -> None:
        text = text.strip()
        if not text:
            return
        cmd = build_command(self.backend, text, self.voice, self.rate, self.command, self.language)
        with self._lock:
            self._process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            process = self._process
        process.wait()
        with self._lock:
            self._process = None

    def stop(self) -> None:
        with self._lock:
            if self._process is not None and self._process.poll() is None:
                self._process.terminate()
