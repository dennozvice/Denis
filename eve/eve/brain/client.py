"""Il cervello: ciclo di conversazione con Claude e uso degli strumenti."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Callable

from eve.brain.prompts import context_block, system_prompt
from eve.brain.tools.base import NeedsConfirmation, Tool, ToolRegistry

log = logging.getLogger("eve.brain")

FALLBACK_BETA = "server-side-fallback-2026-07-01"


@dataclass
class PendingAction:
    tool: Tool
    input: dict[str, Any]
    description: str


@dataclass
class Reply:
    text: str
    pending: PendingAction | None = None
    tools_used: list[str] | None = None


ToolObserver = Callable[[str, str, str], None]  # (nome, stato, dettaglio)


class Brain:
    def __init__(
        self,
        registry: ToolRegistry,
        *,
        name: str = "Eve",
        user_name: str = "Signore",
        language: str = "it",
        pronunciation: str = "",
        model: str = "claude-opus-5-5",
        effort: str = "low",
        max_tokens: int = 4096,
        fallbacks: bool = True,
        web_search: bool = True,
        max_tool_rounds: int = 8,
        notes: str = "",
        facts_provider: Callable[[], list[str]] | None = None,
        conversation_timeout: float = 180.0,
        client: Any | None = None,
        on_tool: ToolObserver | None = None,
    ):
        self.registry = registry
        self.model = model
        self.effort = effort
        self.max_tokens = max_tokens
        self.fallbacks = fallbacks
        self.web_search = web_search
        self.max_tool_rounds = max_tool_rounds
        self.notes = notes
        self.facts_provider = facts_provider or (lambda: [])
        self.conversation_timeout = conversation_timeout
        self.on_tool = on_tool or (lambda *_: None)
        self._system = system_prompt(name, user_name, language, pronunciation)
        self._client = client
        self.messages: list[dict[str, Any]] = []
        self.last_activity = 0.0
        self.pending: PendingAction | None = None

    @property
    def client(self) -> Any:
        if self._client is None:
            import anthropic

            self._client = anthropic.Anthropic()
        return self._client

    # Conversazione

    def reset(self) -> None:
        self.messages = []
        self.pending = None

    def _maybe_expire(self) -> None:
        if self.messages and time.time() - self.last_activity > self.conversation_timeout:
            self.reset()
        if len(self.messages) > 60:
            self.reset()

    def _tools(self) -> list[dict[str, Any]]:
        tools = self.registry.schemas(strict=True)
        if self.web_search:
            tools.append({"type": "web_search_20260209", "name": "web_search", "max_uses": 3})
        return tools

    def _request(self, final: bool = False) -> Any:
        params: dict[str, Any] = dict(
            model=self.model,
            max_tokens=self.max_tokens,
            system=[
                {"type": "text", "text": self._system, "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": context_block(self.notes, self.facts_provider())},
            ],
            tools=self._tools(),
            messages=self.messages,
            output_config={"effort": self.effort},
        )
        if final:
            params["tool_choice"] = {"type": "none"}
        if self.fallbacks:
            params["betas"] = [FALLBACK_BETA]
            params["fallbacks"] = "default"
        return self.client.beta.messages.create(**params)

    def ask(self, text: str) -> Reply:
        self._maybe_expire()
        self.pending = None
        self.messages.append({"role": "user", "content": text})
        self.last_activity = time.time()
        used: list[str] = []
        collected_text = ""
        rounds = 0
        while True:
            response = self._request()
            self.messages.append({"role": "assistant", "content": response.content})
            collected_text = _text_of(response.content) or collected_text
            if response.stop_reason == "refusal":
                return Reply("Mi dispiace, non posso aiutarti con questa richiesta.", tools_used=used)
            if response.stop_reason == "pause_turn":
                rounds += 1
                if rounds > self.max_tool_rounds:
                    break
                continue
            if response.stop_reason == "max_tokens":
                return Reply(collected_text + " ...mi sono dilungato troppo, chiedimi di continuare.", tools_used=used)
            tool_uses = [b for b in response.content if getattr(b, "type", "") == "tool_use"]
            if response.stop_reason != "tool_use" or not tool_uses:
                break
            rounds += 1
            results = []
            for block in tool_uses:
                used.append(block.name)
                results.append(self._execute(block))
            self.messages.append({"role": "user", "content": results})
            if rounds >= self.max_tool_rounds:
                # Ultimo giro: lasciamo al modello la parola finale senza altri strumenti
                response = self._request(final=True)
                self.messages.append({"role": "assistant", "content": response.content})
                collected_text = _text_of(response.content) or collected_text
                break
        self.last_activity = time.time()
        return Reply(collected_text.strip() or "Fatto.", pending=self.pending, tools_used=used)

    def _execute(self, block: Any) -> dict[str, Any]:
        tool = self.registry.get(block.name)
        raw_input = block.input if isinstance(block.input, dict) else json.loads(block.input)
        result: dict[str, Any] = {"type": "tool_result", "tool_use_id": block.id}
        if tool is None:
            result["content"] = f"Strumento sconosciuto: {block.name}"
            result["is_error"] = True
            return result
        self.on_tool(tool.name, "running", json.dumps(raw_input, ensure_ascii=False)[:120])
        try:
            output = tool.handler(dict(raw_input))
            self.on_tool(tool.name, "done", output[:120])
            result["content"] = output
        except NeedsConfirmation as pending:
            self.pending = PendingAction(tool, dict(raw_input), pending.description)
            self.on_tool(tool.name, "pending", pending.description)
            result["content"] = (
                f"In attesa di conferma dell'utente per: {pending.description}. "
                "Chiedi conferma con una domanda breve e non richiamare lo strumento."
            )
        except Exception as error:  # lo strumento ha fallito: lo diciamo al modello
            log.debug("strumento %s fallito", tool.name, exc_info=True)
            self.on_tool(tool.name, "error", str(error)[:120])
            result["content"] = f"Errore: {error}"
            result["is_error"] = True
        return result

    # Conferme

    def confirm(self) -> str:
        """Esegue l'azione in sospeso (l'utente ha detto sì) e aggiorna la conversazione."""
        pending = self.pending
        self.pending = None
        if pending is None:
            return "Non c'è nulla da confermare."
        self.on_tool(pending.tool.name, "running", pending.description)
        try:
            output = pending.tool.handler({**pending.input, "_confirmed": True})
            self.on_tool(pending.tool.name, "done", output[:120])
        except Exception as error:
            log.debug("strumento %s fallito dopo conferma", pending.tool.name, exc_info=True)
            self.on_tool(pending.tool.name, "error", str(error)[:120])
            output = f"Non ci sono riuscito: {error}"
        self.messages.append({"role": "user", "content": "Sì, confermo."})
        self.messages.append({"role": "assistant", "content": output})
        self.last_activity = time.time()
        return output

    def decline(self) -> str:
        self.pending = None
        self.messages.append({"role": "user", "content": "No, lascia stare."})
        reply = "Come desidera, annullo."
        self.messages.append({"role": "assistant", "content": reply})
        self.last_activity = time.time()
        return reply


def _text_of(content: list[Any]) -> str:
    return " ".join(getattr(b, "text", "") for b in content if getattr(b, "type", "") == "text").strip()


YES_WORDS = ("sì", "si", "certo", "conferma", "confermo", "ok", "okay", "vai", "procedi", "esatto", "yes", "va bene", "assolutamente")
NO_WORDS = ("no", "annulla", "lascia", "ferma", "niente", "negativo", "non", "stop", "cancella")


def classify_confirmation(text: str) -> str | None:
    """'yes', 'no' oppure None se la frase non è una risposta di conferma."""
    words = [w.strip(".,!?") for w in text.lower().split()]
    if not words or len(words) > 6:
        return None
    joined = " ".join(words)
    if any(w in NO_WORDS for w in words) or joined.startswith("non "):
        return "no"
    if any(w in YES_WORDS for w in words) or joined in YES_WORDS:
        return "yes"
    return None
