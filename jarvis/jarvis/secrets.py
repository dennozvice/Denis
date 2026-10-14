"""Dove Jarvis trova la chiave API quando non è nell'ambiente (app lanciata dal Dock).

Ordine: variabile d'ambiente -> Portachiavi di macOS -> file ~/.config/jarvis/secrets.toml
"""

from __future__ import annotations

import os
import platform
import subprocess
import tomllib
from pathlib import Path

from jarvis.config import data_dir

ENV_VAR = "ANTHROPIC_API_KEY"
KEYCHAIN_SERVICE = "jarvis-anthropic"
KEYCHAIN_ACCOUNT = "api-key"


def secrets_file() -> Path:
    return data_dir() / "secrets.toml"


def _keychain_get() -> str:
    if platform.system() != "Darwin":
        return ""
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


def _keychain_set(value: str) -> bool:
    if platform.system() != "Darwin":
        return False
    result = subprocess.run(
        ["security", "add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w", value],
        capture_output=True,
        text=True,
        timeout=10,
    )
    return result.returncode == 0


def _file_get() -> str:
    path = secrets_file()
    if not path.exists():
        return ""
    try:
        with open(path, "rb") as handle:
            return str(tomllib.load(handle).get("anthropic_api_key", "")).strip()
    except (tomllib.TOMLDecodeError, OSError):
        return ""


def _file_set(value: str) -> None:
    path = secrets_file()
    path.write_text(f'anthropic_api_key = "{value}"\n')
    os.chmod(path, 0o600)


def get_api_key() -> str:
    """La chiave di Claude, da qualunque posto sia stata salvata ('' se non c'è)."""
    return os.environ.get(ENV_VAR, "").strip() or _keychain_get() or _file_get()


def key_source() -> str:
    if os.environ.get(ENV_VAR, "").strip():
        return "variabile d'ambiente"
    if _keychain_get():
        return "Portachiavi"
    if _file_get():
        return str(secrets_file())
    return ""


def set_api_key(value: str) -> str:
    """Salva la chiave nel posto migliore disponibile e ritorna dove."""
    value = value.strip()
    if not value:
        raise ValueError("chiave vuota")
    if _keychain_set(value):
        return "Portachiavi di macOS"
    _file_set(value)
    return str(secrets_file())


def export_to_environment() -> str:
    """Mette la chiave nell'ambiente del processo, così l'SDK di Claude la trova."""
    if not os.environ.get(ENV_VAR, "").strip():
        key = get_api_key()
        if key:
            os.environ[ENV_VAR] = key
    return key_source()
