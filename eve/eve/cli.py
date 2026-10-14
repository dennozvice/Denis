"""Riga di comando: `eve run`, `eve chat`, `eve devices`, `eve say`, `eve setup`."""

from __future__ import annotations

import argparse
import logging
import sys
import threading
import time
import webbrowser

from eve import __version__
from eve.config import Config, data_dir, load_config
from eve.events import EventBus

log = logging.getLogger("eve")


def build(config: Config, bus: EventBus, *, audio: bool, speak: bool = True):
    """Costruisce tutti i componenti. `audio=False` -> modalità testo (niente microfono né parola)."""
    from eve import secrets
    from eve.assistant import Assistant

    if not secrets.export_to_environment():
        bus.notice("Chiave di Claude non trovata: esegui `eve key` oppure esporta ANTHROPIC_API_KEY", "error")

    from eve.audio.tts import SilentSpeaker, SystemSpeaker
    from eve.audio.wakeword import ManualTrigger, build_detector
    from eve.brain.client import Brain
    from eve.brain.tools import ToolRegistry
    from eve.brain.tools import apps, memory as memory_tools, system, timers
    from eve.brain.tools.memory import Memory

    registry = ToolRegistry()
    apps.register(registry)
    system.register(registry, allow_shell=config.tools.allow_shell, allow_power=config.tools.allow_power, typing=config.tools.typing)
    mem = Memory(data_dir() / "memory.json")
    memory_tools.register(registry, mem)

    assistant_holder: dict[str, Assistant] = {}

    def announce(text: str) -> None:
        if "assistant" in assistant_holder:
            assistant_holder["assistant"].announce(text)

    timer_service = timers.TimerService(announce)
    timers.register(registry, timer_service)

    if config.home_assistant.enabled:
        from eve.brain.tools import home

        if not config.home_assistant.token:
            raise SystemExit("home_assistant.enabled è true ma manca il token")
        home.register(registry, home.HomeAssistant(config.home_assistant.url, config.home_assistant.token))

    brain = Brain(
        registry,
        name=config.assistant.name,
        user_name=config.assistant.user_name,
        language=config.assistant.language,
        pronunciation=config.assistant.pronunciation,
        model=config.brain.model,
        effort=config.brain.effort,
        max_tokens=config.brain.max_tokens,
        fallbacks=config.brain.fallbacks,
        web_search=config.brain.web_search,
        max_tool_rounds=config.brain.max_tool_rounds,
        notes=config.brain.notes,
        facts_provider=mem.facts,
        conversation_timeout=config.assistant.conversation_timeout_seconds,
        on_tool=bus.tool,
    )

    speaker = SystemSpeaker(config.tts.backend, config.tts.voice, config.tts.rate, config.tts.command, config.assistant.language) if speak else SilentSpeaker()

    if audio:
        from eve.audio.capture import Microphone
        from eve.audio.stt import WhisperTranscriber

        bus.notice("Carico il modello di trascrizione…")
        hint = " ".join(dict.fromkeys([config.assistant.name, config.assistant.pronunciation.capitalize()]))
        transcriber = WhisperTranscriber(config.stt.model, config.stt.device, config.stt.compute_type, config.assistant.language, hint=hint)
        detector = make_detector(config)
        microphone = Microphone(config.audio.sample_rate, config.audio.input_device or None)
    else:
        transcriber = None
        detector = ManualTrigger()
        microphone = None

    assistant = Assistant(config, bus, brain, transcriber, speaker, detector, microphone)
    assistant_holder["assistant"] = assistant
    return assistant


def make_detector(config: Config):  # noqa: ANN201
    from eve.audio.wakeword import build_detector

    return build_detector(
        config.wakeword.backend,
        config.wakeword.model,
        config.wakeword.threshold,
        config.wakeword.access_key,
        aliases=list(config.wakeword.aliases),
        whisper_model=config.wakeword.whisper_model,
        device=config.stt.device,
        compute_type=config.stt.compute_type,
        language=config.assistant.language,
    )


def console_logger(bus: EventBus, name: str = "Eve") -> None:
    def listener(event) -> None:  # noqa: ANN001
        if event.type == "state" and event.data.get("detail"):
            print(f"[{event.data['state']}] {event.data['detail']}", flush=True)
        elif event.type == "transcript":
            who = "Tu" if event.data["role"] == "user" else name
            print(f"{who}: {event.data['text']}", flush=True)
        elif event.type == "tool":
            print(f"  · {event.data['name']} {event.data['status']} {event.data.get('detail', '')}", flush=True)
        elif event.type == "notice":
            print(f"! {event.data['text']}", flush=True)

    bus.subscribe(listener)


def start_hud(config: Config, bus: EventBus, assistant, window: bool = False) -> None:  # noqa: ANN001
    from eve.ui.server import HudServer

    server = HudServer(
        bus,
        config.ui.host,
        config.ui.port,
        on_text=lambda text: assistant.handle_text(text),
        on_trigger=assistant.trigger,
        on_stop=assistant.speaker.stop,
        name=config.assistant.name,
        tagline=config.assistant.tagline,
    )
    server.start()
    print(f"HUD: {server.url}", flush=True)
    if window:
        config.ui.open = "window"
    if config.ui.open == "browser":
        webbrowser.open(server.url)
    elif config.ui.open == "window":
        try:
            import webview  # pywebview
        except ImportError:
            print("pywebview non installato (pip install 'eve-assistant[window]'): apro il browser", flush=True)
            webbrowser.open(server.url)
            return
        run_window(config, bus, server.url)
        raise KeyboardInterrupt


def run_window(config: Config, bus: EventBus, url: str) -> None:
    """Finestra dell'HUD (pywebview). Chiuderla la nasconde soltanto: Eve resta in ascolto.

    Blocca il thread principale finché l'app non viene chiusa dal Dock (Esci) o con Ctrl+C.
    """
    import webview

    window = webview.create_window(
        f"{config.assistant.name} HUD",
        url,
        width=1280,
        height=800,
        background_color="#02070d",
        hidden=config.ui.start_hidden,
    )
    hide_timer: list[threading.Timer] = []

    def cancel_hide() -> None:
        for timer in hide_timer:
            timer.cancel()
        hide_timer.clear()

    def schedule_hide() -> None:
        cancel_hide()
        if config.ui.hide_after_seconds > 0:
            timer = threading.Timer(config.ui.hide_after_seconds, window.hide)
            timer.daemon = True
            hide_timer.append(timer)
            timer.start()

    def on_event(event) -> None:  # noqa: ANN001
        if event.type == "wake" and config.ui.show_on_wake:
            cancel_hide()
            window.show()
        elif event.type == "state" and event.data.get("state") == "idle":
            schedule_hide()
        elif event.type == "state":
            cancel_hide()

    def on_closing() -> bool:
        window.hide()  # la finestra sparisce, il processo continua ad ascoltare
        return False

    bus.subscribe(on_event)
    window.events.closing += on_closing
    if config.ui.start_hidden:
        print("Finestra nascosta: comparirà quando dirai la parola di attivazione.", flush=True)
    webview.start()


def cmd_run(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    bus = EventBus()
    console_logger(bus, config.assistant.name)
    print(f"{config.assistant.name} {__version__} · configurazione: {config.source}", flush=True)
    assistant = build(config, bus, audio=not args.text, speak=not args.mute)
    assistant.start()
    try:
        if config.ui.enabled:
            start_hud(config, bus, assistant, window=getattr(args, "window", False))
        if args.text:
            return chat_loop(assistant)
        print("Pronto. Premi Invio per attivare senza parola, Ctrl+C per uscire.", flush=True)
        for _line in sys.stdin:
            assistant.trigger()
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        assistant.stop()
    return 0


def chat_loop(assistant) -> int:  # noqa: ANN001
    print("Modalità testo. Scrivi un comando (vuoto per uscire).", flush=True)
    while True:
        try:
            text = input("> ").strip()
        except EOFError:
            return 0
        if not text:
            return 0
        assistant.handle_text(text)


def cmd_chat(args: argparse.Namespace) -> int:
    args.text = True
    return cmd_run(args)


def cmd_devices(args: argparse.Namespace) -> int:
    from eve.audio.capture import list_input_devices

    for device in list_input_devices():
        mark = "*" if device["default"] else " "
        print(f"{mark} [{device['index']}] {device['name']} ({device['sample_rate']} Hz)")
    print("\n* = predefinito. Imposta [audio].input_device con il numero o il nome.")
    return 0


def cmd_say(args: argparse.Namespace) -> int:
    from eve.audio.tts import SystemSpeaker

    config = load_config(args.config)
    speaker = SystemSpeaker(config.tts.backend, config.tts.voice, config.tts.rate, config.tts.command, config.assistant.language)
    speaker.speak(" ".join(args.text) or f"Buongiorno {config.assistant.user_name}, sono {config.assistant.name}.")
    return 0


def cmd_setup(args: argparse.Namespace) -> int:
    """Scarica i modelli (trascrizione e parola di attivazione) e controlla le chiavi."""
    import os

    config = load_config(args.config)
    print("1/3 Modello di trascrizione…", flush=True)
    from faster_whisper import WhisperModel

    WhisperModel(config.stt.model, device=config.stt.device, compute_type=config.stt.compute_type)
    print("    ok", flush=True)
    print("2/3 Parola di attivazione…", flush=True)
    detector = make_detector(config)
    detector.close()
    print("    ok", flush=True)
    print("3/3 Chiave di Claude…", flush=True)
    from eve import secrets

    source = secrets.key_source()
    if source:
        print(f"    trovata: {source}", flush=True)
    elif os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        print("    trovata: ANTHROPIC_AUTH_TOKEN", flush=True)
    else:
        print("    non trovata: esegui `eve key` per salvarla, oppure esporta ANTHROPIC_API_KEY", flush=True)
    return 0


def cmd_key(args: argparse.Namespace) -> int:
    """Salva la chiave di Claude nel Portachiavi (macOS) o in un file privato."""
    import getpass

    from eve import secrets

    if args.show:
        source = secrets.key_source()
        print(f"Chiave trovata: {source}" if source else "Nessuna chiave salvata.")
        return 0
    value = args.value or getpass.getpass("Incolla la chiave di Claude (non viene mostrata): ")
    try:
        where = secrets.set_api_key(value)
    except ValueError:
        print("Nessuna chiave inserita.")
        return 1
    print(f"Chiave salvata in: {where}")
    return 0


def cmd_app(args: argparse.Namespace) -> int:
    """Crea Eve.app nella cartella Applicazioni dell'utente."""
    from pathlib import Path

    from eve import macapp

    if not macapp.is_macos():
        print("Questo comando funziona solo su macOS.")
        return 1
    try:
        import webview  # noqa: F401
    except ImportError:
        print("Serve pywebview per la finestra dell'app: esegui  pip install -e \".[window]\"  e riprova.")
        return 1
    config = load_config(args.config)
    config_path = Path(config.source) if config.source.startswith("/") else None
    project_dir = Path(__file__).resolve().parents[1]
    dest = Path(args.dest).expanduser() if args.dest else macapp.default_dest()
    app = macapp.build_app(dest, project_dir, config=config_path, name=config.assistant.name, bundle_id=f"it.denis.{config.assistant.name.lower()}")
    print(f"Creata: {app}")
    print("Aprila dal Finder (cartella Applicazioni della tua home) oppure con:  open \"" + str(app) + "\"")
    print("Al primo avvio macOS chiederà il permesso per il microfono. Per tenerla nel Dock: tasto destro sull'icona › Opzioni › Mantieni nel Dock.")
    return 0


def cmd_listen_test(args: argparse.Namespace) -> int:
    """Mostra in tempo reale il punteggio della parola di attivazione: utile per tarare la soglia."""
    config = load_config(args.config)
    from eve.audio.capture import Microphone, rms_level

    detector = make_detector(config)
    mic = Microphone(config.audio.sample_rate, config.audio.input_device or None)
    mic.start()
    try:
        import sounddevice as sd

        device_info = sd.query_devices(mic.device if mic.device is not None else sd.default.device[0])
        print(f"Microfono in uso: {device_info['name']}", flush=True)
    except Exception:
        pass
    print(f'Di\' "{config.wakeword.model}" (pronuncia: {config.assistant.pronunciation or config.wakeword.model}). Ctrl+C per uscire.', flush=True)
    print("La barra mostra il livello del microfono (parlando dovrebbe superare il 20%); le parole sentite compaiono man mano.", flush=True)
    peak = 0.0
    last_shown: list[str] = []
    silent = 0
    try:
        for frame in mic.frames():
            level = rms_level(frame)
            silent = silent + 1 if int(abs(frame).max()) == 0 else 0
            if silent == 75:
                print("\n! Il microfono manda solo silenzio: probabilmente manca il permesso in Privacy e sicurezza › Microfono.", flush=True)
            peak = max(peak * 0.995, level)
            bar = "#" * int(level * 40)
            hit = detector.feed(frame)
            words = getattr(detector, "last_words", [])
            if words and words != last_shown:
                last_shown = list(words)
                print(f"\r{'':<70}\r  sentito: {' '.join(w.strip() for w in words)}", flush=True)
            print(f"\r{bar:<40} {int(level * 100):3d}% (picco {int(peak * 100):3d}%) {'RILEVATA!' if hit else ''}", end="", flush=True)
            if hit:
                print()
    except KeyboardInterrupt:
        pass
    finally:
        mic.stop()
        detector.close()
    return 0


def main(argv: list[str] | None = None) -> int:
    # Opzioni comuni, accettate sia prima sia dopo il sottocomando (eve --config x run / eve run --config x)
    common = argparse.ArgumentParser(add_help=False)
    # SUPPRESS: il sottocomando non sovrascrive con un default il valore letto prima di esso
    common.add_argument("--config", default=argparse.SUPPRESS, help="percorso del file config.toml")
    common.add_argument("-v", "--verbose", action="store_true", default=argparse.SUPPRESS)
    parser = argparse.ArgumentParser(prog="eve", description="Assistente vocale sempre in ascolto.", parents=[common])
    sub = parser.add_subparsers(dest="command", parser_class=lambda **kw: argparse.ArgumentParser(parents=[common], **kw))

    run = sub.add_parser("run", help="avvia l'assistente (microfono, parola di attivazione, HUD)")
    run.add_argument("--text", action="store_true", help="senza microfono: comandi scritti")
    run.add_argument("--mute", action="store_true", help="non parlare (solo testo)")
    run.add_argument("--window", action="store_true", help="HUD in una finestra dedicata (serve pywebview)")
    run.set_defaults(func=cmd_run)

    chat = sub.add_parser("chat", help="solo testo: prova il cervello senza audio")
    chat.add_argument("--mute", action="store_true")
    chat.set_defaults(func=cmd_chat)

    sub.add_parser("devices", help="elenca i microfoni").set_defaults(func=cmd_devices)
    say = sub.add_parser("say", help="prova la voce")
    say.add_argument("text", nargs="*")
    say.set_defaults(func=cmd_say)
    sub.add_parser("setup", help="scarica i modelli e verifica le chiavi").set_defaults(func=cmd_setup)
    sub.add_parser("listen-test", help="prova la parola di attivazione").set_defaults(func=cmd_listen_test)
    key = sub.add_parser("key", help="salva la chiave di Claude (Portachiavi o file privato)")
    key.add_argument("value", nargs="?", help="la chiave; se omessa viene chiesta senza mostrarla")
    key.add_argument("--show", action="store_true", help="dice solo dove è salvata")
    key.set_defaults(func=cmd_key)
    app = sub.add_parser("app", help="crea l'app per avviarlo dal Dock (macOS)")
    app.add_argument("--dest", help="cartella di destinazione (predefinita: ~/Applications)")
    app.set_defaults(func=cmd_app)

    args = parser.parse_args(argv)
    args.config = getattr(args, "config", None)
    args.verbose = getattr(args, "verbose", False)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.WARNING, format="%(name)s: %(message)s")
    if not args.command:
        parser.print_help()
        return 1
    return args.func(args)
