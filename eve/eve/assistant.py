"""Orchestratore: microfono -> parola di attivazione -> ascolto -> cervello -> voce."""

from __future__ import annotations

import logging
import threading
import time
from typing import Any

import numpy as np

from eve.audio.capture import Microphone, rms_level
from eve.audio.vad import EndpointDetector
from eve.audio.wakeword import carry_audio
from eve.brain.client import Brain, classify_confirmation
from eve.config import Config
from eve.events import EventBus

log = logging.getLogger("eve")


class Assistant:
    def __init__(
        self,
        config: Config,
        bus: EventBus,
        brain: Brain,
        transcriber: Any,
        speaker: Any,
        detector: Any,
        microphone: Microphone | None,
    ):
        self.config = config
        self.bus = bus
        self.brain = brain
        self.transcriber = transcriber
        self.speaker = speaker
        self.detector = detector
        self.microphone = microphone
        self._running = threading.Event()
        self._thread: threading.Thread | None = None
        self._speech_lock = threading.Lock()
        self._turn_lock = threading.Lock()
        self._manual_wake = threading.Event()
        self._noise_floor = 0.004

    # Ciclo di vita

    def start(self) -> None:
        self._running.set()
        if self.microphone is not None:
            self.microphone.start()
            self._thread = threading.Thread(target=self._loop, name="eve-audio", daemon=True)
            self._thread.start()
            self.bus.set_state("idle", f'In ascolto della parola "{self.config.assistant.name}"')
        else:
            self.bus.set_state("idle", "Modalità testo: nessun microfono")

    def stop(self) -> None:
        self._running.clear()
        self.speaker.stop()
        if self.microphone is not None:
            self.microphone.stop()
        self.detector.close()
        self.bus.set_state("offline")

    def trigger(self) -> None:
        """Attivazione manuale (tastiera o HUD) al posto della parola."""
        self._manual_wake.set()

    # Ciclo audio

    def _loop(self) -> None:
        assert self.microphone is not None
        self._calibrate()
        counter = 0
        silent_frames = 0
        warned_silent = False
        while self._running.is_set():
            frame = self.microphone.read(timeout=0.5)
            if frame is None:
                continue
            counter += 1
            # Microfono che consegna solo zeri: quasi sempre un permesso negato da macOS
            if int(np.abs(frame).max()) == 0:
                silent_frames += 1
                if silent_frames == 75 and not warned_silent:  # ~6 secondi
                    warned_silent = True
                    self.bus.notice(
                        "Il microfono non manda audio: controlla Impostazioni di Sistema › Privacy e sicurezza › Microfono "
                        f"e abilita {self.config.assistant.name} (o il Terminale), poi riavvia.",
                        "error",
                    )
            else:
                silent_frames = 0
            if counter % 2 == 0:
                self.bus.level(rms_level(frame))
            if self._manual_wake.is_set():
                self._manual_wake.clear()
                self._on_wake()
                continue
            if self.detector.feed(frame):
                self._on_wake()

    def _calibrate(self) -> None:
        assert self.microphone is not None
        frames = []
        deadline = time.monotonic() + 1.0
        while time.monotonic() < deadline:
            frame = self.microphone.read(timeout=0.5)
            if frame is not None:
                frames.append(frame)
        detector = EndpointDetector()
        detector.calibrate(frames)
        self._noise_floor = detector.noise_floor

    def _endpoint(self, no_speech_timeout: float) -> EndpointDetector:
        audio = self.config.audio
        detector = EndpointDetector(
            sample_rate=audio.sample_rate,
            silence_seconds=audio.silence_seconds,
            max_seconds=audio.max_utterance_seconds,
            min_speech_seconds=audio.min_speech_seconds,
            no_speech_timeout=no_speech_timeout,
            energy_threshold=audio.energy_threshold,
            noise_floor=self._noise_floor,
        )
        return detector

    def _listen(self, no_speech_timeout: float, initial: np.ndarray | None = None) -> np.ndarray | None:
        """Registra una frase; None se l'utente non ha parlato.

        `initial` è audio già catturato subito dopo la parola di attivazione: viene
        messo in testa, così non si perde l'inizio del comando.
        """
        assert self.microphone is not None
        if initial is None or initial.size == 0:
            self.microphone.drain()
        self.detector.reset()
        endpoint = self._endpoint(no_speech_timeout)
        if initial is not None and initial.size:
            endpoint.feed(initial)
        while self._running.is_set() and not endpoint.finished:
            frame = self.microphone.read(timeout=0.5)
            if frame is None:
                continue
            self.bus.level(rms_level(frame))
            endpoint.feed(frame)
        return endpoint.audio() if endpoint.has_speech else None

    def _on_wake(self) -> None:
        if not self._turn_lock.acquire(blocking=False):
            return
        try:
            self.bus.publish("wake")
            if self.config.assistant.chime:
                from eve.audio import sounds

                sounds.play("wake")
            self.bus.set_state("listening", "Ti ascolto")
            audio = self._listen(no_speech_timeout=5.0, initial=carry_audio(self.detector))
            if audio is None:
                self.bus.set_state("idle", "Non ho sentito nulla")
                return
            self._handle_audio(audio)
        finally:
            self._turn_lock.release()

    def _handle_audio(self, audio: np.ndarray) -> None:
        self.bus.set_state("thinking", "Trascrivo")
        text = self.transcriber.transcribe(audio)
        if not text:
            self.bus.set_state("idle", "Non ho capito")
            return
        self._converse(text)

    def _converse(self, text: str) -> None:
        """Elabora una frase e poi resta in ascolto per il seguito, senza parola di attivazione."""
        follow_up = self._respond(text)
        while follow_up and self.microphone is not None and self._running.is_set():
            self.bus.set_state("listening", "Dimmi pure")
            audio = self._listen(no_speech_timeout=self.config.assistant.follow_up_seconds)
            if audio is None:
                break
            self.bus.set_state("thinking", "Trascrivo")
            text = self.transcriber.transcribe(audio)
            if not text:
                break
            follow_up = self._respond(text)
        self.bus.set_state("idle", f'In ascolto della parola "{self.config.assistant.name}"')

    # Conversazione (usata anche dall'HUD e dalla modalità testo)

    def handle_text(self, text: str) -> str:
        """Elabora un comando scritto. Ritorna la risposta parlata."""
        with self._turn_lock:
            reply = self._respond(text, return_text=True)
            self.bus.set_state("idle", "")
            return reply if isinstance(reply, str) else ""

    def _respond(self, text: str, return_text: bool = False) -> Any:
        text = text.strip()
        self.bus.transcript("user", text)
        if self.brain.pending is not None:
            verdict = classify_confirmation(text)
            if verdict == "yes":
                self.bus.set_state("thinking", "Eseguo")
                reply_text = self.brain.confirm()
                self.say(reply_text)
                return reply_text if return_text else False
            if verdict == "no":
                reply_text = self.brain.decline()
                self.say(reply_text)
                return reply_text if return_text else False
            self.brain.pending = None  # l'utente ha cambiato argomento
        self.bus.set_state("thinking", "Penso")
        try:
            reply = self.brain.ask(text)
        except Exception as error:
            log.debug("errore del cervello", exc_info=True)
            message = _friendly_error(error)
            self.bus.notice(str(error), "error")
            self.say(message)
            return message if return_text else False
        self.say(reply.text)
        wants_answer = reply.pending is not None or reply.text.rstrip().endswith("?")
        if return_text:
            return reply.text
        return True if wants_answer else self.config.assistant.follow_up_seconds > 0

    def say(self, text: str) -> None:
        with self._speech_lock:
            previous = self.bus.state
            self.bus.set_state("speaking", "")
            self.bus.transcript("assistant", text)
            try:
                self.speaker.speak(text)
            except Exception as error:
                log.debug("sintesi vocale fallita", exc_info=True)
                self.bus.notice(f"Voce non disponibile: {error}", "error")
            if self.microphone is not None:
                self.microphone.drain()
                self.detector.reset()
            if previous in ("idle", "listening"):
                self.bus.set_state(previous, "")

    def announce(self, text: str) -> None:
        """Messaggio spontaneo (timer scaduto): parla appena il turno corrente è libero."""
        with self._turn_lock:
            self.bus.publish("wake")
            self.say(text)
            self.bus.set_state("idle", "")


def _friendly_error(error: Exception) -> str:
    name = type(error).__name__
    if "Authentication" in name:
        return "Non riesco ad accedere a Claude: controlla la chiave API."
    if "RateLimit" in name:
        return "Troppe richieste in questo momento, riprova tra poco."
    if "Connection" in name or "Timeout" in name:
        return "Non riesco a raggiungere la rete."
    return "Ho avuto un problema interno, riprova."
