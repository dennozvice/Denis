"""Caricamento della configurazione (TOML) con valori predefiniti sensati."""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field, fields, is_dataclass
from pathlib import Path
from typing import Any


@dataclass
class AssistantConfig:
    name: str = "Jarvis"
    user_name: str = "Signore"
    language: str = "it"
    follow_up_seconds: float = 6.0
    conversation_timeout_seconds: float = 180.0
    chime: bool = True


@dataclass
class WakewordConfig:
    backend: str = "whisper"
    model: str = "jarvis"
    threshold: float = 0.75
    access_key: str = ""
    whisper_model: str = "tiny"


@dataclass
class AudioConfig:
    input_device: str = ""
    sample_rate: int = 16000
    silence_seconds: float = 0.9
    max_utterance_seconds: float = 15.0
    min_speech_seconds: float = 0.3
    energy_threshold: float = 0.0


@dataclass
class SttConfig:
    model: str = "small"
    device: str = "cpu"
    compute_type: str = "int8"


@dataclass
class TtsConfig:
    backend: str = "auto"
    voice: str = ""
    rate: int = 0
    command: str = ""


@dataclass
class BrainConfig:
    model: str = "claude-opus-5-5"
    effort: str = "low"
    max_tokens: int = 4096
    fallbacks: bool = True
    web_search: bool = True
    max_tool_rounds: int = 8
    notes: str = ""


@dataclass
class ToolsConfig:
    allow_shell: bool = False
    allow_power: bool = True
    typing: bool = True


@dataclass
class HomeAssistantConfig:
    enabled: bool = False
    url: str = "http://homeassistant.local:8123"
    token: str = ""


@dataclass
class UiConfig:
    enabled: bool = True
    host: str = "127.0.0.1"
    port: int = 8765
    open: str = "browser"


@dataclass
class Config:
    assistant: AssistantConfig = field(default_factory=AssistantConfig)
    wakeword: WakewordConfig = field(default_factory=WakewordConfig)
    audio: AudioConfig = field(default_factory=AudioConfig)
    stt: SttConfig = field(default_factory=SttConfig)
    tts: TtsConfig = field(default_factory=TtsConfig)
    brain: BrainConfig = field(default_factory=BrainConfig)
    tools: ToolsConfig = field(default_factory=ToolsConfig)
    home_assistant: HomeAssistantConfig = field(default_factory=HomeAssistantConfig)
    ui: UiConfig = field(default_factory=UiConfig)
    source: str = "(valori predefiniti)"


def data_dir() -> Path:
    """Cartella dove Jarvis salva memoria e stato (creata se manca)."""
    base = os.environ.get("JARVIS_HOME")
    path = Path(base) if base else Path.home() / ".config" / "jarvis"
    path.mkdir(parents=True, exist_ok=True)
    return path


def candidate_paths() -> list[Path]:
    env = os.environ.get("JARVIS_CONFIG")
    paths: list[Path] = []
    if env:
        paths.append(Path(env))
    paths.append(Path.cwd() / "config.toml")
    paths.append(Path.home() / ".config" / "jarvis" / "config.toml")
    return paths


def _merge(obj: Any, data: dict[str, Any], path: str) -> list[str]:
    """Copia i valori di `data` nel dataclass `obj`. Ritorna le chiavi sconosciute."""
    unknown: list[str] = []
    known = {f.name: f for f in fields(obj)}
    for key, value in data.items():
        if key not in known:
            unknown.append(f"{path}{key}")
            continue
        current = getattr(obj, key)
        if is_dataclass(current) and isinstance(value, dict):
            unknown.extend(_merge(current, value, f"{path}{key}."))
        else:
            expected = type(current)
            if expected is float and isinstance(value, int) and not isinstance(value, bool):
                value = float(value)
            if not isinstance(value, expected):
                raise ValueError(
                    f"config: {path}{key} deve essere {expected.__name__}, "
                    f"trovato {type(value).__name__}"
                )
            setattr(obj, key, value)
    return unknown


def load_config(path: str | os.PathLike[str] | None = None) -> Config:
    """Carica la configurazione dal primo file trovato (o dai predefiniti)."""
    config = Config()
    chosen: Path | None = None
    if path is not None:
        chosen = Path(path)
        if not chosen.exists():
            raise FileNotFoundError(f"File di configurazione non trovato: {chosen}")
    else:
        for candidate in candidate_paths():
            if candidate.exists():
                chosen = candidate
                break
    if chosen is None:
        return config
    with open(chosen, "rb") as handle:
        data = tomllib.load(handle)
    unknown = _merge(config, data, "")
    if unknown:
        raise ValueError("config: chiavi sconosciute: " + ", ".join(unknown))
    config.source = str(chosen)
    return config
