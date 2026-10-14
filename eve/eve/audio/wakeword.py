"""Rilevamento della parola di attivazione, sempre acceso.

Tre backend:
- Whisper (predefinito): nessuna chiave. Trascrive in locale una finestra di un paio di
  secondi, solo quando c'è voce, e scatta se tra le parole c'è "Eve" (o simile).
- Porcupine (Picovoice): parola "Eve" integrata, più leggero e preciso; richiede una
  AccessKey, che Picovoice concede su richiesta.
- openWakeWord: gratuito e senza registrazione, con un modello .onnx personalizzato
  addestrato con i notebook del progetto (quello pronto riconosce solo "hey jarvis").
"""

from __future__ import annotations

import difflib
import os
import re
import time
import unicodedata
from pathlib import Path
from typing import Callable, Protocol

import numpy as np


class WakeWordDetector(Protocol):
    name: str

    def feed(self, frame: np.ndarray) -> bool:
        """Riceve un frame int16 a 16 kHz di lunghezza qualsiasi; True quando rileva la parola."""

    def reset(self) -> None: ...

    def close(self) -> None: ...


def carry_audio(detector: object) -> np.ndarray | None:
    """Audio pronunciato subito dopo la parola, se il rilevatore lo conserva."""
    carry = getattr(detector, "carry", None)
    return carry() if callable(carry) else None


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


Word = tuple[str, float, float]  # testo, inizio, fine (secondi)


def normalize_audio(audio: np.ndarray, peak: float = 0.9) -> np.ndarray:
    """Porta l'audio a un livello pieno prima della trascrizione: i microfoni dei portatili
    spesso consegnano un segnale molto basso, e Whisper capisce meglio se amplificato."""
    samples = audio.astype(np.float32) / 32768.0
    top = float(np.abs(samples).max()) if samples.size else 0.0
    if top > 1e-4:
        samples = samples * min(peak / top, 60.0)
    return samples
TranscribeWords = Callable[[np.ndarray], list[Word]]


def normalize_word(word: str) -> str:
    """Minuscolo, senza accenti e punteggiatura, con una piega fonetica all'italiana
    (gi+vocale -> j, ge -> je, y -> i, doppie ridotte) per tollerare le grafie di Whisper."""
    text = unicodedata.normalize("NFKD", word).encode("ascii", "ignore").decode().lower()
    text = re.sub(r"[^a-z]", "", text)
    text = re.sub(r"gi(?=[aeou])", "j", text)
    text = re.sub(r"ge", "je", text)
    text = text.replace("y", "i").replace("ph", "f").replace("ck", "k")
    return re.sub(r"(.)\1", r"\1", text)


def keyword_match(words: list[Word], keyword: str | list[str], threshold: float) -> tuple[float, float] | None:
    """Cerca la parola chiave (o una delle sue grafie): ritorna (somiglianza, istante di fine).

    Le parole corte (meno di cinque lettere) devono coincidere esattamente, altrimenti
    "ivi" scatterebbe anche su "vivi" o "lì".
    """
    keywords = [normalize_word(k) for k in ([keyword] if isinstance(keyword, str) else keyword)]
    keywords = [k for k in keywords if k]
    candidates: list[tuple[str, float]] = []
    normalized = [(normalize_word(w), end) for w, _start, end in words]
    for index, (text, end) in enumerate(normalized):
        if text:
            candidates.append((text, end))
        if index + 1 < len(normalized) and normalized[index + 1][0]:
            candidates.append((text + normalized[index + 1][0], normalized[index + 1][1]))
    best: tuple[float, float] | None = None
    for text, end in candidates:
        for keyword in keywords:
            if text == keyword:
                score = 1.0
            elif len(keyword) < 5:
                continue
            elif keyword in text and len(text) <= len(keyword) + 3:
                score = 1.0
            else:
                score = difflib.SequenceMatcher(None, text, keyword).ratio()
            if score >= threshold and (best is None or score > best[0]):
                best = (score, end)
    return best


class WhisperWakeDetector:
    """Parola di attivazione tramite trascrizione locale a finestra scorrevole (nessuna chiave)."""

    name = "whisper"

    def __init__(
        self,
        keyword: str | list[str] = "jarvis",
        threshold: float = 0.75,
        model: str = "tiny",
        device: str = "cpu",
        compute_type: str = "int8",
        language: str = "it",
        window_seconds: float = 1.8,
        hop_seconds: float = 0.6,
        sample_rate: int = 16000,
        refractory_seconds: float = 2.0,
        transcribe: TranscribeWords | None = None,
    ):
        self.keyword = keyword
        self.threshold = threshold
        self.sample_rate = sample_rate
        self._window = int(window_seconds * sample_rate)
        self._hop = int(hop_seconds * sample_rate)
        self._buffer = np.zeros(0, dtype=np.int16)
        self._since_run = 0
        self._noise_floor = 0.004
        self._speech_frames = 0
        self._refractory = refractory_seconds
        self._last_hit = 0.0
        self._carry = np.zeros(0, dtype=np.int16)
        self.last_words: list[str] = []  # ultime parole trascritte (per la diagnosi)
        self._transcribe = transcribe or self._load(model, device, compute_type, language)

    @staticmethod
    def _load(model: str, device: str, compute_type: str, language: str) -> TranscribeWords:
        from faster_whisper import WhisperModel

        engine = WhisperModel(model, device=device, compute_type=compute_type)

        def transcribe(audio: np.ndarray) -> list[Word]:
            samples = normalize_audio(audio)
            segments, _ = engine.transcribe(
                samples,
                language=language,
                beam_size=1,
                word_timestamps=True,
                vad_filter=False,
                condition_on_previous_text=False,
            )
            words: list[Word] = []
            for segment in segments:
                for word in segment.words or []:
                    words.append((word.word, float(word.start), float(word.end)))
            return words

        return transcribe

    def feed(self, frame: np.ndarray) -> bool:
        from eve.audio.vad import frame_energy

        energy = frame_energy(frame)
        # Rumore di fondo adattivo: scende subito, risale piano.
        self._noise_floor = min(self._noise_floor * 1.002, energy) if energy > 0 else self._noise_floor
        if energy >= max(0.004, self._noise_floor * 3.0):
            self._speech_frames += 1
        self._buffer = np.concatenate([self._buffer, frame.astype(np.int16)])[-self._window :]
        self._since_run += frame.size
        if self._since_run < self._hop:
            return False
        self._since_run = 0
        had_speech, self._speech_frames = self._speech_frames > 0, 0
        if not had_speech or time.monotonic() - self._last_hit < self._refractory:
            return False
        try:
            words = self._transcribe(self._buffer)
        except Exception:
            return False
        self.last_words = [w for w, _s, _e in words]
        match = keyword_match(words, self.keyword, self.threshold)
        if match is None:
            return False
        _score, end = match
        cut = min(self._buffer.size, int(end * self.sample_rate))
        self._carry = self._buffer[cut:].copy()
        self._last_hit = time.monotonic()
        self._buffer = np.zeros(0, dtype=np.int16)
        return True

    def carry(self) -> np.ndarray:
        carry, self._carry = self._carry, np.zeros(0, dtype=np.int16)
        return carry

    def reset(self) -> None:
        self._buffer = np.zeros(0, dtype=np.int16)
        self._since_run = 0
        self._speech_frames = 0

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


def build_detector(
    backend: str,
    model: str,
    threshold: float,
    access_key: str = "",
    *,
    aliases: list[str] | None = None,
    whisper_model: str = "tiny",
    device: str = "cpu",
    compute_type: str = "int8",
    language: str = "it",
) -> WakeWordDetector:
    backend = backend.lower()
    aliases = aliases or []
    if backend == "whisper":
        return WhisperWakeDetector(keyword=[model, *aliases], threshold=threshold, model=whisper_model, device=device, compute_type=compute_type, language=language)
    if backend == "porcupine":
        return PorcupineDetector(keyword=model, sensitivity=threshold, access_key=access_key)
    if backend == "openwakeword":
        return OpenWakeWordDetector(model=model, threshold=threshold)
    if backend == "manual":
        return ManualTrigger()
    raise ValueError(f"backend parola di attivazione sconosciuto: {backend}")
