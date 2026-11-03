const MAX_CROP_HEIGHT = 1024; // el modelo reescala a 128 px de alto; esto solo acota el tamaño del PNG
const THUMB_MAX_W = 320;
const THUMB_MAX_H = 96;

// Miniatura JPEG (data URL) para el historial
function makeThumbnail(canvas) {
    const s = Math.min(1, THUMB_MAX_W / canvas.width, THUMB_MAX_H / canvas.height);
    const t = document.createElement('canvas');
    t.width = Math.max(1, Math.round(canvas.width * s));
    t.height = Math.max(1, Math.round(canvas.height * s));
    const ctx = t.getContext('2d');
    ctx.fillStyle = 'white'; // color del papel: JPEG no admite transparencia
    ctx.fillRect(0, 0, t.width, t.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.8);
}

/**
 * Recorta una región (fracciones 0..1) de un canvas y la devuelve como PNG en memoria.
 * @returns {Promise<{ blob: Blob, width: number, height: number, thumb: string }>}
 */
export function cropToBlob(source, rect) {
    const sx = Math.min(source.width - 1, Math.max(0, Math.round(rect.x * source.width)));
    const sy = Math.min(source.height - 1, Math.max(0, Math.round(rect.y * source.height)));
    const sw = Math.max(1, Math.min(source.width - sx, Math.round(rect.w * source.width)));
    const sh = Math.max(1, Math.min(source.height - sy, Math.round(rect.h * source.height)));

    const scale = Math.min(1, MAX_CROP_HEIGHT / sh);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sw * scale));
    out.height = Math.max(1, Math.round(sh * scale));
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);
    const thumb = makeThumbnail(out);

    return new Promise((resolve, reject) => {
        out.toBlob(
            (blob) =>
                blob
                    ? resolve({ blob, width: out.width, height: out.height, thumb })
                    : reject(new Error('Could not extract the selected region.')),
            'image/png',
        );
    });
}