"""Memoria a lungo termine: fatti che Jarvis ricorda tra una sessione e l'altra."""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from jarvis.brain.tools.base import Tool, ToolRegistry


class Memory:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()
        self._facts: list[str] = []
        if path.exists():
            try:
                self._facts = list(json.loads(path.read_text()))
            except (json.JSONDecodeError, TypeError):
                self._facts = []

    def facts(self) -> list[str]:
        with self._lock:
            return list(self._facts)

    def remember(self, fact: str) -> None:
        fact = " ".join(fact.split())
        with self._lock:
            if fact and fact not in self._facts:
                self._facts.append(fact)
                self._save()

    def forget(self, needle: str) -> int:
        needle = needle.lower()
        with self._lock:
            before = len(self._facts)
            self._facts = [f for f in self._facts if needle not in f.lower()]
            removed = before - len(self._facts)
            if removed:
                self._save()
        return removed

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self._facts, ensure_ascii=False, indent=2))


def register(registry: ToolRegistry, memory: Memory) -> None:
    def remember(args: dict[str, Any]) -> str:
        memory.remember(str(args["fact"]))
        return "Memorizzato."

    def forget(args: dict[str, Any]) -> str:
        removed = memory.forget(str(args["about"]))
        return f"Dimenticate {removed} note." if removed else "Non trovo nulla da dimenticare."

    def recall(args: dict[str, Any]) -> str:
        facts = memory.facts()
        return "\n".join(f"- {f}" for f in facts) if facts else "Non ho note memorizzate."

    registry.add(
        Tool(
            "remember",
            "Salva un fatto da ricordare per sempre (preferenze, nomi, indirizzi, abitudini dell'utente).",
            remember,
            properties={"fact": {"type": "string", "description": "Il fatto, in una frase."}},
        )
    )
    registry.add(
        Tool(
            "forget",
            "Cancella dalla memoria le note che contengono una parola o frase.",
            forget,
            properties={"about": {"type": "string"}},
        )
    )
    registry.add(Tool("recall", "Rilegge tutte le note memorizzate.", recall))
