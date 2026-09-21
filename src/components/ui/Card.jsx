export function Card({ className = '', children, ...rest }) {
  return (
    <section className={`card ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, action, icon: Icon }) {
  return (
    <header
      className="flex flex-col gap-2 border-b border-line-hair px-4 py-3
        sm:flex-row sm:items-start sm:justify-between sm:gap-3"
    >
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          {Icon ? <Icon size={15} className="shrink-0 text-ink-muted" aria-hidden="true" /> : null}
          <span className="truncate">{title}</span>
        </h2>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-secondary">{subtitle}</p> : null}
      </div>
      {action ? <div className="sm:shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({ className = '', children }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}
