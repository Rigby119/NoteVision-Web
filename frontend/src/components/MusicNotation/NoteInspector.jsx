import { describeDuration } from '../../utils/primusParser.js';

// Tooltip con los parámetros de la nota bajo el cursor. x, y: posición dentro del contenedor.
export default function NoteInspector({ event, x, y, containerWidth }) {
    const isRest = event.type === 'rest';
    const left = Math.max(4, Math.min(x + 14, containerWidth - 196));

    return (
        <div className="note-tip" style={{ left, top: y + 16 }} role="tooltip">
            <div className="note-tip__name mono">{isRest ? 'Rest' : event.pitch}</div>
            {!isRest && (
                <div className="note-tip__row mono">
                    <span>Frequency</span>
                    <span>{event.freq.toFixed(2)} Hz</span>
                </div>
            )}
            <div className="note-tip__row mono">
                <span>Duration</span>
                <span>{describeDuration(event)}</span>
            </div>
            <div className="note-tip__row mono">
                <span>Position</span>
                <span>
                    Bar {event.measure + 1} · {event.start.toFixed(2)} s
                </span>
            </div>
        </div>
    );
}