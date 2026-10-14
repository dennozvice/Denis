"""Domotica tramite Home Assistant (API REST)."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from eve.brain.tools.base import Tool, ToolRegistry


class HomeAssistant:
    def __init__(self, url: str, token: str, timeout: float = 10.0):
        self.url = url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def request(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            f"{self.url}/api/{path.lstrip('/')}",
            data=data,
            method=method,
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                raw = response.read().decode()
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"Home Assistant ha risposto {error.code}: {error.read().decode()[:200]}") from error
        except urllib.error.URLError as error:
            raise RuntimeError(f"Home Assistant non raggiungibile: {error.reason}") from error
        return json.loads(raw) if raw else None

    def states(self, domain: str | None = None) -> list[dict[str, Any]]:
        states = self.request("GET", "states")
        if domain:
            states = [s for s in states if s["entity_id"].startswith(domain + ".")]
        return states

    def call_service(self, domain: str, service: str, data: dict[str, Any]) -> Any:
        return self.request("POST", f"services/{domain}/{service}", data)


def format_state(state: dict[str, Any]) -> str:
    name = state.get("attributes", {}).get("friendly_name", state["entity_id"])
    return f"{state['entity_id']} ({name}): {state.get('state')}"


def register(registry: ToolRegistry, client: HomeAssistant) -> None:
    def list_devices(args: dict[str, Any]) -> str:
        states = client.states(args.get("domain") or None)
        if not states:
            return "Nessun dispositivo trovato."
        return "\n".join(format_state(s) for s in states[:80])

    def get_state(args: dict[str, Any]) -> str:
        state = client.request("GET", f"states/{args['entity_id']}")
        attrs = {k: v for k, v in state.get("attributes", {}).items() if k in ("brightness", "temperature", "current_temperature", "unit_of_measurement", "friendly_name")}
        return f"{format_state(state)} {json.dumps(attrs, ensure_ascii=False)}"

    def call_service(args: dict[str, Any]) -> str:
        data: dict[str, Any] = {"entity_id": args["entity_id"]}
        extra = args.get("data")
        if extra:
            try:
                data.update(json.loads(extra))
            except json.JSONDecodeError:
                return "Il campo data deve essere JSON valido."
        client.call_service(args["domain"], args["service"], data)
        return f"Fatto: {args['domain']}.{args['service']} su {args['entity_id']}."

    registry.add(
        Tool(
            "home_list_devices",
            "Elenca i dispositivi della casa (Home Assistant) con stato attuale. Usa domain per filtrare: light, switch, climate, cover, media_player, sensor, scene, script.",
            list_devices,
            properties={"domain": {"type": ["string", "null"], "description": "Dominio da filtrare oppure null per tutti."}},
        )
    )
    registry.add(
        Tool(
            "home_get_state",
            "Stato dettagliato di un dispositivo della casa.",
            get_state,
            properties={"entity_id": {"type": "string", "description": "Es. light.soggiorno"}},
        )
    )
    registry.add(
        Tool(
            "home_call_service",
            "Comanda un dispositivo della casa: domain+service come light.turn_on, light.turn_off, switch.toggle, climate.set_temperature, cover.open_cover, scene.turn_on, media_player.media_pause.",
            call_service,
            properties={
                "domain": {"type": "string"},
                "service": {"type": "string"},
                "entity_id": {"type": "string"},
                "data": {"type": ["string", "null"], "description": "Parametri aggiuntivi in JSON, es. {\"brightness_pct\": 40} o {\"temperature\": 21}; null se non servono."},
            },
        )
    )
