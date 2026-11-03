import { RotateCcw } from 'lucide-react';

const CLEFS = [
    ['G-L2', 'Treble (G-L2)'],
    ['F-L4', 'Bass (F-L4)'],
    ['C-L3', 'Alto (C-L3)'],
    ['C-L4', 'Tenor (C-L4)'],
];

// Corrección manual de la clave + volver a lo predicho
export default function ClefSelect({ override, detected, disabled, onChange, onRevert }) {
    return (
        <>
            <label className="field">
                <span className="field__label">Clef</span>
                <select
                    className="select"
                    value={override ?? 'auto'}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value === 'auto' ? null : e.target.value)}
                >
                    <option value="auto">{detected ? `Auto (${detected})` : 'Auto (G-L2, assumed)'}</option>
                    {CLEFS.map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
            </label>
            <button
                type="button"
                className="btn"
                disabled={disabled || override === null}
                onClick={onRevert}
                title="Revert to prediction"
                aria-label="Revert to prediction"
            >
                <RotateCcw size={14} />
                <span className="btn__label">Revert to prediction</span>
            </button>
        </>
    );
}