import { useRef } from 'react';
import { Check, ChevronRight, Download, FileText, Music2, Upload } from 'lucide-react';

const STEPS = [
    { id: 'import', num: '01', label: 'Import' },
    { id: 'recognize', num: '02', label: 'Recognize' },
    { id: 'refine', num: '03', label: 'Refine & Play' },
];

const API_LABELS = {
    checking: 'Connecting…',
    online: 'API online',
    degraded: 'Model not loaded',
    offline: 'API offline',
};

export default function Header({
    fileName,
    stage,
    apiState,
    apiError,
    canExport,
    onFile,
    onExportWav,
    onExportMidi,
}) {
    const inputRef = useRef(null);
    const activeIndex = STEPS.findIndex((s) => s.id === stage);

    const handleChange = (e) => {
        const file = e.target.files?.[0];
        if (file) onFile(file);
        e.target.value = ''; // permite volver a elegir el mismo archivo
    };

    return (
        <header className="header">
            <div className="header__left">
                <div className="brand">
                    <div className="brand__logo">
                        <Music2 size={18} />
                    </div>
                    <div>
                        <div className="brand__title">NoteVision</div>
                        <div className="brand__sub">OMR with Deep Learning</div>
                    </div>
                </div>

                <div className="doc-indicator" title={fileName ?? ''}>
                    <FileText size={14} />
                    {fileName ? (
                        <>
                            <span className="doc-indicator__name">{fileName}</span>
                            <span>·</span>
                            <span className="doc-indicator__state">
                                <span className="dot" data-state="online" />
                                Loaded
                            </span>
                        </>
                    ) : (
                        <span className="doc-indicator__name is-empty">No document</span>
                    )}
                </div>
            </div>

            <ol className="steps" aria-label="Workflow">
                {STEPS.map((s, i) => (
                    <li key={s.id} className="steps__item">
                        {i > 0 && <ChevronRight size={14} className="steps__sep" aria-hidden="true" />}
                        <span
                            className={`step ${i === activeIndex ? 'is-active' : ''} ${i < activeIndex ? 'is-done' : ''}`}
                            aria-current={i === activeIndex ? 'step' : undefined}
                        >
                            <span className="step__num">{i < activeIndex ? <Check size={12} /> : s.num}</span>
                            <span className="step__label">{s.label}</span>
                        </span>
                    </li>
                ))}
            </ol>

            <div className="header__actions">
                <span className="status-pill" title={apiError ?? ''}>
                    <span className="dot" data-state={apiState} />
                    <span className="status-pill__label">{API_LABELS[apiState]}</span>
                </span>

                <button type="button" className="btn" disabled={!canExport} onClick={onExportWav} aria-label="Export WAV">
                    <Download size={14} />
                    <span className="btn__label">Export WAV</span>
                </button>
                <button type="button" className="btn" disabled={!canExport} onClick={onExportMidi} aria-label="Export MIDI">
                    <Download size={14} />
                    <span className="btn__label">Export MIDI</span>
                </button>
                <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => inputRef.current?.click()}
                    aria-label="Upload PDF or image"
                >
                    <Upload size={14} />
                    <span className="btn__label">Upload PDF/Image</span>
                </button>
                <input ref={inputRef} type="file" accept="application/pdf,image/png,image/jpeg" hidden onChange={handleChange} />
            </div>
        </header>
    );
}