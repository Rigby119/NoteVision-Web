import * as VexModule from 'vexflow';
import { middleLineKey, vexClefName } from './primusParser.js';

// Compatible con las dos formas de exportar de vexflow 4.x
const VF = VexModule.Flow ?? VexModule.default?.Flow ?? VexModule;
const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Accidental, Dot } = VF;

const MARGIN_X = 10;
const STAVE_Y = 50;
const HEIGHT = 200;
const MIN_NOTES_WIDTH = 80;
// Ancho aproximado por figura (px); el Formatter reparte el espacio sobrante
const WIDTH_BY_DURATION = { w: 64, h: 54, q: 46, 8: 38, 16: 34, 32: 32, 64: 32, 128: 32 };
const ALTER_SYMBOL = { 1: '#', '-1': 'b', 2: '##', '-2': 'bb' };

function makeNote(ev, vexClef, restKey, keyName) {
    const dots = 'd'.repeat(ev.dots);
    let note;
    if (ev.type === 'rest') {
        note = new StaveNote({ clef: vexClef, keys: [restKey], duration: `${ev.vf_duration}${dots}r` });
    } else {
        note = new StaveNote({
            clef: vexClef,
            keys: [`${ev.letter.toLowerCase()}/${ev.octave}`],
            duration: `${ev.vf_duration}${dots}`,
            auto_stem: true,
        });
        // La armadura ya marca sus alteraciones; solo se dibujan las escritas en el compás.
        // Si no hay armadura reconocible, se muestra la alteración de cada nota alterada.
        const symbol = ev.accidental ?? (!keyName && ev.alter !== 0 ? ALTER_SYMBOL[ev.alter] : null);
        if (symbol) note.addModifier(new Accidental(symbol), 0);
    }
    for (let i = 0; i < ev.dots; i += 1) Dot.buildAndAttach([note], { all: true });
    note.setAttribute('id', `nv-n${ev.index}`); // el grupo SVG queda como "vf-nv-n<index>"
    return note;
}

function estimateWidth(events) {
    const sum = events.reduce(
        (acc, ev) => acc + (WIDTH_BY_DURATION[ev.vf_duration] ?? 40) + (ev.accidental ? 16 : 0) + ev.dots * 10,
        30,
    );
    return Math.max(MIN_NOTES_WIDTH, sum);
}

// VexFlow pinta con colores fijos: se marca cada trazo según use relleno o contorno,
// y el color real lo ponen las variables de theme.css desde el CSS
function tagPaint(svg) {
    svg.querySelectorAll('path, rect, line, circle, ellipse, polygon, text').forEach((el) => {
        const fill = el.style.fill || el.getAttribute('fill');
        const stroke = el.style.stroke || el.getAttribute('stroke');
        el.style.removeProperty('fill');
        el.style.removeProperty('stroke');
        if (fill !== 'none') el.setAttribute('data-f', '');
        if (stroke && stroke !== 'none') el.setAttribute('data-s', '');
    });
}

// Las plicas viven en su propio grupo SVG (vf-stem). Se marcan siempre con trazo y relleno
// (una línea ignora el relleno, así que es inofensivo) y, si quedaron fuera del grupo de
// su nota, se mueven dentro de él para que el color y el hover les lleguen igual.
function adoptStems(svg) {
    const notes = [...svg.querySelectorAll('.nv-note')].map((g) => ({ g, b: g.getBBox() }));

    svg.querySelectorAll('.vf-stem').forEach((stem) => {
        stem.querySelectorAll('path, line, rect').forEach((el) => {
            el.setAttribute('data-s', '');
            el.setAttribute('data-f', '');
        });
        if (stem.closest('.nv-note')) return;

        const sb = stem.getBBox();
        const cx = sb.x + sb.width / 2;
        let best = null;
        let bestDist = Infinity;
        notes.forEach(({ g, b }) => {
            if (cx < b.x - 4 || cx > b.x + b.width + 4) return;
            const dist = Math.abs(b.x + b.width / 2 - cx) + Math.abs(b.y + b.height / 2 - (sb.y + sb.height / 2)) * 0.1;
            if (dist < bestDist) {
                best = g;
                bestDist = dist;
            }
        });
        best?.appendChild(stem);
    });
}

// Área invisible alrededor de cada nota para que el hover sea cómodo
function addHitAreas(svg) {
    svg.querySelectorAll('.nv-note').forEach((g) => {
        try {
            const b = g.getBBox();
            const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            hit.setAttribute('class', 'nv-hit');
            hit.setAttribute('x', b.x - 5);
            hit.setAttribute('y', b.y - 5);
            hit.setAttribute('width', b.width + 10);
            hit.setAttribute('height', b.height + 10);
            g.appendChild(hit);
        } catch {
            /* getBBox falla si el contenedor está oculto: la nota sigue visible, solo sin área extra */
        }
    });
}

/** Dibuja la partitura en `host` (div vacío). Una sola fila de compases. */
export function drawScore(host, score) {
    const renderer = new Renderer(host, Renderer.Backends.SVG);

    // 1) Construir compases y calcular anchuras
    let x = MARGIN_X;
    let prevClef = null;
    const items = score.measures.map((m, i) => {
        const vexClef = vexClefName(m.clef);
        const stave = new Stave(x, STAVE_Y, 1000);
        if (i === 0 || m.clef !== prevClef) stave.addClef(vexClef);
        if (i === 0 && score.keyName) stave.addKeySignature(score.keyName);
        if (i === 0 && score.timeSig) stave.addTimeSignature(score.timeSig);
        prevClef = m.clef;

        const modWidth = stave.getNoteStartX() - x;
        const notesWidth = estimateWidth(m.events);
        stave.setWidth(modWidth + notesWidth);

        const restKey = middleLineKey(m.clef);
        const notes = m.events.map((ev) => makeNote(ev, vexClef, restKey, score.keyName));
        // Modo flexible: un compás incompleto o excedido se dibuja igualmente
        const voice = new Voice({ num_beats: score.beatsPerMeasure, beat_value: 4 })
            .setMode(Voice.Mode.SOFT)
            .addTickables(notes);
        const beams = Beam.generateBeams(notes);
        beams.forEach((b, bi) => b.setAttribute('id', `nv-b${m.index}-${bi}`));
        new Formatter().joinVoices([voice]).format([voice], notesWidth - 20);

        x += modWidth + notesWidth;
        return { stave, voice, beams };
    });

    const totalWidth = x + MARGIN_X;
    renderer.resize(totalWidth, HEIGHT);
    const ctx = renderer.getContext();

    // 2) Dibujar
    items.forEach(({ stave, voice, beams }) => {
        stave.setContext(ctx).draw();
        voice.draw(ctx, stave);
        beams.forEach((b) => b.setContext(ctx).draw());
    });

    // 3) Escalado, marcado de colores y áreas de hover
    const svg = host.querySelector('svg');
    svg.setAttribute('viewBox', `0 0 ${totalWidth} ${HEIGHT}`);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.minWidth = `${Math.round(totalWidth * 0.7)}px`;
    svg.style.maxWidth = `${Math.round(totalWidth * 1.6)}px`;

    tagPaint(svg);
    svg.querySelectorAll('[id^="vf-nv-n"]').forEach((g) => g.classList.add('nv-note'));
    svg.querySelectorAll('[id^="vf-nv-b"]').forEach((g) => g.classList.add('nv-beam'));
    adoptStems(svg);
    addHitAreas(svg);
}