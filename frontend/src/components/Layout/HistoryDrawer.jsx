const pad = (n) => String(n).padStart(2, '0');

// Galería horizontal de recortes procesados en la sesión. Clic = restaurar su predicción.
export default function HistoryDrawer({ items, activeId, currentSourceId, onSelect }) {
    return (
        <ul className="history" aria-label="Recognized regions">
            {items.map((item) => (
                <li key={item.id}>
                    <button
                        type="button"
                        className="history__item"
                        aria-current={item.id === activeId}
                        data-foreign={item.sourceId !== currentSourceId}
                        title={`${item.fileName ?? 'Document'} · page ${item.page}${item.sourceId !== currentSourceId ? ' (another document)' : ''
                            }`}
                        onClick={() => onSelect(item)}
                    >
                        <span className="history__thumb">
                            <img src={item.thumb} alt="" draggable={false} />
                        </span>
                        <span className="history__meta mono">
                            <span>Region {pad(item.number)}</span>
                            <span>{item.time}</span>
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    );
}