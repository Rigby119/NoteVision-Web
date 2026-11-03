// Genera un archivo MIDI (formato 0) en memoria a partir de los eventos del backend
const PPQ = 480;
const VELOCITY = 90;

const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const u16 = (n) => [(n >> 8) & 255, n & 255];
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

// Cantidad de longitud variable (delta times)
function vlq(n) {
    const out = [n & 0x7f];
    let v = n >> 7;
    while (v > 0) {
        out.unshift((v & 0x7f) | 0x80);
        v >>= 7;
    }
    return out;
}

export function buildMidiBlob(result) {
    const { events, metadata } = result;
    const { beats, beat_type: beatType } = metadata.time_signature;

    const marks = [];
    for (const ev of events) {
        if (ev.type !== 'note' || ev.midi == null) continue;
        const on = Math.round(ev.start_beats * PPQ);
        const off = Math.max(on + 1, Math.round((ev.start_beats + ev.beats) * PPQ));
        marks.push({ tick: on, order: 1, bytes: [0x90, ev.midi, VELOCITY] });
        marks.push({ tick: off, order: 0, bytes: [0x80, ev.midi, 0] }); // el off va antes del on del mismo tick
    }
    marks.sort((a, b) => a.tick - b.tick || a.order - b.order);

    const tempo = Math.round(60_000_000 / metadata.bpm); // microsegundos por negra
    const track = [
        0x00, 0xff, 0x51, 0x03, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255,
        0x00, 0xff, 0x58, 0x04, Math.min(255, beats), Math.round(Math.log2(Math.max(1, beatType))), 24, 8,
        0x00, 0xc0, 0x00, // programa 0: piano
    ];
    let last = 0;
    for (const m of marks) {
        track.push(...vlq(m.tick - last), ...m.bytes);
        last = m.tick;
    }
    track.push(0x00, 0xff, 0x2f, 0x00);

    const bytes = [
        ...ascii('MThd'), ...u32(6), ...u16(0), ...u16(1), ...u16(PPQ),
        ...ascii('MTrk'), ...u32(track.length), ...track,
    ];
    return new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
}