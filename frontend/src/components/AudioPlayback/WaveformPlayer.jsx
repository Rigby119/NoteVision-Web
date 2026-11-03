import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Minus, Pause, Play, Plus, Repeat, Square, Volume2 } from 'lucide-react';
import { dataUriToBlob, formatClock } from '../../utils/audioUtils.js';
import { useTime } from '../../utils/usePlayerStore.js';

const MIN_BPM = 20;
const MAX_BPM = 300;
const MIN_DB = -48; // en el mínimo se silencia
const clampBpm = (v) => Math.min(MAX_BPM, Math.max(MIN_BPM, v));
const dbToGain = (db) => (db <= MIN_DB ? 0 : 10 ** (db / 20));
// Los colores de la onda salen de theme.css (Wavesurfer los necesita como valores, no como var())
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const pad = (n, len) => String(n).padStart(len, '0');

/** Onda de audio + transporte. El tiempo se publica en `store` (lo leen el piano y la notación). */
export default function WaveformPlayer({ store, result, busy, bpm, onBpmChange }) {
    const waveRef = useRef(null);
    const wsRef = useRef(null);
    const timerRef = useRef(null);
    const toggleRef = useRef(() => { });

    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [loop, setLoop] = useState(false);
    const [volumeDb, setVolumeDb] = useState(-6);
    const [draft, setDraft] = useState(String(bpm));
    const [loadError, setLoadError] = useState(null);

    const time = useTime(store);
    const audio = result?.audio_b64 ?? null;
    const hasAudio = Boolean(audio);

    // Compás : pulso : tick (el tick es 1/100 de pulso)
    const sig = result?.metadata.time_signature ?? { beats: 4, beat_type: 4 };
    const tempo = result?.metadata.bpm ?? bpm;
    const units = ((time * tempo) / 60) * (sig.beat_type / 4);
    const per = Math.max(1, sig.beats);
    const bbt = `${pad(Math.floor(units / per) + 1, 3)}.${pad(Math.floor(units % per) + 1, 2)}.${pad(Math.floor((units % 1) * 100), 2)}`;

    // Crear Wavesurfer una sola vez
    useEffect(() => {
        const ws = WaveSurfer.create({
            container: waveRef.current,
            height: 64,
            waveColor: cssVar('--text-dim'),
            progressColor: cssVar('--accent-primary'),
            cursorColor: cssVar('--text-primary'),
            cursorWidth: 1,
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            normalize: true,
        });
        wsRef.current = ws;
        ws.on('ready', (d) => setDuration(d));
        ws.on('play', () => setPlaying(true));
        ws.on('pause', () => setPlaying(false));
        ws.on('finish', () => setPlaying(false));
        ws.on('timeupdate', (t) => store.set(t));
        ws.on('seeking', (t) => store.set(t));
        store.setSeeker((t) => ws.setTime(t)); // lo usa el piano roll para saltar
        return () => {
            store.setSeeker(null);
            ws.destroy();
            wsRef.current = null;
        };
    }, [store]);

    // Cargar el audio cuando llega uno nuevo (todo en memoria: base64 -> Blob)
    useEffect(() => {
        const ws = wsRef.current;
        if (!ws) return undefined;
        let cancelled = false;
        setPlaying(false);
        setDuration(0);
        setLoadError(null);
        store.set(0);
        if (!audio) {
            ws.empty();
            return undefined;
        }
        try {
            ws.loadBlob(dataUriToBlob(audio)).catch(() => {
                if (!cancelled) setLoadError('Could not load the audio.');
            });
        } catch {
            setLoadError('Could not load the audio.');
        }
        return () => {
            cancelled = true;
        };
    }, [audio, store]);

    useEffect(() => {
        const gain = dbToGain(volumeDb);
        wsRef.current?.setVolume(gain);
        store.setGain(gain);
    }, [volumeDb, store]);

    useEffect(() => {
        const el = wsRef.current?.getMediaElement?.();
        if (el) el.loop = loop;
    }, [loop, audio]);

    useEffect(() => setDraft(String(bpm)), [bpm]);
    useEffect(() => () => clearTimeout(timerRef.current), []);

    const togglePlay = () => {
        const ws = wsRef.current;
        if (!ws || !hasAudio) return;
        if (ws.isPlaying()) {
            ws.pause();
            return;
        }
        if (duration && store.get() >= duration - 0.05) ws.setTime(0); // terminó: empezar de nuevo
        ws.play().catch(() => { });
    };
    const stop = () => {
        const ws = wsRef.current;
        if (!ws) return;
        ws.pause();
        ws.setTime(0);
        store.set(0);
    };

    // Barra espaciadora = play/pause (salvo que el foco esté en un control)
    useEffect(() => {
        toggleRef.current = togglePlay;
    });
    useEffect(() => {
        const onKey = (e) => {
            if (e.code !== 'Space' || e.repeat) return;
            if (e.target.closest?.('input, select, textarea, button, [contenteditable="true"]')) return;
            e.preventDefault();
            toggleRef.current();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const commitBpm = (raw) => {
        clearTimeout(timerRef.current);
        const v = raw === '' ? NaN : Math.round(Number(raw));
        if (!Number.isFinite(v)) {
            setDraft(String(bpm));
            return;
        }
        const next = clampBpm(v);
        setDraft(String(next));
        if (next !== bpm) onBpmChange(next);
    };
    const nudge = (delta) => {
        const next = clampBpm((Math.round(Number(draft)) || bpm) + delta);
        setDraft(String(next));
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => commitBpm(next), 450); // agrupa varios clics
    };

    const bpmDisabled = !hasAudio || busy;
    const dbLabel = volumeDb <= MIN_DB ? '-∞ dB' : `${volumeDb.toFixed(1)} dB`;

    return (
        <>
            <div className="transport">
                <div className="transport__group">
                    <button type="button" className="icon-btn" onClick={stop} disabled={!hasAudio} aria-label="Stop" title="Stop">
                        <Square size={16} />
                    </button>
                    <button
                        type="button"
                        className="transport__play"
                        onClick={togglePlay}
                        disabled={!hasAudio}
                        aria-label={playing ? 'Pause' : 'Play'}
                        title={playing ? 'Pause (Space)' : 'Play (Space)'}
                    >
                        {playing ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                    <button
                        type="button"
                        className="icon-btn transport__loop"
                        data-on={loop}
                        aria-pressed={loop}
                        onClick={() => setLoop((l) => !l)}
                        aria-label="Loop"
                        title="Loop"
                    >
                        <Repeat size={16} />
                    </button>
                </div>

                <div className="clock" aria-label="Elapsed time">
                    <div className="clock__time mono">
                        {formatClock(time)}
                        {duration > 0 && <span className="clock__total"> / {formatClock(duration)}</span>}
                    </div>
                    <div className="clock__sub mono">
                        {bbt} <span>BAR · BEAT · TICK</span>
                    </div>
                </div>

                <div className="transport__field">
                    <span className="field__label">Tempo</span>
                    <button type="button" className="icon-btn" disabled={bpmDisabled} onClick={() => nudge(-1)} aria-label="Decrease tempo">
                        <Minus size={14} />
                    </button>
                    <input
                        className="bpm-input mono"
                        type="number"
                        min={MIN_BPM}
                        max={MAX_BPM}
                        value={draft}
                        disabled={bpmDisabled}
                        aria-label="Tempo in beats per minute"
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={(e) => commitBpm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                    <span className="mono transport__unit">bpm</span>
                    <button type="button" className="icon-btn" disabled={bpmDisabled} onClick={() => nudge(1)} aria-label="Increase tempo">
                        <Plus size={14} />
                    </button>
                </div>

                <div className="transport__field">
                    <span className="field__label">Time</span>
                    <span className="mono transport__value">
                        {sig.beats}/{sig.beat_type}
                    </span>
                </div>

                <label className="transport__field transport__volume">
                    <Volume2 size={16} aria-hidden="true" />
                    <input
                        className="volume"
                        type="range"
                        min={MIN_DB}
                        max={0}
                        step={0.5}
                        value={volumeDb}
                        aria-label="Volume"
                        onChange={(e) => setVolumeDb(Number(e.target.value))}
                    />
                    <span className="mono transport__value">{dbLabel}</span>
                </label>
            </div>

            <div className="wave" data-busy={busy}>
                <div ref={waveRef} className="wave__canvas" />
                {(!hasAudio || loadError) && (
                    <p className="wave__empty">{loadError ?? 'Recognize a region to see its waveform.'}</p>
                )}
            </div>
        </>
    );
}