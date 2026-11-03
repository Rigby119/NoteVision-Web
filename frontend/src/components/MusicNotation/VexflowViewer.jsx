import { useEffect, useMemo, useRef, useState } from 'react';
import NoteInspector from './NoteInspector.jsx';
import { buildScore } from '../../utils/primusParser.js';
import { drawScore } from '../../utils/drawScore.js';
import { useActiveIndex } from '../../utils/usePlayerStore.js';

const PREFIX = 'vf-nv-n'; // id del grupo SVG de cada nota: vf-nv-n<index del evento>

/**
 * Notación con VexFlow. La nota en reproducción se ilumina según el store de reproducción.
 * onHoverNote(event | null): se llama al cambiar la nota bajo el cursor.
 */
export default function VexflowViewer({ result, store, onHoverNote }) {
    const activeIndex = useActiveIndex(store, result.events);
    const outerRef = useRef(null);
    const hostRef = useRef(null);
    const hoverRef = useRef(null);
    const [error, setError] = useState(null);
    const [tip, setTip] = useState(null);

    const byIndex = useMemo(() => new Map(result.events.map((e) => [e.index, e])), [result]);
    const score = useMemo(() => buildScore(result), [result]);

    useEffect(() => {
        const host = hostRef.current;
        host.replaceChildren();
        hoverRef.current = null;
        setTip(null);
        setError(null);
        if (!score) return undefined;
        try {
            drawScore(host, score);
        } catch (err) {
            console.error(err);
            setError('Could not draw the notation. The predicted tokens are still listed below.');
        }
        return () => host.replaceChildren();
    }, [score]);

    // Nota en reproducción
    useEffect(() => {
        if (activeIndex == null) return undefined;
        const el = hostRef.current.querySelector(`[id="${PREFIX}${activeIndex}"]`);
        el?.classList.add('is-active');
        return () => el?.classList.remove('is-active');
    }, [activeIndex, score]);

    const setHover = (g) => {
        if (hoverRef.current === g) return;
        hoverRef.current?.classList.remove('is-hover');
        g?.classList.add('is-hover');
        hoverRef.current = g;
        onHoverNote?.(g ? (byIndex.get(Number(g.id.slice(PREFIX.length))) ?? null) : null);
    };

    const handleMove = (e) => {
        const g = e.target.closest?.('.nv-note') ?? null;
        setHover(g);
        const ev = g ? byIndex.get(Number(g.id.slice(PREFIX.length))) : null;
        if (!ev) {
            setTip(null);
            return;
        }
        const box = outerRef.current.getBoundingClientRect();
        setTip({ event: ev, x: e.clientX - box.left, y: e.clientY - box.top, width: box.width });
    };

    const handleLeave = () => {
        setHover(null);
        setTip(null);
    };

    if (!score) return <p className="result__warning">No notes were recognized in this region.</p>;
    if (error) return <p className="result__warning">{error}</p>;

    return (
        <div ref={outerRef} className="nv-score" onPointerMove={handleMove} onPointerLeave={handleLeave}>
            <div className="nv-score__scroll">
                <div ref={hostRef} className="nv-host" role="img" aria-label={`Recognized notation, ${result.metadata.note_count} notes`} />
            </div>
            {tip && <NoteInspector event={tip.event} x={tip.x} y={tip.y} containerWidth={tip.width} />}
        </div>
    );
}