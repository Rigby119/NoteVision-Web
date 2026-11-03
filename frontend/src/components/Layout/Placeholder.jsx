// Estado vacío temporal; se reemplaza por los componentes reales en los siguientes bloques
export default function Placeholder({ icon: Icon, title, hint }) {
    return (
        <div className="placeholder">
            {Icon && (
                <div className="placeholder__icon">
                    <Icon size={20} />
                </div>
            )}
            <p className="placeholder__title">{title}</p>
            {hint && <p className="placeholder__hint">{hint}</p>}
        </div>
    );
}