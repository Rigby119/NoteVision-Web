import { useEffect, useMemo, useRef } from 'react';
import { useActiveIndex } from '../../utils/usePlayerStore.js';
import { describeDuration } from '../../utils/primusParser.js';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Vista "Piano roll" de las notas reconocidas. Clic = saltar a ese instante. */
export default function PianoRoll({ result, store, onHoverNote }) {
    const gridRef = useRef(null);
    const playheadRef = useRef(null);
    const activeIndex = useActiveIndex(store, result.events);

    const notes = useMemo(() => result.events.filter((e) => e.type === 'note'), [result]);
    const total = useMemo(() => Math.max(0.5, ...result.events.map((e) => e.start + e.duration)), [result]);
    const range = useMemo(() => {
        if (!notes.length) return null;
        let lo = Math.min(...notes.map((n) => n.midi)) - 2;
        let hi = Math.max(...notes.map((n) => n.midi)) + 2;
        while (hi - lo < 11) {
            lo -= 1;
            hi += 1;
        }
        return { lo, hi, rows: hi - lo + 1 };
    }, [notes]);
    const barStarts = useMemo(() => {
        const starts = new Map();
        result.events.forEach((e) => {
            if (!starts.has(e.measure)) starts.set(e.measure, e.start);
        });
        return [...starts.values()].slice(1); // la primera barra es el borde izquierdo
    }, [result]);

    // El playhead se mueve directamente en el DOM (sin re-render)
    useEffect(() => {
        const el = playheadRef.current;
        if (!el) return undefined;
        const update = () => {
            el.style.left = `${clamp01(store.get() / total) * 100}%`;
        };
        update();
        return store.subscribe(update);
    }, [store, total]);

    if (!range) return <p className="result__warning">No notes were recognized in this region.</p>;

    const rowIndexes = Array.from({ length: range.rows }, (_, i) => range.hi - i); // de agudo a grave
    const rowH = 100 / range.rows;
    const template = { gridTemplateRows: `repeat(${range.rows}, 1fr)` };

    const handleClick = (e) => {
        const r = gridRef.current.getBoundingClientRect();
        store.seek(clamp01((e.clientX - r.left) / r.width) * total);
    };

    return (
        <div className="roll">
            <div className="roll__keys" style={template} aria-hidden="true">
                {rowIndexes.map((m) => (
                    <div key={m} className="roll__label">
                        {m % 12 === 0 ? `${NAMES[0]}${Math.floor(m / 12) - 1}` : ''}
                    </div>
                ))}
            </div>

            <div ref={gridRef} className="roll__grid" onClick={handleClick}>
                <div className="roll__rows" style={template}>
                    {rowIndexes.map((m) => (
                        <div key={m} className="roll__row" data-black={BLACK.has(m % 12)} />
                    ))}
                </div>

                {barStarts.map((s) => (
                    <div key={s} className="roll__bar" style={{ left: `${(s / total) * 100}%` }} />
                ))}

                {notes.map((n) => (
                    <div
                        key={n.index}
                        className={`roll__note ${n.index === activeIndex ? 'is-active' : ''}`}
                        style={{
                            left: `${(n.start / total) * 100}%`,
                            width: `${(n.duration / total) * 100}%`,
                            top: `${(range.hi - n.midi) * rowH}%`,
                            height: `${rowH}%`,
                        }}
                        title={`${n.pitch} · ${n.freq.toFixed(2)} Hz · ${describeDuration(n)}`}
                        onPointerEnter={() => onHoverNote?.(n)}
                        onPointerLeave={() => onHoverNote?.(null)}
                    />
                ))}

                <div ref={playheadRef} className="roll__playhead" />
            </div>
        </div>
    );
}