import { AlertTriangle, Music } from 'lucide-react';
import Placeholder from '../Layout/Placeholder.jsx';
import VexflowViewer from './VexflowViewer.jsx';
import PianoRoll from './PianoRoll.jsx';

export default function RecognitionStatus({ status, error, result, rendering, renderError, view, store, onHoverNote, onRetry }) {
    if (status === 'processing') {
        return (
            <div className="placeholder" role="status" aria-live="polite">
                <span className="spinner" aria-hidden="true" />
                <p className="placeholder__title">Recognizing…</p>
                <div className="progress" aria-hidden="true">
                    <div className="progress__bar" />
                </div>
                <p className="placeholder__hint">Running the model on the selected region.</p>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="placeholder" role="alert">
                <div className="placeholder__icon placeholder__icon--danger">
                    <AlertTriangle size={20} />
                </div>
                <p className="placeholder__title">Recognition failed</p>
                <p className="placeholder__hint">{error}</p>
                <button type="button" className="btn" onClick={onRetry}>
                    Retry
                </button>
            </div>
        );
    }

    if (status === 'done' && result) {
        const m = result.metadata;
        return (
            <div className="result" data-busy={rendering}>
                <div className="result__meta">
                    <span className="badge badge--accent">
                        Clef {m.clef_used}
                        {m.clef_status === 'assumed' ? ' (assumed)' : m.clef_status === 'override' ? ' (manual)' : ''}
                    </span>
                    <span className="badge">
                        {m.time_signature.beats}/{m.time_signature.beat_type}
                        {m.time_signature.source === 'default' ? ' (default)' : ''}
                    </span>
                    <span className="badge" title="Major key assumed; the relative minor has the same key signature">
                        {m.key_signature.name ? `${m.key_signature.name} MAJ` : 'Key —'}
                    </span>
                    <span className="badge">{m.note_count} notes</span>
                    <span className="badge">{m.measure_count} bars</span>
                    {m.unrecognized_tokens.length > 0 && <span className="badge">{m.unrecognized_tokens.length} unrecognized</span>}
                </div>

                {renderError && <p className="result__warning result__warning--error">{renderError}</p>}
                {m.warnings.map((w) => (
                    <p key={w} className="result__warning">
                        {w}
                    </p>
                ))}

                {view === 'roll' ? (
                    <PianoRoll result={result} store={store} onHoverNote={onHoverNote} />
                ) : (
                    <VexflowViewer result={result} store={store} onHoverNote={onHoverNote} />
                )}

                <details className="result__details">
                    <summary>Predicted tokens ({result.raw_tokens.length})</summary>
                    <pre className="result__tokens mono">{result.raw_tokens.join(' ')}</pre>
                </details>
            </div>
        );
    }

    return (
        <Placeholder
            icon={Music}
            title="Notation will appear here"
            hint="Select a region of the score to run the recognition model."
        />
    );
}