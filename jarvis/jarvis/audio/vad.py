"""Rilevamento di inizio e fine frase basato sull'energia (nessuna dipendenza esterna)."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


def frame_energy(frame: np.ndarray) -> float:
    samples = frame.astype(np.float32) / 32768.0
    return float(np.sqrt(np.mean(samples * samples))) if samples.size else 0.0


@dataclass
class EndpointDetector:
    """Accumula frame finché l'utente parla; `finished` quando la frase è chiusa.

    - La soglia di energia si calibra sul rumore di fondo (se `energy_threshold` è 0).
    - La frase finisce dopo `silence_seconds` di silenzio successivi a del parlato,
      oppure al raggiungimento di `max_seconds`.
    - Se non arriva parlato entro `no_speech_timeout` la frase è vuota.
    """

    sample_rate: int = 16000
    silence_seconds: float = 0.9
    max_seconds: float = 15.0
    min_speech_seconds: float = 0.3
    no_speech_timeout: float = 5.0
    energy_threshold: float = 0.0
    noise_floor: float = 0.004
    _frames: list[np.ndarray] = field(default_factory=list)
    _elapsed: float = 0.0
    _speech_seconds: float = 0.0
    _silence_run: float = 0.0
    _started: bool = False
    finished: bool = False

    def calibrate(self, frames: list[np.ndarray]) -> None:
        if frames:
            levels = sorted(frame_energy(f) for f in frames)
            self.noise_floor = max(0.002, levels[len(levels) // 2])

    @property
    def threshold(self) -> float:
        if self.energy_threshold > 0:
            return self.energy_threshold
        return max(0.01, self.noise_floor * 3.0)

    def feed(self, frame: np.ndarray) -> None:
        if self.finished:
            return
        duration = frame.size / self.sample_rate
        self._elapsed += duration
        is_speech = frame_energy(frame) >= self.threshold
        if is_speech:
            self._started = True
            self._speech_seconds += duration
            self._silence_run = 0.0
        elif self._started:
            self._silence_run += duration
        if self._started or self._elapsed <= self.no_speech_timeout:
            self._frames.append(frame)
        if self._started and self._silence_run >= self.silence_seconds:
            self.finished = True
        elif not self._started and self._elapsed >= self.no_speech_timeout:
            self.finished = True
        elif self._elapsed >= self.max_seconds:
            self.finished = True

    @property
    def has_speech(self) -> bool:
        return self._speech_seconds >= self.min_speech_seconds

    def audio(self) -> np.ndarray:
        if not self._frames:
            return np.zeros(0, dtype=np.int16)
        return np.concatenate(self._frames)

    def reset(self) -> None:
        self._frames = []
        self._elapsed = 0.0
        self._speech_seconds = 0.0
        self._silence_run = 0.0
        self._started = False
        self.finished = False
