// Control segmentado (modo de vista, zoom; se reutiliza en el Bloque 4)
export default function Segmented({ options, value, onChange, label, className = '' }) {
    return (
        <div className={`segmented ${className}`} role="radiogroup" aria-label={label}>
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={o.value === value}
                    className="segmented__btn"
                    onClick={() => onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}