// Base64 (data URI) -> Blob, sin red ni disco
export function dataUriToBlob(uri) {
    const mime = /^data:([^;,]+)/.exec(uri)?.[1] ?? 'audio/wav';
    const bin = atob(uri.slice(uri.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

// Descarga un Blob generado en memoria
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 00:04.80
export function formatClock(sec) {
    const cs = Math.floor(Math.max(0, sec) * 100);
    const m = Math.floor(cs / 6000);
    const s = Math.floor((cs % 6000) / 100);
    const c = cs % 100;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

// Vista previa de una tecla del piano (mismos armónicos que el sintetizador del backend)
let audioCtx = null;
export function playPreview(midi, gain = 0.5) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || gain <= 0) return;
    audioCtx ??= new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    const freq = 440 * 2 ** ((midi - 69) / 12);
    const out = audioCtx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(0.35 * gain, t0 + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
    out.connect(audioCtx.destination);
    [[1, 1], [2, 0.35], [3, 0.12]].forEach(([k, amp]) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.frequency.value = freq * k;
        g.gain.value = amp;
        osc.connect(g).connect(out);
        osc.start(t0);
        osc.stop(t0 + 0.95);
    });
}