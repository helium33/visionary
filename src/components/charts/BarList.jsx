import { useLocale } from '../../context/LocaleContext';
import { fmtMMK } from '../../lib/format';
import { townshipLabel } from '../../constants/districts';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';

/**
 * Ranked horizontal bars — one series, so magnitude is the only job and the
 * sequential blue does it. No legend (a single series is named by the card
 * title); the value rides the row as a direct label, which also satisfies the
 * relief rule for the lighter steps.
 */
export function BarList({ rows, valueLabel, emptyLabel }) {
  const { t, locale } = useLocale();
  const { tip, show, move, hide } = useChartTooltip();
  const seriesLabel = valueLabel ?? t('charts.sales');
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((sum, r) => sum + r.value, 0) || 1;

  if (!rows.length) {
    return <p className="px-1 py-8 text-center text-xs text-ink-secondary">{emptyLabel ?? t('charts.noSales')}</p>;
  }

  return (
    <>
      <ul className="space-y-2.5">
        {rows.map((row, index) => {
          const pct = (row.value / max) * 100;
          return (
            <li
              key={row.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1
                rounded px-1 py-0.5 hover:bg-raised sm:grid-cols-[8rem_minmax(0,1fr)_auto] lg:grid-cols-[11rem_minmax(0,1fr)_auto]"
              onMouseEnter={(e) =>
                show(
                  e,
                  <div className="space-y-0.5">
                    <p className="font-medium text-ink">{row.label ?? row.key}</p>
                    {row.township ? <p className="text-ink-secondary">{townshipLabel(row.township, locale)}</p> : null}
                    <p className="text-ink-secondary">
                      K {fmtMMK(row.value)} ·{' '}
                      {t(row.count === 1 ? 'charts.voucherOne' : 'charts.voucherMany', { count: row.count })}
                    </p>
                    <p className="text-ink-muted">
                      {t('charts.shareOf', {
                        pct: ((row.value / total) * 100).toFixed(1),
                        label: seriesLabel.toLowerCase(),
                      })}
                    </p>
                  </div>,
                )
              }
              onMouseMove={move}
              onMouseLeave={hide}
            >
              <span className="col-span-2 truncate text-xs text-ink sm:col-span-1" title={row.label ?? row.key}>
                <span className="mr-1.5 text-ink-muted tnum">{index + 1}.</span>
                {row.label ?? row.key}
              </span>

              {/* Bar: capped at 14px, square at the baseline, 4px rounded data-end. */}
              <span className="h-3.5 w-full min-w-0 rounded-sm bg-[var(--gridline)]">
                <span
                  className="block h-3.5 rounded-l-sm rounded-r"
                  style={{
                    width: `${Math.max(pct, 1.5)}%`,
                    background: index === 0 ? 'var(--seq-450)' : 'var(--seq-350)',
                  }}
                />
              </span>

              <span className="justify-self-end text-xs font-medium tabular-nums text-ink">
                {fmtMMK(row.value, { compact: true })}
              </span>
            </li>
          );
        })}
      </ul>
      <ChartTooltip tip={tip} />
    </>
  );
}
