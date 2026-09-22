import { useLocale } from '../../context/LocaleContext';
import { CREDIT_TERM_DAYS } from '../../domain/credit';

const FILL = {
  good: 'var(--status-good)',
  warning: 'var(--status-warning)',
  serious: 'var(--status-serious)',
  critical: 'var(--status-critical)',
};

/**
 * How far through the 14-day term the oldest open voucher is.
 *
 * The fill carries severity and the track stays a neutral step, so the state
 * reads across the whole bar. The number beside it is the real accessibility
 * channel — the meter is the glanceable supplement, never the only signal.
 */
export function DueMeter({ aging, termDays = CREDIT_TERM_DAYS, showLabel = true }) {
  const { t } = useLocale();
  if (!aging) {
    return <span className="text-xs text-ink-muted">—</span>;
  }

  const elapsed = Math.min(aging.daysOutstanding, termDays);
  const pct = Math.min(100, (elapsed / termDays) * 100);
  const tone = aging.isOverdue
    ? aging.daysOverdue >= 8
      ? 'critical'
      : 'serious'
    : aging.isApproaching
      ? 'warning'
      : 'good';

  const label = aging.isOverdue
    ? t('credit.meterOver', { n: aging.daysOverdue })
    : aging.daysUntilDue === 0
      ? t('credit.meterDueToday')
      : t('credit.meterLeft', { n: aging.daysUntilDue });

  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-16 shrink-0 rounded-full"
        style={{ background: 'var(--gridline)' }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={termDays}
        aria-valuenow={elapsed}
        aria-label={t('credit.meterAria', { day: elapsed, term: termDays })}
      >
        <div
          className="h-1.5 rounded-full"
          style={{ width: `${aging.isOverdue ? 100 : Math.max(pct, 4)}%`, background: FILL[tone] }}
        />
      </div>
      {showLabel ? (
        <span
          className="whitespace-nowrap text-2xs tabular-nums"
          style={{ color: aging.isOverdue ? FILL[tone] : 'var(--text-secondary)' }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
