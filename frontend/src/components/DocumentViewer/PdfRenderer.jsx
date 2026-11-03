import { useEffect, useRef } from 'react';

// Dibuja una página de la fuente (PDF o imagen) en un <canvas> visible.
// Renderiza fuera de pantalla y copia al terminar: así no hay parpadeo ni dos render() sobre el mismo canvas.
export default function PdfRenderer({ source, pageNumber, canvasRef, onRendered, onError }) {
    const callbacks = useRef({ onRendered, onError });
    useEffect(() => {
        callbacks.current = { onRendered, onError };
    });

    useEffect(() => {
        let active = true;
        const job = source.renderPage(pageNumber);

        job.promise
            .then((bitmap) => {
                const canvas = canvasRef.current;
                if (!active || !bitmap || !canvas) return;
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                canvas.getContext('2d').drawImage(bitmap, 0, 0);
                const size = { width: bitmap.width, height: bitmap.height };
                bitmap.width = 0; // libera la memoria del canvas auxiliar
                callbacks.current.onRendered(pageNumber, size);
            })
            .catch((err) => {
                if (active) callbacks.current.onError(err); // las cancelaciones se ignoran
            });

        return () => {
            active = false;
            job.cancel();
        };
    }, [source, pageNumber, canvasRef]);

    return <canvas ref={canvasRef} className="viewer__canvas" />;
}