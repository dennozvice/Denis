"""Trascrizione locale con faster-whisper (nessun audio inviato in rete)."""

from __future__ import annotations

from typing import Protocol

import numpy as np


class Transcriber(Protocol):
    def transcribe(self, audio: np.ndarray) -> str: ...


class WhisperTranscriber:
    def __init__(self, model: str = "small", device: str = "cpu", compute_type: str = "int8", language: str = "it"):
        from faster_whisper import WhisperModel

        self.language = language
        self._model = WhisperModel(model, device=device, compute_type=compute_type)

    def transcribe(self, audio: np.ndarray) -> str:
        if audio.size == 0:
            return ""
        from eve.audio.wakeword import normalize_audio

        samples = normalize_audio(audio)
        segments, _info = self._model.transcribe(
            samples,
            language=self.language,
            beam_size=2,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        text = " ".join(segment.text.strip() for segment in segments)
        return " ".join(text.split())
