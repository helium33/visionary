import { fmtMMK } from '../../lib/format';

/**
 * Stat tile contract: label (sentence case) · value · optional delta/footnote.
 * Large standalone numbers keep the font's proportional figures — tabular-nums
 * is reserved for columns that must align vertically.
 */
export function StatTile({
  label,
  value,
  unit = 'K',
  compact = true,
  footnote,
  tone = 'neutral',
  icon: Icon,
  hero = false,
  raw = false,
}) {
  const accent = {
    neutral: 'text-ink',
    good: 'text-status-good',
    serious: 'text-ink',
    critical: 'text-status-critical',
  }[tone];

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink-secondary">{label}</p>
        {Icon ? <Icon size={15} className="text-ink-muted" aria-hidden="true" /> : null}
      </div>
      <p
        className={`mt-2 font-semibold tracking-tight ${accent} ${hero ? 'text-[42px] leading-none' : 'text-2xl leading-tight'}`}
      >
        {unit ? <span className="mr-1 text-base font-medium text-ink-muted">{unit}</span> : null}
        {raw ? value : fmtMMK(value, { compact })}
      </p>
      {footnote ? <p className="mt-1.5 text-xs text-ink-secondary">{footnote}</p> : null}
    </div>
  );
}
