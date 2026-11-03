import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ScanSearch } from 'lucide-react';
import PdfRenderer from './PdfRenderer.jsx';
import RegionCropper from './RegionCropper.jsx';
import Segmented from '../Layout/Segmented.jsx';
import { useSourceDocument } from '../../utils/useSourceDocument.js';
import { cropToBlob } from '../../utils/cropCanvas.js';

const GUTTER = 16; // margen alrededor de la página (px)
const EPS = 1e-6;
const MODES = [
    { value: 'full', label: 'Full Image' },
    { value: 'select', label: 'Select Region' },
];
const ZOOMS = [
    { value: 1, label: '1x' },
    { value: 2, label: '2x' },
    { value: 4, label: '4x' },
];

const sameRegion = (a, b) =>
    Boolean(a) && Boolean(b) && a.page === b.page && ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < EPS);

/**
 * Visor del documento + selector de región.
 * region: última región enviada { page, x, y, w, h } | null (fracciones 0..1).
 * La selección en pantalla es local: solo se envía al pulsar "Recognize".
 * onRecognize({ blob, thumb, page, rect }) se llama con el recorte ya extraído.
 */
export default function DocumentViewer({ file, region, regionLabel, onRecognize }) {
    const { status, source, error } = useSourceDocument(file);

    const [page, setPage] = useState(1);
    const [zoom, setZoom] = useState(1);
    const [mode, setMode] = useState('select');
    const [rendered, setRendered] = useState(null); // { page, width, height } del bitmap mostrado
    const [renderError, setRenderError] = useState(null);
    const [cropError, setCropError] = useState(null);
    const [selection, setSelection] = useState(null); // caja en edición { page, x, y, w, h }
    const [cropping, setCropping] = useState(false); // extrayendo el recorte
    const [boxWidth, setBoxWidth] = useState(0); // ancho útil del área de scroll

    const canvasRef = useRef(null);
    const scrollRef = useRef(null);
    const pageRef = useRef(null);
    const anchorRef = useRef(null);
    const selectionRef = useRef(null);
    const focusRef = useRef(false); // true tras restaurar una región desde el historial
    const actionsRef = useRef({});

    useEffect(() => {
        selectionRef.current = selection;
    });

    // Ancho disponible: el zoom 1x equivale a "ajustar al ancho"
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return undefined;
        const ro = new ResizeObserver(([entry]) => setBoxWidth(Math.floor(entry.contentRect.width)));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // La región enviada manda sobre la selección: al cambiarla (envío o restauración del historial)
    // la caja se sincroniza. Si difiere de lo que había en pantalla, es una restauración: se enfoca.
    useEffect(() => {
        if (region && !sameRegion(region, selectionRef.current)) focusRef.current = true;
        setSelection(region);
        if (region) setPage(region.page);
    }, [region]);

    const handleRendered = (p, size) => {
        setRendered({ page: p, ...size });
        setRenderError(null);
    };
    const handleRenderError = (err) => {
        console.error(err);
        setRenderError('Could not render this page.');
    };

    const isCurrent = rendered?.page === page;
    const visibleRegion = selection && selection.page === page && isCurrent ? selection : null;
    const dirty = Boolean(selection) && !sameRegion(selection, region);
    const canRecognize = Boolean(visibleRegion) && dirty && !cropping;

    // Al restaurar una región, desplaza la vista hasta ella cuando la página ya está dibujada
    useEffect(() => {
        if (!focusRef.current || !region || !rendered) return;
        if (rendered.page !== region.page || page !== region.page) return;
        const sc = scrollRef.current;
        const pg = pageRef.current;
        if (!sc || !pg || !pg.offsetWidth) return;
        focusRef.current = false;
        sc.scrollTo({
            left: pg.offsetLeft + (region.x + region.w / 2) * pg.offsetWidth - sc.clientWidth / 2,
            top: pg.offsetTop + (region.y + region.h / 2) * pg.offsetHeight - sc.clientHeight / 2,
        });
    }, [region, rendered, page]);

    // Zoom que conserva el punto de interés (la región, o el centro de la vista)
    const changeZoom = (next) => {
        if (next === zoom) return;
        const sc = scrollRef.current;
        const pg = pageRef.current;
        if (sc && pg && pg.offsetWidth > 0 && pg.offsetHeight > 0) {
            anchorRef.current = visibleRegion
                ? { fx: visibleRegion.x + visibleRegion.w / 2, fy: visibleRegion.y + visibleRegion.h / 2 }
                : {
                    fx: (sc.scrollLeft + sc.clientWidth / 2 - pg.offsetLeft) / pg.offsetWidth,
                    fy: (sc.scrollTop + sc.clientHeight / 2 - pg.offsetTop) / pg.offsetHeight,
                };
        }
        setZoom(next);
    };

    useLayoutEffect(() => {
        const a = anchorRef.current;
        const sc = scrollRef.current;
        const pg = pageRef.current;
        if (!a || !sc || !pg) return;
        anchorRef.current = null;
        sc.scrollLeft = pg.offsetLeft + a.fx * pg.offsetWidth - sc.clientWidth / 2;
        sc.scrollTop = pg.offsetTop + a.fy * pg.offsetHeight - sc.clientHeight / 2;
    }, [zoom]);

    const goToPage = (p) => {
        setPage(p);
        setCropError(null);
        scrollRef.current?.scrollTo({ top: 0, left: 0 });
    };

    // Al soltar el ratón solo se guarda la selección (no se envía nada)
    const handleSelect = (rect) => {
        setCropError(null);
        setSelection({ page, ...rect });
    };

    const cancelSelection = () => {
        if (dirty) setSelection(region);
    };

    // Confirmación: recorte en memoria (canvas -> Blob) y envío al padre
    const handleRecognize = async () => {
        if (!canRecognize) return;
        const { page: p, ...rect } = visibleRegion;
        setCropError(null);
        setCropping(true);
        try {
            const crop = await cropToBlob(canvasRef.current, rect);
            onRecognize({ blob: crop.blob, thumb: crop.thumb, page: p, rect });
        } catch (err) {
            setCropError(err.message);
        } finally {
            setCropping(false);
        }
    };

    // Atajos: Enter = reconocer, Esc = descartar cambios (se ignoran si el foco está en un control)
    useEffect(() => {
        actionsRef.current = { recognize: handleRecognize, cancel: cancelSelection };
    });
    useEffect(() => {
        const onKey = (e) => {
            if (e.repeat || (e.key !== 'Enter' && e.key !== 'Escape')) return;
            if (e.target.closest?.('input, select, textarea, button, [contenteditable="true"]')) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                actionsRef.current.recognize?.();
            } else {
                actionsRef.current.cancel?.();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    let actionText = 'Drag over a single staff system to select it.';
    if (visibleRegion) {
        actionText = dirty
            ? 'Adjust the box if needed, then press Recognize.'
            : 'Region recognized. Drag again to select another.';
    }

    return (
        <div className="viewer">
            <div className="viewer__toolbar">
                <Segmented label="View mode" options={MODES} value={mode} onChange={setMode} />
                <Segmented label="Zoom" className="segmented--mono" options={ZOOMS} value={zoom} onChange={changeZoom} />
            </div>

            {status === 'ready' && mode === 'select' && (
                <div className="viewer__actions" data-dirty={dirty}>
                    <span className="viewer__actions-text">{actionText}</span>
                    {dirty && (
                        <button type="button" className="btn" onClick={cancelSelection} title="Discard changes (Esc)">
                            Cancel
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn--primary"
                        disabled={!canRecognize}
                        onClick={handleRecognize}
                        title="Recognize selection (Enter)"
                    >
                        <ScanSearch size={14} />
                        <span>Recognize</span>
                    </button>
                </div>
            )}

            {cropError && <p className="viewer__hint viewer__hint--error">{cropError}</p>}

            <div ref={scrollRef} className="viewer__scroll" style={{ padding: GUTTER }}>
                {status === 'loading' && <p className="viewer__msg">Loading document…</p>}
                {status === 'error' && <p className="viewer__msg viewer__msg--error">{error}</p>}
                {renderError && <p className="viewer__msg viewer__msg--error">{renderError}</p>}

                {status === 'ready' && (
                    <div
                        ref={pageRef}
                        className="viewer__page"
                        data-ready={Boolean(rendered)}
                        data-busy={!isCurrent}
                        style={{ width: boxWidth * zoom }}
                    >
                        <PdfRenderer
                            source={source}
                            pageNumber={page}
                            canvasRef={canvasRef}
                            onRendered={handleRendered}
                            onError={handleRenderError}
                        />
                        {isCurrent && (
                            <RegionCropper
                                value={visibleRegion}
                                enabled={mode === 'select'}
                                label={dirty ? 'Selection' : regionLabel}
                                onCommit={handleSelect}
                            />
                        )}
                    </div>
                )}
            </div>

            {status === 'ready' && (
                <div className="viewer__footer">
                    <div className="viewer__pager">
                        <button
                            type="button"
                            className="icon-btn"
                            disabled={page <= 1}
                            onClick={() => goToPage(page - 1)}
                            aria-label="Previous page"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="mono">
                            {page} / {source.numPages}
                        </span>
                        <button
                            type="button"
                            className="icon-btn"
                            disabled={page >= source.numPages}
                            onClick={() => goToPage(page + 1)}
                            aria-label="Next page"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                    {rendered && (
                        <span className="viewer__resolution">
                            {rendered.width} × {rendered.height} px
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}