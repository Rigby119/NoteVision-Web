import { useEffect, useState } from 'react';
import { pdfjsLib } from './pdfjs';

const TARGET_DPI = 300; // resolución a la que se rasteriza cada página PDF
const MAX_SIDE = 6000; // lado máximo del bitmap (px)
const MAX_PIXELS = 25_000_000; // protección de memoria

// Escala deseada limitada por lado máximo y por área total
function limitScale(width, height, wanted) {
    const bySide = MAX_SIDE / Math.max(width, height);
    const byArea = Math.sqrt(MAX_PIXELS / (width * height));
    return Math.min(wanted, bySide, byArea);
}

// Fuente uniforme para el visor: { kind, numPages, renderPage(n) -> { promise, cancel } }
// renderPage resuelve con un <canvas> fuera de pantalla (o null si se canceló)
function createPdfSource(pdf) {
    return {
        kind: 'pdf',
        numPages: pdf.numPages,
        renderPage(pageNumber) {
            let cancelled = false;
            let task = null;
            const promise = (async () => {
                const page = await pdf.getPage(pageNumber);
                if (cancelled) return null;
                const base = page.getViewport({ scale: 1 });
                const scale = limitScale(base.width, base.height, TARGET_DPI / 72);
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.floor(viewport.width));
                canvas.height = Math.max(1, Math.floor(viewport.height));
                // 'white' es el color del papel, no de la interfaz
                task = page.render({ canvasContext: canvas.getContext('2d'), viewport, background: 'white' });
                await task.promise;
                page.cleanup();
                return cancelled ? null : canvas;
            })();
            return {
                promise,
                cancel() {
                    cancelled = true;
                    task?.cancel();
                },
            };
        },
    };
}

function createImageSource(img) {
    return {
        kind: 'image',
        numPages: 1,
        renderPage() {
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            const scale = limitScale(w, h, 1);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(w * scale));
            canvas.height = Math.max(1, Math.round(h * scale));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white'; // PNG con transparencia -> papel blanco
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            return { promise: Promise.resolve(canvas), cancel() { } };
        },
    };
}

function describeError(err) {
    if (err?.name === 'PasswordException') return 'This PDF is password-protected.';
    if (err?.name === 'InvalidPDFException') return 'This file is not a valid PDF.';
    return 'Could not open the file.';
}

// Carga el archivo y expone { status: idle|loading|ready|error, source, error }
export function useSourceDocument(file) {
    const [state, setState] = useState({ status: file ? 'loading' : 'idle', source: null, error: null });

    useEffect(() => {
        if (!file) {
            setState({ status: 'idle', source: null, error: null });
            return undefined;
        }
        let cancelled = false;
        let release = () => { };
        setState({ status: 'loading', source: null, error: null });

        (async () => {
            try {
                if (file.type === 'application/pdf') {
                    const data = new Uint8Array(await file.arrayBuffer());
                    if (cancelled) return;
                    const pdf = await pdfjsLib.getDocument({ data }).promise;
                    if (cancelled) {
                        pdf.destroy();
                        return;
                    }
                    release = () => pdf.destroy();
                    setState({ status: 'ready', source: createPdfSource(pdf), error: null });
                } else {
                    const url = URL.createObjectURL(file);
                    release = () => URL.revokeObjectURL(url);
                    const img = new Image();
                    img.src = url;
                    await img.decode();
                    if (cancelled) return;
                    setState({ status: 'ready', source: createImageSource(img), error: null });
                }
            } catch (err) {
                if (!cancelled) setState({ status: 'error', source: null, error: describeError(err) });
            }
        })();

        return () => {
            cancelled = true;
            release();
        };
    }, [file]);

    return state;
}