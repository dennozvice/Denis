"""Rilevamento della parola di attivazione, sempre acceso.

Due backend:
- Porcupine (Picovoice): parola "Jarvis" integrata; richiede una AccessKey gratuita.
- openWakeWord: gratuito e senza registrazione; il modello pronto è "hey jarvis",
  oppure un modello .onnx personalizzato addestrato con i notebook del progetto.
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Protocol

import numpy as np


class WakeWordDetector(Protocol):
    name: str

    def feed(self, frame: np.ndarray) -> bool:
        """Riceve un frame int16 a 16 kHz di lunghezza qualsiasi; True quando rileva la parola."""

    def reset(self) -> None: ...

    def close(self) -> None: ...


class _Chunker:
    """Riallinea frame di lunghezza qualsiasi in blocchi della dimensione voluta."""

    def __init__(self, size: int) -> None:
        self.size = size
        self._buffer = np.zeros(0, dtype=np.int16)

    def push(self, frame: np.ndarray) -> list[np.ndarray]:
        self._buffer = np.concatenate([self._buffer, frame.astype(np.int16)])
        chunks = []
        while self._buffer.size >= self.size:
            chunks.append(self._buffer[: self.size])
            self._buffer = self._buffer[self.size :]
        return chunks

    def clear(self) -> None:
        self._buffer = np.zeros(0, dtype=np.int16)


class PorcupineDetector:
    name = "porcupine"

    def __init__(self, keyword: str = "jarvis", sensitivity: float = 0.6, access_key: str = "", refractory_seconds: float = 1.5):
        import pvporcupine

        key = access_key or os.environ.get("PICOVOICE_ACCESS_KEY", "")
        if not key:
            raise RuntimeError(
                "Porcupine richiede una AccessKey gratuita: creala su https://console.picovoice.ai "
                "e mettila in [wakeword].access_key oppure nella variabile PICOVOICE_ACCESS_KEY."
            )
        sensitivity = float(min(1.0, max(0.0, sensitivity)))
        if keyword.endswith(".ppn") or Path(keyword).exists():
            self._engine = pvporcupine.create(access_key=key, keyword_paths=[keyword], sensitivities=[sensitivity])
        else:
            self._engine = pvporcupine.create(access_key=key, keywords=[keyword], sensitivities=[sensitivity])
        if self._engine.sample_rate != 16000:
            raise RuntimeError("Porcupine richiede audio a 16 kHz")
        self._chunker = _Chunker(self._engine.frame_length)
        self._refractory = refractory_seconds
        self._last_hit = 0.0

    def feed(self, frame: np.ndarray) -> bool:
        hit = False
        for chunk in self._chunker.push(frame):
            if self._engine.process(chunk) >= 0:
                hit = True
        if hit and time.monotonic() - self._last_hit > self._refractory:
            self._last_hit = time.monotonic()
            return True
        return False

    def reset(self) -> None:
        self._chunker.clear()

    def close(self) -> None:
        self._engine.delete()


class OpenWakeWordDetector:
    name = "openwakeword"

    def __init__(self, model: str = "hey_jarvis", threshold: float = 0.5, refractory_seconds: float = 1.5):
        from openwakeword import utils
        from openwakeword.model import Model

        if not (model.endswith(".onnx") or model.endswith(".tflite")):
            utils.download_models(model_names=[model])
        self._model = Model(wakeword_models=[model], inference_framework="onnx")
        self._label = list(self._model.models.keys())[0]
        self.threshold = threshold
        self._chunker = _Chunker(1280)
        self._refractory = refractory_seconds
        self._last_hit = 0.0

    def feed(self, frame: np.ndarray) -> bool:
        hit = False
        for chunk in self._chunker.push(frame):
            scores = self._model.predict(chunk)
            if float(scores[self._label]) >= self.threshold:
                hit = True
        if hit and time.monotonic() - self._last_hit > self._refractory:
            self._last_hit = time.monotonic()
            self._model.reset()
            return True
        return False

    def reset(self) -> None:
        self._chunker.clear()
        self._model.reset()

    def close(self) -> None:
        pass


class ManualTrigger:
    """Rilevatore che non ascolta: scatta solo quando qualcuno chiama `trigger()` (tastiera, HUD)."""

    name = "manual"

    def __init__(self) -> None:
        self._armed = False

    def trigger(self) -> None:
        self._armed = True

    def feed(self, frame: np.ndarray) -> bool:
        if self._armed:
            self._armed = False
            return True
        return False

    def reset(self) -> None:
        self._armed = False

    def close(self) -> None:
        pass


def build_detector(backend: str, model: str, threshold: float, access_key: str = "") -> WakeWordDetector:
    backend = backend.lower()
    if backend == "porcupine":
        return PorcupineDetector(keyword=model, sensitivity=threshold, access_key=access_key)
    if backend == "openwakeword":
        return OpenWakeWordDetector(model=model, threshold=threshold)
    if backend == "manual":
        return ManualTrigger()
    raise ValueError(f"backend parola di attivazione sconosciuto: {backend}")
