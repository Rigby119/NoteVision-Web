// Conversión de los eventos del backend a una estructura de partitura. Sin dependencias de VexFlow.
// El backend ya resolvió tono, armadura y alteraciones; aquí solo se agrupa y se traduce a nombres de VexFlow.

const CLEF_NAMES = {
    'G-L2': 'treble',
    'G-L1': 'french',
    'F-L4': 'bass',
    'F-L3': 'baritone-f',
    'F-L5': 'subbass',
    'C-L3': 'alto',
    'C-L4': 'tenor',
    'C-L1': 'soprano',
    'C-L2': 'mezzo-soprano',
    'C-L5': 'baritone-c',
};
// Índice diatónico (C0 = 0) de la nota que marca cada clave: G4, F3, C4
const CLEF_BASE = { G: 32, F: 24, C: 28 };
const FALLBACK = { G: 'treble', F: 'bass', C: 'alto' };

export function vexClefName(token) {
    return CLEF_NAMES[token] ?? FALLBACK[token?.[0]] ?? 'treble';
}

// Nota de la 3.ª línea (para centrar los silencios) según la clave. Misma aritmética que el backend.
export function middleLineKey(token) {
    const m = /^([GFC])-L([1-5])$/.exec(token ?? '');
    if (!m) return 'b/4';
    const idx = CLEF_BASE[m[1]] + (6 - 2 * Number(m[2]));
    return `${'cdefgab'[idx % 7]}/${Math.floor(idx / 7)}`;
}

/** result (respuesta del backend) -> { measures, keyName, timeSig, beatsPerMeasure } o null si no hay eventos */
export function buildScore(result) {
    const { events, metadata } = result;
    if (!events.length) return null;

    const measures = [];
    for (const ev of events) {
        let m = measures[measures.length - 1];
        if (!m || m.index !== ev.measure) {
            m = { index: ev.measure, clef: ev.clef, events: [] };
            measures.push(m);
        }
        m.events.push(ev);
    }

    const ts = metadata.time_signature;
    return {
        measures,
        keyName: metadata.key_signature?.name ?? null,
        // Solo se dibuja si el modelo la detectó; el 4/4 por defecto no es una detección
        timeSig: ts.source === 'detected' ? `${ts.beats}/${ts.beat_type}` : null,
        beatsPerMeasure: (ts.beats * 4) / ts.beat_type, // en negras
    };
}

const FRACTIONS = {
    double_whole: '2/1',
    whole: '1/1',
    half: '1/2',
    quarter: '1/4',
    eighth: '1/8',
    sixteenth: '1/16',
    thirty_second: '1/32',
    sixty_fourth: '1/64',
    sixty_four: '1/64',
    hundred_twenty_eighth: '1/128',
    hundred_twenty_eight: '1/128',
};
const DOT_NAMES = ['', ' · dotted', ' · double dotted', ' · triple dotted'];

// "1/4 note", "1/2 note · dotted", "1/8 rest"
export function describeDuration(ev) {
    const base = FRACTIONS[ev.duration_name] ?? ev.duration_name;
    return `${base} ${ev.type === 'rest' ? 'rest' : 'note'}${DOT_NAMES[ev.dots] ?? ''}`;
}