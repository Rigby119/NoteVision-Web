"""Interpretación de tokens agnósticos (PrIMuS) -> eventos musicales.

Fuente única de verdad para el tono (lógica de predict.py: posición en el pentagrama + clave),
más armadura, alteraciones accidentales, puntillos y duraciones. No depende de TensorFlow.
"""
import re

ASSUMED_CLEF = "clef.G-L2"
LETTERS = "CDEFGAB"
SEMITONES = [0, 2, 4, 5, 7, 9, 11]
# Índice diatónico (C=0 ... B=6, +7 por octava) de la nota que marca cada clave: G4, F3, C4
CLEF_NOTE = {"G": 4 * 7 + 4, "F": 3 * 7 + 3, "C": 4 * 7 + 0}

POSITION_RE = re.compile(r"^([LS])(-?\d+)$")
CLEF_RE = re.compile(r"^(?:clef\.)?([GFC])-L([1-5])$")
BEAMED_RE = re.compile(r"^beamed(?:both|left|right)?(\d+)?$", re.IGNORECASE)

# nombre -> (pulsos en negras, duración VexFlow)
DURATIONS = {
    "double_whole": (8.0, "w"),
    "whole": (4.0, "w"),
    "half": (2.0, "h"),
    "quarter": (1.0, "q"),
    "eighth": (0.5, "8"),
    "sixteenth": (0.25, "16"),
    "thirty_second": (0.125, "32"),
    "sixty_fourth": (0.0625, "64"),
    "sixty_four": (0.0625, "64"),
    "hundred_twenty_eighth": (0.03125, "128"),
    "hundred_twenty_eight": (0.03125, "128"),
}
# Número de barras de una nota "beamed": 1 -> corchea, 2 -> semicorchea, ...
BEAM_TO_NAME = {1: "eighth", 2: "sixteenth", 3: "thirty_second", 4: "sixty_fourth", 5: "hundred_twenty_eighth"}

# alteración: (desplazamiento en semitonos, símbolo para mostrar)
ACCIDENTALS = {
    "sharp": (1, "#"), "flat": (-1, "b"), "natural": (0, "n"),
    "double_sharp": (2, "##"), "doublesharp": (2, "##"),
    "double_flat": (-2, "bb"), "doubleflat": (-2, "bb"),
}
ALTER_SUFFIX = {1: "#", -1: "b", 2: "##", -2: "bb", 0: ""}

# Tokens conocidos que no afectan al tono/tiempo (se listan en metadata.ignored_tokens)
IGNORED_KINDS = {"gracenote", "tie", "slur", "fermata", "multirest", "staccato", "tenuto",
                 "accent", "trill", "mordent", "turn", "marcato", "stopped", "tuplet"}

# Tonalidades mayores por número de alteraciones (-7..+7)
MAJOR_KEYS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"]

MAX_DOTS = 3


# ---------------------------------------------------------------- utilidades de tokens
def split_token(tok):
    fam, _, pos = tok.partition("-")
    kind, _, subtype = fam.partition(".")
    return {"token": tok, "kind": kind, "subtype": subtype or None, "position": pos or None}


def normalize_clef(value):
    """'F-L4' o 'clef.F-L4' -> 'clef.F-L4'. ValueError si no es válida."""
    m = CLEF_RE.match((value or "").strip())
    if m is None:
        raise ValueError(f"Invalid clef: {value!r} (expected e.g. 'G-L2', 'F-L4' or 'C-L3')")
    return f"clef.{m.group(1)}-L{m.group(2)}"


def staff_step(position):
    """Espacio bajo la línea 1 = 0; línea k -> 2k-1; espacio k -> 2k. None si no es válida."""
    m = POSITION_RE.match(position or "")
    if m is None:
        return None
    n = int(m.group(2))
    return 2 * n - 1 if m.group(1) == "L" else 2 * n


def diatonic_index(position, clef_token):
    """Índice diatónico absoluto (C0=0) a partir de posición + clave. None si no se puede."""
    m = CLEF_RE.match(clef_token)
    step = staff_step(position)
    if m is None or step is None:
        return None
    clef_step = staff_step(f"L{m.group(2)}")
    return CLEF_NOTE[m.group(1)] + (step - clef_step)


def duration_info(subtype):
    """subtype -> (nombre, pulsos, vf) o None si no se reconoce."""
    if subtype is None:
        return None
    if subtype in DURATIONS:
        beats, vf = DURATIONS[subtype]
        return subtype, beats, vf
    m = BEAMED_RE.match(subtype)
    if m:  # 'beamed' sin número = corchea
        n = min(max(int(m.group(1) or 1), 1), 5)
        name = BEAM_TO_NAME[n]
        beats, vf = DURATIONS[name]
        return name, beats, vf
    return None


def dotted_beats(base, dots):
    return base * (2.0 - 2.0 ** -dots)


def midi_to_freq(midi):
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


# ---------------------------------------------------------------- interpretación
def interpret(tokens, bpm=120, clef_override=None):
    """Convierte la secuencia de tokens en eventos temporizados + metadatos.

    clef_override: fuerza una clave para TODA la secuencia (corrección manual en el visor).
    """
    override = normalize_clef(clef_override) if clef_override else None
    clef = override or ASSUMED_CLEF
    clef_basis = "override" if override else "assumed"
    detected_clef = None

    events, unrecognized, ignored, warnings = [], [], [], []
    key_alter = {}        # letra -> alteración (armadura)
    measure_alter = {}    # (letra, octava) -> alteración vigente en el compás
    pending = {}          # posición -> (alteración, símbolo), a la espera de su nota
    digits = []           # dígitos de la métrica (antes de la primera nota)
    time_sig = None
    measure = 0
    measure_has_events = False
    seen_content = False  # ya apareció la primera nota/silencio

    for i, tok in enumerate(tokens):
        t = split_token(tok)
        kind, sub, pos = t["kind"], t["subtype"], t["position"]

        if kind == "clef":
            if detected_clef is None:
                detected_clef = tok
            if not override:
                if CLEF_RE.match(tok):
                    clef, clef_basis = tok, "detected"
                else:
                    unrecognized.append(tok)

        elif kind == "accidental":
            info = ACCIDENTALS.get((sub or "").lower())
            if info is None or pos is None:
                unrecognized.append(tok)
            elif not seen_content:
                # Antes de la primera nota: armadura
                idx = diatonic_index(pos, clef)
                if idx is None:
                    unrecognized.append(tok)
                else:
                    key_alter[LETTERS[idx % 7]] = info[0]
            else:
                pending[pos] = info  # alteración accidental: aplica a la siguiente nota en esa posición

        elif kind == "metersign":
            if sub == "C":
                time_sig = {"beats": 4, "beat_type": 4, "source": "detected"}
            elif sub == "C/":
                time_sig = {"beats": 2, "beat_type": 2, "source": "detected"}
            else:
                unrecognized.append(tok)

        elif kind == "digit":
            if not seen_content and sub and sub.isdigit():
                digits.append((sub, pos))
            else:
                ignored.append(tok)  # p. ej. números de tresillo

        elif kind == "barline":
            if measure_has_events:
                measure += 1
                measure_has_events = False
            measure_alter.clear()
            pending.clear()

        elif kind in ("note", "rest"):
            seen_content = True
            dur = duration_info(sub)
            if dur is None:
                unrecognized.append(tok)
                continue
            name, beats, vf = dur
            ev = {
                "index": len(events), "token_index": i, "token": tok, "type": kind,
                "position": pos, "clef": clef.replace("clef.", ""),
                "duration_name": name, "vf_duration": vf, "dots": 0, "beats": beats,
                "measure": measure, "pitch": None, "letter": None, "octave": None,
                "alter": 0, "accidental": None, "midi": None, "freq": None,
            }
            if kind == "note":
                idx = diatonic_index(pos, clef)
                if idx is None:
                    unrecognized.append(tok)
                    continue
                letter, octave = LETTERS[idx % 7], idx // 7
                shown = None
                if pos in pending:
                    alter, shown = pending.pop(pos)
                    measure_alter[(letter, octave)] = alter
                alter = measure_alter.get((letter, octave), key_alter.get(letter, 0))
                midi = 12 * (octave + 1) + SEMITONES[idx % 7] + alter
                if not 0 <= midi <= 127:
                    warnings.append(f"Note outside the MIDI range skipped: {tok}")
                    continue
                ev.update({
                    "letter": letter, "octave": octave, "alter": alter, "accidental": shown,
                    "pitch": f"{letter}{ALTER_SUFFIX[alter]}{octave}",
                    "midi": midi, "freq": round(midi_to_freq(midi), 2),
                })
            else:
                pending.clear()
            events.append(ev)
            measure_has_events = True

        elif kind == "dot":
            if events and events[-1]["dots"] < MAX_DOTS and events[-1]["token_index"] < i:
                last = events[-1]
                last["dots"] += 1
                base = DURATIONS.get(last["duration_name"], (last["beats"], ""))[0]
                last["beats"] = dotted_beats(base, last["dots"])
            else:
                unrecognized.append(tok)

        elif kind in IGNORED_KINDS:
            ignored.append(tok)

        else:
            unrecognized.append(tok)

    # Tiempos absolutos (los puntillos ya están aplicados)
    sec_per_beat = 60.0 / bpm
    cursor = 0.0
    for ev in events:
        ev["start_beats"] = cursor
        ev["start"] = round(cursor * sec_per_beat, 4)
        ev["duration"] = round(ev["beats"] * sec_per_beat, 4)
        cursor += ev["beats"]
    duration_sec = round(cursor * sec_per_beat, 3)

    # Métrica: dígitos agrupados por posición (12/8 -> '1','2' en la misma posición)
    if time_sig is None and digits:
        groups = []
        for d, p in digits:
            if groups and groups[-1][0] == p:
                groups[-1][1].append(d)
            else:
                groups.append((p, [d]))
        if len(groups) == 2:
            time_sig = {"beats": int("".join(groups[0][1])),
                        "beat_type": int("".join(groups[1][1])), "source": "detected"}
        else:
            unrecognized.extend(f"digit.{d}-{p}" for d, p in digits)
    if time_sig is None:
        time_sig = {"beats": 4, "beat_type": 4, "source": "default"}

    # Compases que no cuadran con la métrica: solo se avisa, la UI los dibuja en modo flexible
    expected = time_sig["beats"] * 4.0 / time_sig["beat_type"]
    measure_beats = {}
    for ev in events:
        measure_beats[ev["measure"]] = measure_beats.get(ev["measure"], 0.0) + ev["beats"]
    for m_idx in sorted(measure_beats):
        total = measure_beats[m_idx]
        if abs(total - expected) > 1e-6:
            kind = "incomplete" if total < expected else "too long"
            warnings.append(f"Measure {m_idx + 1} is {kind}: {total:g} beats found, {expected:g} expected.")

    # Armadura
    sharps = sum(1 for a in key_alter.values() if a > 0)
    flats = sum(1 for a in key_alter.values() if a < 0)
    fifths = sharps - flats if not (sharps and flats) else None
    key_signature = {
        "fifths": fifths,
        "name": MAJOR_KEYS[fifths + 7] if fifths is not None and -7 <= fifths <= 7 else None,
        "accidentals": [f"{l}{ALTER_SUFFIX[a]}" for l, a in sorted(key_alter.items()) if a],
    }

    if override:
        warnings.append(f"Clef manually set to {override.replace('clef.', '')}; predicted clefs are ignored.")
    elif detected_clef is None:
        warnings.append(f"No clef was predicted; {ASSUMED_CLEF.replace('clef.', '')} is ASSUMED. This is an assumption, not a detection.")
    if not any(e["type"] == "note" for e in events):
        warnings.append("No notes were found in the prediction.")

    metadata = {
        "token_count": len(tokens),
        "note_count": sum(1 for e in events if e["type"] == "note"),
        "detected_clef": detected_clef.replace("clef.", "") if detected_clef else None,
        "clef_status": "override" if override else ("detected" if detected_clef else "assumed"),
        "clef_used": clef.replace("clef.", ""),
        "time_signature": time_sig,
        "key_signature": key_signature,
        "bpm": bpm,
        "duration_sec": duration_sec,
        "measure_count": (events[-1]["measure"] + 1) if events else 0,
        "expected_beats": expected,
        "unrecognized_tokens": unrecognized,
        "ignored_tokens": ignored,
        "warnings": warnings,
    }
    return {"events": events, "metadata": metadata}