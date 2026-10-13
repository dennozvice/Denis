"""Il server dell'HUD: pagina, WebSocket, eventi in entrambe le direzioni."""

import asyncio
import json
import socket
import threading

import aiohttp
import pytest

from jarvis.events import EventBus
from jarvis.ui.server import HudServer


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def server():
    bus = EventBus()
    received = []
    triggered = threading.Event()
    hud = HudServer(bus, "127.0.0.1", free_port(), on_text=received.append, on_trigger=triggered.set, name="Denis")
    hud.start()
    return hud, bus, received, triggered


def test_index_and_static(server):
    hud, *_ = server

    async def go():
        async with aiohttp.ClientSession() as session:
            async with session.get(hud.url) as resp:
                assert resp.status == 200
                html = await resp.text()
                assert "Denis HUD" in html and "{{NAME}}" not in html
            async with session.get(hud.url + "static/hud.js") as resp:
                assert resp.status == 200

    asyncio.run(go())


def test_websocket_receives_events_and_sends_commands(server):
    hud, bus, received, triggered = server

    async def go():
        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(hud.url + "ws") as ws:
                hello = json.loads((await ws.receive_str()))
                assert hello["type"] == "hello" and hello["name"] == "Denis"
                bus.set_state("listening", "Ti ascolto")
                bus.transcript("user", "ciao")
                first = json.loads(await asyncio.wait_for(ws.receive_str(), 2))
                second = json.loads(await asyncio.wait_for(ws.receive_str(), 2))
                assert first["type"] == "state" and first["state"] == "listening"
                assert second["type"] == "transcript" and second["text"] == "ciao"
                await ws.send_str(json.dumps({"type": "text", "text": "apri safari"}))
                await ws.send_str(json.dumps({"type": "trigger"}))
                await asyncio.sleep(0.2)
            async with session.ws_connect(hud.url + "ws") as ws:
                hello = json.loads(await ws.receive_str())
                assert [h["type"] for h in hello["history"]] == ["transcript"]

    asyncio.run(go())
    assert received == ["apri safari"]
    assert triggered.is_set()
