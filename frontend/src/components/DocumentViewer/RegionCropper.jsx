import { useRef, useState } from 'react';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MIN_PX = 24; // tamaño mínimo (px de pantalla) para aceptar una selección
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

// Rectángulo (fracciones 0..1 de la página) según el gesto en curso
function computeRect(drag, p) {
    const { mode, handle, start, origin } = drag;

    if (mode === 'draw') {
        return {
            x: Math.min(start.x, p.x),
            y: Math.min(start.y, p.y),
            w: Math.abs(p.x - start.x),
            h: Math.abs(p.y - start.y),
        };
    }
    if (mode === 'move') {
        return {
            x: clamp(origin.x + p.x - start.x, 0, 1 - origin.w),
            y: clamp(origin.y + p.y - start.y, 0, 1 - origin.h),
            w: origin.w,
            h: origin.h,
        };
    }
    // resize: cada letra del manejador (n, s, e, w) mueve su borde
    let l = origin.x;
    let r = origin.x + origin.w;
    let t = origin.y;
    let b = origin.y + origin.h;
    if (handle.includes('w')) l = clamp(p.x, 0, r - p.minW);
    if (handle.includes('e')) r = clamp(p.x, l + p.minW, 1);
    if (handle.includes('n')) t = clamp(p.y, 0, b - p.minH);
    if (handle.includes('s')) b = clamp(p.y, t + p.minH, 1);
    return { x: l, y: t, w: r - l, h: b - t };
}

/**
 * Capa sobre la página para dibujar, mover y redimensionar la región.
 * value: región confirmada {x,y,w,h} | null. onCommit(rect) se llama al soltar el puntero.
 */
export default function RegionCropper({ value, enabled, label, onCommit }) {
    const overlayRef = useRef(null);
    const dragRef = useRef(null);
    const draftRef = useRef(null);
    const [draft, setDraftState] = useState(null);

    const setDraft = (d) => {
        draftRef.current = d;
        setDraftState(d);
    };

    const toPoint = (e) => {
        const r = overlayRef.current.getBoundingClientRect();
        return {
            x: clamp((e.clientX - r.left) / r.width),
            y: clamp((e.clientY - r.top) / r.height),
            minW: MIN_PX / r.width,
            minH: MIN_PX / r.height,
        };
    };

    const handlePointerDown = (e) => {
        if (!enabled || e.button !== 0) return;
        const start = toPoint(e);
        const handle = e.target.dataset?.handle;
        const current = draftRef.current ?? value;
        dragRef.current =
            current && handle
                ? { mode: handle === 'move' ? 'move' : 'resize', handle, start, origin: current }
                : { mode: 'draw', start, origin: null };
        overlayRef.current.setPointerCapture(e.pointerId);
        e.preventDefault();
    };

    const handlePointerMove = (e) => {
        const drag = dragRef.current;
        if (drag) setDraft(computeRect(drag, toPoint(e)));
    };

    const finish = (e, cancelled) => {
        const drag = dragRef.current;
        if (!drag) return;
        dragRef.current = null;
        const el = overlayRef.current;
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);

        const rect = draftRef.current;
        setDraft(null);
        if (cancelled || !rect) return; // clic sin arrastre: no hay cambios

        const box = el.getBoundingClientRect();
        if (rect.w * box.width < MIN_PX || rect.h * box.height < MIN_PX) return; // selección demasiado pequeña
        onCommit(rect);
    };

    const box = draft ?? value;

    return (
        <div
            ref={overlayRef}
            className="cropper"
            data-enabled={enabled}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(e) => finish(e, false)}
            onPointerCancel={(e) => finish(e, true)}
        >
            {box && (
                <div
                    className="cropper__box"
                    data-handle="move"
                    style={{
                        left: `${box.x * 100}%`,
                        top: `${box.y * 100}%`,
                        width: `${box.w * 100}%`,
                        height: `${box.h * 100}%`,
                    }}
                >
                    {label && <span className="cropper__badge">{label}</span>}
                    {enabled &&
                        HANDLES.map((h) => <span key={h} data-handle={h} className={`cropper__handle cropper__handle--${h}`} />)}
                </div>
            )}
        </div>
    );
}