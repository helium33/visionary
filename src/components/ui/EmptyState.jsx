export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {Icon ? <Icon size={24} className="text-ink-muted" aria-hidden="true" /> : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="max-w-sm text-xs text-ink-secondary">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="space-y-2 p-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded bg-raised" />
      ))}
    </div>
  );
}
