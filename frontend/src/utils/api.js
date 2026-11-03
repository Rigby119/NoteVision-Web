// Cliente HTTP del backend. Todo en memoria: se envían Blobs y se reciben JSON/base64.
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

// Extrae un mensaje legible del error devuelto por FastAPI (detail puede ser texto o lista)
async function parseError(res) {
    try {
        const body = await res.json();
        const d = body.detail;
        if (typeof d === 'string') return d;
        if (Array.isArray(d)) return d.map((e) => e.msg).join('; ');
    } catch {
        /* el cuerpo no era JSON */
    }
    return `Request failed (${res.status})`;
}

async function request(path, options) {
    let res;
    try {
        res = await fetch(`${API_URL}${path}`, options);
    } catch (err) {
        if (err.name === 'AbortError') throw err;
        throw new Error('Cannot reach the API. Is the backend running?');
    }
    if (!res.ok) throw new Error(await parseError(res));
    return res.json();
}

export const getHealth = (signal) => request('/api/health', { signal });

/** Imagen recortada (Blob PNG) -> tokens + eventos + audio base64 */
export function processSegment(blob, { bpm = 120, clef = null, signal } = {}) {
    const form = new FormData();
    form.append('file', blob, 'segment.png');
    form.append('bpm', String(bpm));
    if (clef) form.append('clef', clef);
    return request('/api/process-segment', { method: 'POST', body: form, signal });
}

/** Re-interpreta tokens ya predichos (otra clave u otro BPM) sin volver a correr el modelo */
export function renderTokens(tokens, { bpm = 120, clef = null, signal } = {}) {
    return request('/api/render-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens, bpm, clef }),
        signal,
    });
}