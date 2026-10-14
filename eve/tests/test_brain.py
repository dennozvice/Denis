"""Il ciclo con Claude, provato con un client finto che imita le risposte dell'API."""

from types import SimpleNamespace

from jarvis.brain.client import Brain, classify_confirmation
from jarvis.brain.tools import NeedsConfirmation, Tool, ToolRegistry


def text_block(text):
    return SimpleNamespace(type="text", text=text)


def tool_block(name, input_, id_="tu_1"):
    return SimpleNamespace(type="tool_use", name=name, input=input_, id=id_)


class FakeClient:
    """Restituisce le risposte in sequenza e registra le richieste."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self.create))

    def create(self, **params):
        self.requests.append({**params, "messages": list(params["messages"])})
        content, stop = self.responses.pop(0)
        return SimpleNamespace(content=content, stop_reason=stop)


def make_brain(responses, registry=None, **kwargs):
    registry = registry or ToolRegistry()
    client = FakeClient(responses)
    kwargs.setdefault("conversation_timeout", 1000)
    brain = Brain(registry, client=client, **kwargs)
    return brain, client


def test_plain_answer():
    brain, client = make_brain([([text_block("Buongiorno, Signore.")], "end_turn")])
    reply = brain.ask("ciao")
    assert reply.text == "Buongiorno, Signore."
    request = client.requests[0]
    assert request["model"] == "claude-opus-5-5"
    assert request["fallbacks"] == "default"
    assert request["betas"] == ["server-side-fallback-2026-07-01"]
    assert request["output_config"] == {"effort": "low"}
    assert request["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert any(t.get("type") == "web_search_20260209" for t in request["tools"])
    assert request["messages"][0] == {"role": "user", "content": "ciao"}


def test_tool_call_then_answer():
    calls = []
    registry = ToolRegistry()
    registry.add(Tool("open_app", "apre", lambda a: calls.append(a) or "Safari aperta.", properties={"name": {"type": "string"}}))
    brain, client = make_brain(
        [
            ([tool_block("open_app", {"name": "Safari"})], "tool_use"),
            ([text_block("Safari è aperto.")], "end_turn"),
        ],
        registry,
        web_search=False,
        fallbacks=False,
    )
    reply = brain.ask("apri safari")
    assert calls == [{"name": "Safari"}]
    assert reply.text == "Safari è aperto."
    assert reply.tools_used == ["open_app"]
    # il risultato dello strumento torna al modello con l'id giusto
    second = client.requests[1]["messages"]
    assert second[-1]["role"] == "user"
    assert second[-1]["content"][0] == {"type": "tool_result", "tool_use_id": "tu_1", "content": "Safari aperta."}
    assert "fallbacks" not in client.requests[0]


def test_parallel_tool_results_in_one_message():
    registry = ToolRegistry()
    registry.add(Tool("a", "a", lambda _: "ra"))
    registry.add(Tool("b", "b", lambda _: (_ for _ in ()).throw(RuntimeError("rotto"))))
    brain, client = make_brain(
        [
            ([tool_block("a", {}, "1"), tool_block("b", {}, "2")], "tool_use"),
            ([text_block("ok")], "end_turn"),
        ],
        registry,
    )
    brain.ask("fai a e b")
    results = client.requests[1]["messages"][-1]["content"]
    assert [r["tool_use_id"] for r in results] == ["1", "2"]
    assert results[1]["is_error"] is True
    assert "rotto" in results[1]["content"]


def test_dangerous_tool_waits_for_confirmation():
    executed = []

    def shutdown(args):
        if not args.get("_confirmed"):
            raise NeedsConfirmation("spegnere il computer")
        executed.append(args)
        return "Spengo."

    registry = ToolRegistry()
    registry.add(Tool("power", "p", shutdown, dangerous=True))
    brain, client = make_brain(
        [
            ([tool_block("power", {"action": "shutdown"})], "tool_use"),
            ([text_block("Vuole davvero spegnere il computer?")], "end_turn"),
        ],
        registry,
    )
    reply = brain.ask("spegni il pc")
    assert reply.pending is not None
    assert reply.pending.description == "spegnere il computer"
    assert executed == []
    assert "attesa di conferma" in client.requests[1]["messages"][-1]["content"][0]["content"]
    assert brain.confirm() == "Spengo."
    assert executed == [{"action": "shutdown", "_confirmed": True}]
    assert brain.pending is None
    assert brain.messages[-2:] == [{"role": "user", "content": "Sì, confermo."}, {"role": "assistant", "content": "Spengo."}]


def test_decline_clears_pending():
    brain, _ = make_brain([])
    brain.pending = object()
    assert "annullo" in brain.decline()
    assert brain.pending is None


def test_refusal_and_max_tokens():
    brain, _ = make_brain([([], "refusal")])
    assert "non posso" in brain.ask("x").text
    brain, _ = make_brain([([text_block("Inizio")], "max_tokens")])
    assert brain.ask("y").text.startswith("Inizio")


def test_pause_turn_resends():
    brain, client = make_brain([([text_block("")], "pause_turn"), ([text_block("Trovato.")], "end_turn")])
    assert brain.ask("cerca").text == "Trovato."
    assert len(client.requests) == 2


def test_conversation_expires_after_timeout():
    brain, client = make_brain(
        [([text_block("a")], "end_turn"), ([text_block("b")], "end_turn")],
        conversation_timeout=0.0,
    )
    brain.ask("uno")
    brain.last_activity -= 1  # simula il tempo passato
    brain.ask("due")
    assert len(client.requests[1]["messages"]) == 1


def test_tool_round_limit():
    registry = ToolRegistry()
    registry.add(Tool("loop", "l", lambda _: "ancora"))
    responses = [([tool_block("loop", {})], "tool_use")] * 2 + [([text_block("Basta.")], "end_turn")]
    brain, client = make_brain(responses, registry, max_tool_rounds=2)
    assert brain.ask("vai").text == "Basta."
    assert len(client.requests) == 3
    # all'ultimo giro il modello non può più chiamare strumenti
    assert client.requests[2]["tool_choice"] == {"type": "none"}
    assert "tool_choice" not in client.requests[0]


def test_classify_confirmation():
    assert classify_confirmation("Sì") == "yes"
    assert classify_confirmation("va bene, procedi") == "yes"
    assert classify_confirmation("no, lascia stare") == "no"
    assert classify_confirmation("non farlo") == "no"
    assert classify_confirmation("che ore sono?") is None
    assert classify_confirmation("sì ma prima dimmi quanto spazio c'è sul disco per favore") is None
