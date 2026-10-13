import numpy as np

from jarvis.audio.vad import EndpointDetector, frame_energy
from jarvis.audio.wakeword import ManualTrigger, _Chunker


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
