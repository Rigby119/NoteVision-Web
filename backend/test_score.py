"""Pruebas rápidas de la lógica musical. Ejecutar: python test_score.py"""
from score import interpret


def pitches(tokens, **kw):
    return [e["pitch"] for e in interpret(tokens, **kw)["events"] if e["type"] == "note"]


# Clave de Sol: L1 = E4, S0 = D4, L2 = G4
assert pitches(["clef.G-L2", "note.quarter-L1", "note.quarter-S0", "note.quarter-L2"]) == ["E4", "D4", "G4"]

# Clave de Fa en L4: L1 = G2
assert pitches(["clef.F-L4", "note.quarter-L1"]) == ["G2"]

# Armadura de Sol mayor (F#): todas las F son F#
r = interpret(["clef.G-L2", "accidental.sharp-L5", "metersign.C-L3", "note.quarter-L5"])
assert r["events"][0]["pitch"] == "F#5" and r["events"][0]["midi"] == 78
assert r["metadata"]["key_signature"]["name"] == "G"

# Alteración local: dura el compás y se cancela con la barra
t = ["clef.G-L2", "note.quarter-L1", "accidental.flat-L3", "note.quarter-L3",
     "note.quarter-L3", "barline-L1", "note.quarter-L3"]
assert pitches(t) == ["E4", "Bb4", "Bb4", "B4"]

# Puntillo y beamed (= corchea)
ev = interpret(["clef.G-L2", "note.quarter-L2", "dot-S2",
                "note.beamedBoth1-L3", "note.beamedBoth2-L3"])["events"]
assert [e["beats"] for e in ev] == [1.5, 0.5, 0.25]

# Cambio manual de clave
assert pitches(["clef.G-L2", "note.quarter-L1"], clef_override="F-L4") == ["G2"]

# Sin clave -> se asume Sol y se avisa
m = interpret(["note.quarter-L1"])["metadata"]
assert m["clef_status"] == "assumed" and m["warnings"]

w = interpret(["clef.G-L2", "note.quarter-L3", "note.quarter-L3", "barline-L1", "note.quarter-L3"])["metadata"]["warnings"]
assert len([x for x in w if x.startswith("Measure")]) == 2

print("OK: todas las pruebas pasaron")