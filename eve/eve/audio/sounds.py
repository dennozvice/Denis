"""Suoni brevi di conferma (generati, nessun file audio)."""

from __future__ import annotations

import numpy as np


def chime(kind: str = "wake", sample_rate: int = 16000) -> np.ndarray:
    notes = {"wake": (660.0, 990.0), "done": (990.0, 660.0), "error": (330.0, 330.0)}[kind]
    parts = []
    for freq in notes:
        t = np.linspace(0, 0.09, int(sample_rate * 0.09), endpoint=False)
        envelope = np.minimum(1.0, np.minimum(t / 0.01, (0.09 - t) / 0.03))
        parts.append(np.sin(2 * np.pi * freq * t) * envelope * 0.25)
    return np.concatenate(parts).astype(np.float32)


def play(kind: str = "wake") -> None:
    try:
        import sounddevice as sd

        sd.play(chime(kind), 16000, blocking=False)
    except Exception:
        pass  # nessuna uscita audio: il suono non è essenziale
