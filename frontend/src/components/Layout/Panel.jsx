// Contenedor base de todos los paneles (cabecera con título, badge y acciones)
export default function Panel({ title, badge, actions, className = '', bodyClassName = '', children, ...rest }) {
    return (
        <section className={`panel ${className}`} {...rest}>
            <header className="panel__header">
                <div className="panel__heading">
                    <h2 className="panel__title">{title}</h2>
                    {badge && <span className="badge">{badge}</span>}
                </div>
                {actions && <div className="panel__actions">{actions}</div>}
            </header>
            <div className={`panel__body ${bodyClassName}`}>{children}</div>
        </section>
    );
}