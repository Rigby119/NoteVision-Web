import * as pdfjsLib from 'pdfjs-dist';
// Vite entrega la URL del worker como asset (pdf.js lo ejecuta en un hilo aparte)
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };