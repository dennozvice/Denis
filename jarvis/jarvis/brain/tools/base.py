from __future__ import annotations

import platform
import subprocess
from dataclasses import dataclass, field
from typing import Any, Callable

Handler = Callable[[dict[str, Any]], str]


class NeedsConfirmation(Exception):
    """Sollevata da uno strumento pericoloso: l'azione va confermata a voce prima di eseguirla."""

    def __init__(self, description: str):
        super().__init__(description)
        self.description = description


@dataclass
class Tool:
    name: str
    description: str
    handler: Handler
    properties: dict[str, Any] = field(default_factory=dict)
    dangerous: bool = False
    confirm_text: str = ""

    def schema(self, strict: bool = True) -> dict[str, Any]:
        tool: dict[str, Any] = {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": self.properties,
                "required": list(self.properties.keys()),
                "additionalProperties": False,
            },
        }
        if strict:
            tool["strict"] = True
        return tool


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def add(self, tool: Tool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"strumento duplicato: {tool.name}")
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def names(self) -> list[str]:
        return list(self._tools.keys())

    def schemas(self, strict: bool = True) -> list[dict[str, Any]]:
        # Ordine stabile: la lista degli strumenti fa parte del prefisso messo in cache.
        return [self._tools[name].schema(strict) for name in sorted(self._tools)]

    def __len__(self) -> int:
        return len(self._tools)


def run(cmd: list[str], timeout: float = 20.0) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def osascript(script: str) -> str:
    result = run(["osascript", "-e", script])
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "osascript ha fallito")
    return result.stdout.strip()


def current_os() -> str:
    return {"Darwin": "macos", "Windows": "windows"}.get(platform.system(), "linux")


def optional_string(description: str) -> dict[str, Any]:
    return {"type": ["string", "null"], "description": description}
