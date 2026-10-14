import pytest

from eve.config import load_config


def test_defaults_without_file(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("EVE_CONFIG", raising=False)
    monkeypatch.setenv("HOME", str(tmp_path))
    config = load_config()
    assert config.wakeword.backend == "whisper"
    assert config.wakeword.model == "eve"
    assert "ivi" in config.wakeword.aliases
    assert config.assistant.name == "Eve"
    assert config.brain.model == "claude-opus-5-5"


def test_loads_values_and_coerces_int_to_float(tmp_path):
    path = tmp_path / "config.toml"
    path.write_text('[assistant]\nname = "Denis"\nfollow_up_seconds = 4\n[ui]\nport = 9000\n')
    config = load_config(path)
    assert config.assistant.name == "Denis"
    assert config.assistant.follow_up_seconds == 4.0
    assert config.ui.port == 9000
    assert config.source == str(path)


def test_rejects_unknown_key(tmp_path):
    path = tmp_path / "config.toml"
    path.write_text("[assistant]\nnome = 'x'\n")
    with pytest.raises(ValueError, match="assistant.nome"):
        load_config(path)


def test_rejects_wrong_type(tmp_path):
    path = tmp_path / "config.toml"
    path.write_text("[ui]\nport = 'otto'\n")
    with pytest.raises(ValueError, match="ui.port"):
        load_config(path)


def test_example_config_is_valid():
    from pathlib import Path

    config = load_config(Path(__file__).resolve().parents[1] / "config.example.toml")
    assert config.wakeword.model == "eve"
    assert config.wakeword.aliases[0] == "ivi"
    assert config.home_assistant.enabled is False
    assert config.ui.show_on_wake is True and config.ui.start_hidden is False
