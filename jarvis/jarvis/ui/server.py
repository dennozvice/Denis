"""HUD: server web locale che trasmette gli eventi di Jarvis via WebSocket."""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from collections import deque
from pathlib import Path
from typing import Any, Callable

from aiohttp import WSMsgType, web

from jarvis.events import Event, EventBus

log = logging.getLogger("jarvis.ui")
STATIC = Path(__file__).parent / "static"


class HudServer:
    def __init__(
        self,
        bus: EventBus,
        host: str = "127.0.0.1",
        port: int = 8765,
        on_text: Callable[[str], None] | None = None,
        on_trigger: Callable[[], None] | None = None,
        on_stop: Callable[[], None] | None = None,
        name: str = "Jarvis",
    ):
        self.bus = bus
        self.host = host
        self.port = port
        self.name = name
        self.on_text = on_text
        self.on_trigger = on_trigger
        self.on_stop = on_stop
        self._clients: set[web.WebSocketResponse] = set()
        self._history: deque[dict[str, Any]] = deque(maxlen=40)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._ready = threading.Event()

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}/"

    # Avvio in un thread dedicato

    def start(self) -> None:
        self.bus.subscribe(self._on_event)
        self._thread = threading.Thread(target=self._run, name="jarvis-hud", daemon=True)
        self._thread.start()
        if not self._ready.wait(timeout=5):
            raise RuntimeError("HUD non avviato")

    def _run(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self._serve())

    async def _serve(self) -> None:
        app = web.Application()
        app.router.add_get("/", self._index)
        app.router.add_get("/ws", self._websocket)
        app.router.add_static("/static", STATIC)
        runner = web.AppRunner(app, access_log=None)
        await runner.setup()
        site = web.TCPSite(runner, self.host, self.port)
        await site.start()
        self._ready.set()
        while True:
            await asyncio.sleep(3600)

    # Eventi dal nucleo -> browser

    def _on_event(self, event: Event) -> None:
        payload = event.as_dict()
        if event.type in ("transcript", "tool", "notice"):
            self._history.append(payload)
        if self._loop is not None:
            self._loop.call_soon_threadsafe(self._schedule_broadcast, payload)

    def _schedule_broadcast(self, payload: dict[str, Any]) -> None:
        asyncio.ensure_future(self._broadcast(payload))

    async def _broadcast(self, payload: dict[str, Any]) -> None:
        message = json.dumps(payload, ensure_ascii=False)
        dead = []
        for ws in list(self._clients):
            try:
                await ws.send_str(message)
            except (ConnectionResetError, RuntimeError):
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)

    # Handler HTTP

    async def _index(self, request: web.Request) -> web.Response:
        html = (STATIC / "index.html").read_text(encoding="utf-8").replace("{{NAME}}", self.name)
        return web.Response(text=html, content_type="text/html")

    async def _websocket(self, request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse(heartbeat=20)
        await ws.prepare(request)
        self._clients.add(ws)
        await ws.send_str(json.dumps({"type": "hello", "name": self.name, "state": self.bus.state, "history": list(self._history)}, ensure_ascii=False))
        try:
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    continue
                try:
                    data = json.loads(msg.data)
                except json.JSONDecodeError:
                    continue
                self._dispatch(data)
        finally:
            self._clients.discard(ws)
        return ws

    def _dispatch(self, data: dict[str, Any]) -> None:
        kind = data.get("type")
        if kind == "text" and self.on_text and data.get("text", "").strip():
            threading.Thread(target=self.on_text, args=(data["text"].strip(),), daemon=True).start()
        elif kind == "trigger" and self.on_trigger:
            self.on_trigger()
        elif kind == "stop" and self.on_stop:
            self.on_stop()
