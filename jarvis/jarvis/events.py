"""Bus di eventi: il nucleo pubblica stati e trascrizioni, l'HUD e il log li ricevono."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable

Listener = Callable[["Event"], None]

STATES = ("idle", "listening", "thinking", "speaking", "offline")


@dataclass
class Event:
    type: str
    data: dict[str, Any] = field(default_factory=dict)
    at: float = field(default_factory=time.time)

    def as_dict(self) -> dict[str, Any]:
        return {"type": self.type, "at": self.at, **self.data}


class EventBus:
    def __init__(self) -> None:
        self._listeners: list[Listener] = []
        self._lock = threading.Lock()
        self.state = "offline"

    def subscribe(self, listener: Listener) -> None:
        with self._lock:
            self._listeners.append(listener)

    def unsubscribe(self, listener: Listener) -> None:
        with self._lock:
            if listener in self._listeners:
                self._listeners.remove(listener)

    def publish(self, type_: str, **data: Any) -> Event:
        event = Event(type_, data)
        if type_ == "state":
            self.state = data.get("state", self.state)
        with self._lock:
            listeners = list(self._listeners)
        for listener in listeners:
            try:
                listener(event)
            except Exception:  # un ascoltatore rotto non deve fermare Jarvis
                pass
        return event

    # Scorciatoie leggibili
    def set_state(self, state: str, detail: str = "") -> None:
        if state not in STATES:
            raise ValueError(f"stato sconosciuto: {state}")
        self.publish("state", state=state, detail=detail)

    def transcript(self, role: str, text: str) -> None:
        self.publish("transcript", role=role, text=text)

    def tool(self, name: str, status: str, detail: str = "") -> None:
        self.publish("tool", name=name, status=status, detail=detail)

    def level(self, value: float) -> None:
        self.publish("level", value=float(value))

    def notice(self, text: str, kind: str = "info") -> None:
        self.publish("notice", text=text, kind=kind)
