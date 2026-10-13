import json
import threading
import urllib.request

import pytest

from jarvis.brain.tools import NeedsConfirmation, Tool, ToolRegistry
from jarvis.brain.tools import apps, home, memory as memory_tools, system, timers
from jarvis.brain.tools.memory import Memory


def test_registry_schema_is_strict_and_sorted():
    registry = ToolRegistry()
    registry.add(Tool("zeta", "z", lambda a: "", properties={"x": {"type": "string"}}))
    registry.add(Tool("alpha", "a", lambda a: ""))
    schemas = registry.schemas()
    assert [s["name"] for s in schemas] == ["alpha", "zeta"]
    assert schemas[1]["strict"] is True
    assert schemas[1]["input_schema"]["required"] == ["x"]
    assert schemas[1]["input_schema"]["additionalProperties"] is False


def test_registry_rejects_duplicates():
    registry = ToolRegistry()
    registry.add(Tool("a", "a", lambda a: ""))
    with pytest.raises(ValueError):
        registry.add(Tool("a", "a", lambda a: ""))


def test_full_registry_builds():
    registry = ToolRegistry()
    apps.register(registry)
    system.register(registry, allow_shell=True, allow_power=True, typing=True)
    memory_tools.register(registry, Memory(__import__("pathlib").Path("/nonexistent/memory.json")))
    timers.register(registry, timers.TimerService(lambda t: None))
    home.register(registry, home.HomeAssistant("http://x", "t"))
    names = registry.names()
    assert {"open_app", "run_shell", "power", "set_timer", "home_call_service", "remember"} <= set(names)
    for schema in registry.schemas():
        json.dumps(schema)  # serializzabile


def test_dangerous_tools_require_confirmation():
    with pytest.raises(NeedsConfirmation):
        system.run_shell({"command": "echo ciao"})
    with pytest.raises(NeedsConfirmation):
        system.power({"action": "shutdown"})
    assert "Codice di uscita 0" in system.run_shell({"command": "echo ciao", "_confirmed": True})


def test_memory_roundtrip(tmp_path):
    memory = Memory(tmp_path / "m.json")
    memory.remember("Il  gatto si chiama Tesla")
    memory.remember("Il gatto si chiama Tesla")
    assert memory.facts() == ["Il gatto si chiama Tesla"]
    assert Memory(tmp_path / "m.json").facts() == ["Il gatto si chiama Tesla"]
    assert memory.forget("gatto") == 1
    assert memory.facts() == []


def test_timer_fires_and_cancels():
    fired = threading.Event()
    service = timers.TimerService(lambda text: fired.set() if text == "Pronto" else None)
    timer = service.add(0.05, "Pronto")
    assert fired.wait(1.0)
    assert service.active() == []
    other = service.add(10, "x")
    assert service.cancel(other.id) is True
    assert service.cancel(other.id) is False
    assert timers.describe_duration(90) == "1 minuti e 30 secondi"
    assert timer.id != other.id


def test_home_assistant_request(monkeypatch):
    captured = {}

    class FakeResponse:
        def __init__(self, body):
            self.body = body

        def read(self):
            return self.body

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def fake_urlopen(req, timeout):
        captured["url"] = req.full_url
        captured["auth"] = req.get_header("Authorization")
        captured["body"] = req.data
        return FakeResponse(b'[{"entity_id":"light.sala","state":"off","attributes":{"friendly_name":"Sala"}}]')

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    client = home.HomeAssistant("http://ha.local:8123/", "tok")
    states = client.states("light")
    assert states[0]["entity_id"] == "light.sala"
    assert captured["url"] == "http://ha.local:8123/api/states"
    assert captured["auth"] == "Bearer tok"
    client.call_service("light", "turn_on", {"entity_id": "light.sala", "brightness_pct": 40})
    assert captured["url"].endswith("/api/services/light/turn_on")
    assert json.loads(captured["body"]) == {"entity_id": "light.sala", "brightness_pct": 40}
