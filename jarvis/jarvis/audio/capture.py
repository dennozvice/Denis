"""Lettura continua del microfono in frame PCM 16 kHz mono (int16)."""

from __future__ import annotations

import queue
import threading
from typing import Iterator

import numpy as np

FRAME_SAMPLES = 1280  # 80 ms a 16 kHz: compatibile con openWakeWord


def list_input_devices() -> list[dict]:
    import sounddevice as sd

    devices = []
    default_index = sd.default.device[0]
    for index, info in enumerate(sd.query_devices()):
        if info.get("max_input_channels", 0) > 0:
            devices.append(
                {
                    "index": index,
                    "name": info["name"],
                    "default": index == default_index,
                    "sample_rate": int(info.get("default_samplerate", 0)),
                }
            )
    return devices


class Microphone:
    """Produce frame int16 da `frames()`; i frame si accumulano in coda anche se nessuno legge."""

    def __init__(self, sample_rate: int = 16000, device: str | int | None = None, frame_samples: int = FRAME_SAMPLES):
        self.sample_rate = sample_rate
        self.device = device if device not in ("", None) else None
        self.frame_samples = frame_samples
        self._queue: queue.Queue[np.ndarray] = queue.Queue(maxsize=400)  # ~32 s di audio
        self._stream = None
        self._closed = threading.Event()
        self.dropped = 0

    def _callback(self, indata, frames, time_info, status) -> None:  # noqa: ANN001
        if status:
            pass  # overflow/underflow: proseguiamo
        frame = np.asarray(indata[:, 0], dtype=np.int16).copy()
        try:
            self._queue.put_nowait(frame)
        except queue.Full:
            self.dropped += 1

    def start(self) -> None:
        import sounddevice as sd

        device = self.device
        if isinstance(device, str) and device.isdigit():
            device = int(device)
        self._stream = sd.InputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype="int16",
            blocksize=self.frame_samples,
            device=device,
            callback=self._callback,
        )
        self._stream.start()

    def stop(self) -> None:
        self._closed.set()
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None

    def read(self, timeout: float = 1.0) -> np.ndarray | None:
        try:
            return self._queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def drain(self) -> None:
        """Scarta l'audio accumulato (per esempio mentre Jarvis parla)."""
        while True:
            try:
                self._queue.get_nowait()
            except queue.Empty:
                return

    def frames(self) -> Iterator[np.ndarray]:
        while not self._closed.is_set():
            frame = self.read()
            if frame is not None:
                yield frame


def rms_level(frame: np.ndarray) -> float:
    """Livello 0..1 del frame (RMS normalizzato), per la forma d'onda dell'HUD."""
    if frame.size == 0:
        return 0.0
    samples = frame.astype(np.float32) / 32768.0
    return float(min(1.0, np.sqrt(np.mean(samples * samples)) * 4.0))
