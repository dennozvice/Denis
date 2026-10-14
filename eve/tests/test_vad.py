import numpy as np

from eve.audio.vad import EndpointDetector, frame_energy
from eve.audio.wakeword import ManualTrigger, _Chunker


def tone(seconds, amplitude=6000, rate=16000):
    t = np.arange(int(seconds * rate)) / rate
    return (np.sin(2 * np.pi * 440 * t) * amplitude).astype(np.int16)


def silence(seconds, rate=16000):
    return np.zeros(int(seconds * rate), dtype=np.int16)


def frames(signal, size=1280):
    return [signal[i : i + size] for i in range(0, len(signal) - size + 1, size)]


def test_speech_then_silence_closes_utterance():
    detector = EndpointDetector(silence_seconds=0.5, no_speech_timeout=3.0)
    for frame in frames(np.concatenate([silence(0.2), tone(1.0), silence(0.8)])):
        detector.feed(frame)
        if detector.finished:
            break
    assert detector.finished
    assert detector.has_speech
    assert 1.0 <= detector.audio().size / 16000 <= 1.8


def test_no_speech_times_out_empty():
    detector = EndpointDetector(no_speech_timeout=1.0)
    for frame in frames(silence(2.0)):
        detector.feed(frame)
    assert detector.finished
    assert not detector.has_speech


def test_max_seconds_cuts_long_speech():
    detector = EndpointDetector(max_seconds=2.0, silence_seconds=5.0)
    for frame in frames(tone(4.0)):
        detector.feed(frame)
        if detector.finished:
            break
    assert detector.finished
    assert detector.audio().size / 16000 <= 2.1


def test_calibration_raises_threshold_with_noise():
    detector = EndpointDetector()
    noisy = [(np.random.default_rng(1).normal(0, 1500, 1280)).astype(np.int16) for _ in range(10)]
    quiet_threshold = detector.threshold
    detector.calibrate(noisy)
    assert detector.threshold > quiet_threshold
    assert frame_energy(silence(0.1)) == 0.0


def test_chunker_realigns_frames():
    chunker = _Chunker(512)
    out = chunker.push(np.zeros(1280, dtype=np.int16))
    assert [c.size for c in out] == [512, 512]
    out = chunker.push(np.zeros(1280, dtype=np.int16))
    assert [c.size for c in out] == [512, 512, 512]


def test_manual_trigger_fires_once():
    trigger = ManualTrigger()
    frame = np.zeros(1280, dtype=np.int16)
    assert trigger.feed(frame) is False
    trigger.trigger()
    assert trigger.feed(frame) is True
    assert trigger.feed(frame) is False


# Parola di attivazione tramite Whisper (trascrizione simulata)

from eve.audio.wakeword import WhisperWakeDetector, keyword_match


def test_keyword_match_tolerates_italian_spellings():
    assert keyword_match([("Jarvis", 0.2, 0.7)], "jarvis", 0.75) == (1.0, 0.7)
    assert keyword_match([(" Giarvis,", 0.2, 0.7)], "jarvis", 0.75) is not None
    assert keyword_match([("Gervis", 0.2, 0.7)], "jarvis", 0.7) is not None
    assert keyword_match([("jar", 0.1, 0.3), ("vis", 0.3, 0.6)], "jarvis", 0.75) == (1.0, 0.6)
    assert keyword_match([("ciao", 0.0, 0.3), ("come", 0.3, 0.5), ("va", 0.5, 0.6)], "jarvis", 0.75) is None
    assert keyword_match([("Eveissimo", 0.0, 0.9)], "jarvis", 0.75) is None or keyword_match([("Eveissimo", 0.0, 0.9)], "jarvis", 0.75)[0] < 1.0
    assert keyword_match([], "jarvis", 0.75) is None


def test_whisper_wake_detector_runs_only_on_speech_and_carries_tail():
    calls = []

    def fake_transcribe(audio):
        calls.append(audio.size)
        # "Jarvis" finisce a 0.5 s dall'inizio della finestra
        return [("Jarvis", 0.1, 0.5), ("apri", 0.6, 0.9)]

    detector = WhisperWakeDetector(keyword="jarvis", window_seconds=1.0, hop_seconds=0.5, transcribe=fake_transcribe)
    # Silenzio: nessuna trascrizione
    for frame in frames(silence(1.5)):
        assert detector.feed(frame) is False
    assert calls == []
    # Voce: scatta al primo giro utile
    hit = False
    for frame in frames(tone(1.0)):
        if detector.feed(frame):
            hit = True
            break
    assert hit and len(calls) == 1
    carry = detector.carry()
    assert carry.size > 0
    assert detector.carry().size == 0  # consumato
    # Periodo refrattario: non riscatta subito
    assert all(detector.feed(frame) is False for frame in frames(tone(0.6)))


def test_whisper_wake_detector_ignores_other_words():
    detector = WhisperWakeDetector(keyword="jarvis", window_seconds=1.0, hop_seconds=0.5, transcribe=lambda a: [("buongiorno", 0.0, 0.8)])
    assert all(detector.feed(frame) is False for frame in frames(tone(2.0)))


def test_keyword_match_with_aliases_and_short_words_exact_only():
    keys = ["eve", "ivi", "ivy", "evie"]
    assert keyword_match([("Ivi,", 0.0, 0.4)], keys, 0.75) == (1.0, 0.4)
    assert keyword_match([("Ivy", 0.0, 0.4)], keys, 0.75) == (1.0, 0.4)
    assert keyword_match([("Eve", 0.0, 0.4)], keys, 0.75) == (1.0, 0.4)
    assert keyword_match([("Evie", 0.0, 0.4)], keys, 0.75) == (1.0, 0.4)
    # parole corte: niente somiglianza approssimata
    assert keyword_match([("vivi", 0.0, 0.4)], keys, 0.5) is None
    assert keyword_match([("Eva", 0.0, 0.4)], keys, 0.5) is None
    assert keyword_match([("lì", 0.0, 0.2), ("vi", 0.2, 0.4)], keys, 0.75) is None


def test_normalize_audio_amplifies_quiet_signal():
    from eve.audio.wakeword import normalize_audio

    quiet = (tone(0.5, amplitude=600)).astype(np.int16)  # segnale molto basso
    out = normalize_audio(quiet)
    assert 0.85 <= float(np.abs(out).max()) <= 0.9001
    assert normalize_audio(silence(0.1)).max() == 0.0
    loud = tone(0.5, amplitude=30000)
    assert float(np.abs(normalize_audio(loud)).max()) <= 0.9001
