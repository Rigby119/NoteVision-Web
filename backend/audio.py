"""Síntesis de audio: eventos -> WAV (16-bit mono) en memoria -> data URI base64."""
import base64
import io
import wave

import numpy as np

SAMPLE_RATE = 22050
# (armónico, amplitud): timbre simple tipo teclado
PARTIALS = ((1, 1.0), (2, 0.35), (3, 0.12))


def _tone(freq, duration):
    n = int(round(SAMPLE_RATE * duration))
    if n <= 0:
        return np.zeros(0)
    t = np.arange(n) / SAMPLE_RATE
    wave_ = np.zeros(n)
    for k, amp in PARTIALS:
        if freq * k < SAMPLE_RATE / 2:  # evita aliasing
            wave_ += amp * np.sin(2 * np.pi * freq * k * t)
    env = np.exp(-1.8 * t)  # caída suave
    attack = min(int(0.008 * SAMPLE_RATE), n // 2)
    release = min(int(0.02 * SAMPLE_RATE), n // 2)
    if attack:
        env[:attack] *= np.linspace(0, 1, attack)
    if release:
        env[-release:] *= np.linspace(1, 0, release)
    return wave_ * env


def synthesize_wav(events, tail=0.25):
    """Devuelve los bytes de un WAV, o None si no hay notas. Nada se escribe a disco."""
    notes = [e for e in events if e["type"] == "note"]
    if not notes:
        return None

    total = max(e["start"] + e["duration"] for e in events) + tail
    buf = np.zeros(int(total * SAMPLE_RATE) + 1)
    for e in notes:
        start = int(round(e["start"] * SAMPLE_RATE))
        tone = _tone(e["freq"], e["duration"])
        end = min(start + len(tone), len(buf))
        buf[start:end] += tone[: end - start]

    peak = float(np.max(np.abs(buf)))
    if peak > 0:
        buf *= 0.8 / peak
    pcm = (np.clip(buf, -1.0, 1.0) * 32767).astype(np.int16)

    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.tobytes())
    return out.getvalue()


def to_data_uri(wav_bytes):
    return "data:audio/wav;base64," + base64.b64encode(wav_bytes).decode("ascii")