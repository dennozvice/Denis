"""Orchestratore in modalità testo (nessun microfono) con cervello finto."""

from eve.assistant import Assistant
from eve.audio.tts import SilentSpeaker
from eve.audio.wakeword import ManualTrigger
from eve.brain.client import PendingAction, Reply
from eve.brain.tools import Tool
from eve.config import Config
from eve.events import EventBus


class FakeBrain:
    def __init__(self):
        self.pending = None
        self.asked = []
        self.confirmed = False

    def ask(self, text):
        self.asked.append(text)
        if text == "spegni":
            self.pending = PendingAction(Tool("power", "p", lambda a: "Spengo."), {"action": "shutdown"}, "spegnere")
            return Reply("Confermi lo spegnimento?", pending=self.pending)
        if text == "errore":
            raise ConnectionError("rete")
        return Reply(f"Risposta a {text}")

    def confirm(self):
        self.confirmed = True
        self.pending = None
        return "Spengo."

    def decline(self):
        self.pending = None
        return "Annullo."


def make():
    bus = EventBus()
    events = []
    bus.subscribe(lambda e: events.append(e))
    brain = FakeBrain()
    speaker = SilentSpeaker()
    assistant = Assistant(Config(), bus, brain, None, speaker, ManualTrigger(), None)
    assistant.start()
    return assistant, brain, speaker, events


def test_text_roundtrip_publishes_transcript_and_speaks():
    assistant, brain, speaker, events = make()
    assert assistant.handle_text("ciao") == "Risposta a ciao"
    assert speaker.spoken == ["Risposta a ciao"]
    transcripts = [(e.data["role"], e.data["text"]) for e in events if e.type == "transcript"]
    assert transcripts == [("user", "ciao"), ("assistant", "Risposta a ciao")]
    states = [e.data["state"] for e in events if e.type == "state"]
    assert states[0] == "idle" and "thinking" in states and "speaking" in states


def test_confirmation_flow_yes_and_no():
    assistant, brain, speaker, _ = make()
    assistant.handle_text("spegni")
    assert brain.pending is not None
    assistant.handle_text("sì")
    assert brain.confirmed is True
    assert speaker.spoken[-1] == "Spengo."
    assistant.handle_text("spegni")
    assistant.handle_text("no grazie")
    assert brain.pending is None
    assert speaker.spoken[-1] == "Annullo."


def test_unrelated_text_drops_pending():
    assistant, brain, speaker, _ = make()
    assistant.handle_text("spegni")
    assistant.handle_text("che ore sono")
    assert brain.pending is None
    assert brain.asked[-1] == "che ore sono"


def test_brain_error_is_spoken_gently():
    assistant, brain, speaker, events = make()
    assistant.handle_text("errore")
    assert "rete" in speaker.spoken[-1]
    assert any(e.type == "notice" and e.data["kind"] == "error" for e in events)
