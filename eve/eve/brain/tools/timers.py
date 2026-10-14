"""Timer e promemoria annunciati a voce."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from eve.brain.tools.base import Tool, ToolRegistry


@dataclass
class Timer:
    id: int
    label: str
    due: float
    thread: threading.Timer = field(repr=False)


class TimerService:
    def __init__(self, announce: Callable[[str], None]):
        self._announce = announce
        self._timers: dict[int, Timer] = {}
        self._next = 1
        self._lock = threading.Lock()

    def add(self, seconds: float, label: str) -> Timer:
        with self._lock:
            timer_id = self._next
            self._next += 1
        thread = threading.Timer(seconds, self._fire, args=(timer_id,))
        thread.daemon = True
        timer = Timer(timer_id, label, time.time() + seconds, thread)
        with self._lock:
            self._timers[timer_id] = timer
        thread.start()
        return timer

    def _fire(self, timer_id: int) -> None:
        with self._lock:
            timer = self._timers.pop(timer_id, None)
        if timer:
            self._announce(f"{timer.label}" if timer.label else "Il timer è scaduto.")

    def cancel(self, timer_id: int) -> bool:
        with self._lock:
            timer = self._timers.pop(timer_id, None)
        if timer:
            timer.thread.cancel()
            return True
        return False

    def active(self) -> list[Timer]:
        with self._lock:
            return sorted(self._timers.values(), key=lambda t: t.due)


def describe_duration(seconds: float) -> str:
    seconds = int(round(seconds))
    if seconds < 60:
        return f"{seconds} secondi"
    minutes, rest = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes} minuti" + (f" e {rest} secondi" if rest else "")
    hours, minutes = divmod(minutes, 60)
    return f"{hours} ore" + (f" e {minutes} minuti" if minutes else "")


def register(registry: ToolRegistry, service: TimerService) -> None:
    def set_timer(args: dict[str, Any]) -> str:
        seconds = float(args["seconds"])
        if seconds <= 0 or seconds > 86400:
            return "La durata deve essere tra un secondo e ventiquattro ore."
        label = args.get("label") or "Il timer è scaduto."
        timer = service.add(seconds, label)
        return f"Timer {timer.id} impostato: {describe_duration(seconds)}."

    def list_timers(args: dict[str, Any]) -> str:
        timers = service.active()
        if not timers:
            return "Nessun timer attivo."
        now = time.time()
        return "\n".join(f"Timer {t.id}: {t.label} tra {describe_duration(t.due - now)}" for t in timers)

    def cancel_timer(args: dict[str, Any]) -> str:
        return "Timer annullato." if service.cancel(int(args["id"])) else "Nessun timer con quel numero."

    registry.add(
        Tool(
            "set_timer",
            "Imposta un timer o un promemoria: allo scadere Eve lo annuncia a voce.",
            set_timer,
            properties={
                "seconds": {"type": "integer", "description": "Durata in secondi."},
                "label": {"type": ["string", "null"], "description": "Frase da annunciare allo scadere, es. 'La pasta è pronta'. null per il messaggio standard."},
            },
        )
    )
    registry.add(Tool("list_timers", "Elenca i timer attivi.", list_timers))
    registry.add(
        Tool(
            "cancel_timer",
            "Annulla un timer dato il suo numero.",
            cancel_timer,
            properties={"id": {"type": "integer"}},
        )
    )
