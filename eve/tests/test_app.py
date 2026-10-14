"""Chiave salvata e creazione di Eve.app (senza toccare il Portachiavi vero)."""

import plistlib
import os
import stat

from eve import macapp, secrets


def test_secrets_file_fallback(tmp_path, monkeypatch):
    monkeypatch.setenv("EVE_HOME", str(tmp_path))
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(secrets.platform, "system", lambda: "Linux")
    assert secrets.get_api_key() == ""
    assert secrets.key_source() == ""
    where = secrets.set_api_key("  sk-ant-test  ")
    assert where == str(tmp_path / "secrets.toml")
    assert stat.S_IMODE(os.stat(where).st_mode) == 0o600
    assert secrets.get_api_key() == "sk-ant-test"
    assert secrets.export_to_environment() == "variabile d'ambiente" or os.environ["ANTHROPIC_API_KEY"] == "sk-ant-test"
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-env")
    assert secrets.get_api_key() == "sk-env"
    assert secrets.key_source() == "variabile d'ambiente"


def test_build_app_bundle(tmp_path):
    project = tmp_path / "progetto"
    project.mkdir()
    app = macapp.build_app(tmp_path / "apps", project, python=tmp_path / "py", config=project / "config.toml", name="Denis")
    assert app == tmp_path / "apps" / "Denis.app"
    with open(app / "Contents" / "Info.plist", "rb") as handle:
        plist = plistlib.load(handle)
    assert plist["CFBundleExecutable"] == "launch"
    assert plist["CFBundleIconFile"] == "eve.icns"
    assert "NSMicrophoneUsageDescription" in plist
    launcher = app / "Contents" / "MacOS" / "launch"
    assert launcher.stat().st_mode & stat.S_IXUSR
    script = launcher.read_text()
    assert f'cd "{project}"' in script
    assert '-m eve --config "' in script and 'config.toml" run --window' in script
    assert "display alert" in script and "denis.log" in script
    assert (app / "Contents" / "Resources" / "eve.icns").stat().st_size > 10000
    # ricostruire sovrascrive senza errori
    macapp.build_app(tmp_path / "apps", project, python=tmp_path / "py", name="Denis")


def test_cli_accepts_config_before_and_after_subcommand(monkeypatch):
    from eve import cli

    seen = []
    monkeypatch.setattr(cli, "cmd_devices", lambda args: seen.append(args.config) or 0)
    # il sottocomando va reimpostato perché i parser sono costruiti dentro main()
    parser_main = cli.main
    assert parser_main(["--config", "/a.toml", "devices"]) == 0
    assert parser_main(["devices", "--config", "/b.toml"]) == 0
    assert seen == ["/a.toml", "/b.toml"]
