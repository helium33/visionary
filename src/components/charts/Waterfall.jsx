import { useMemo } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { fmtMMK } from '../../lib/format';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';

/**
 * The profit bridge: where revenue went.
 *
 * Laid out HORIZONTALLY because the step labels are phrases ("Salaries &
 * commission"), and phrases under vertical columns either wrap into unreadable
 * stacks or get rotated. Running left to right down the page also matches how
 * a profit and loss statement is read.
 *
 * Colour encodes polarity, not severity, so it uses the diverging pair rather
 * than the reserved status colours — and because colour alone never carries
 * meaning, every bar is directly labelled with its signed value and the legend
 * names both directions.
 *
 * The scale includes zero and any negative running total, so a loss-making
 * period draws correctly instead of collapsing to nothing.
 */
export function Waterfall({ steps, height = 22 }) {
  const { t } = useLocale();
  const { tip, show, move, hide } = useChartTooltip();

  const { rows, zeroPct, hasNegative } = useMemo(() => {
    let running = 0;
    const spans = steps.map((step) => {
      if (step.type === 'total' || step.type === 'subtotal') {
        // Totals and subtotals are drawn from zero: they are a position, not a
        // movement. A total also resets the running figure; a subtotal only
        // reports where the running figure already is.
        const end = step.type === 'total' ? step.value : running;
        if (step.type === 'total') running = end;
        return { ...step, start: 0, end };
      }
      const start = running;
      running += step.value; // decreases arrive already signed
      return { ...step, start, end: running };
    });

    const bounds = spans.flatMap((span) => [span.start, span.end]).concat(0);
    const min = Math.min(...bounds);
    const max = Math.max(...bounds);
    const range = max - min || 1;
    const pct = (value) => ((value - min) / range) * 100;

    return {
      rows: spans.map((span) => {
        const lo = Math.min(span.start, span.end);
        const hi = Math.max(span.start, span.end);
        return { ...span, leftPct: pct(lo), widthPct: Math.max(pct(hi) - pct(lo), 0.6) };
      }),
      zeroPct: pct(0),
      hasNegative: min < 0,
    };
  }, [steps]);

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary">
        <Key color="var(--diverge-pos)" label={t('charts.revenueResult')} />
        <Key color="var(--diverge-neg)" label={t('charts.deducted')} />
      </ul>

      <ul className="space-y-1.5">
        {rows.map((row) => {
          const negative = row.value < 0;
          const isResult = row.type === 'total' || row.type === 'subtotal';
          const color = negative ? 'var(--diverge-neg)' : 'var(--diverge-pos)';

          return (
            <li
              key={row.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1
                rounded px-1 py-0.5 hover:bg-raised sm:grid-cols-[9.5rem_minmax(0,1fr)_auto]"
              onMouseEnter={(e) =>
                show(
                  e,
                  <div className="space-y-0.5">
                    <p className="font-medium text-ink">{row.label}</p>
                    <p className="text-ink-secondary">
                      {negative ? '−' : ''}K {fmtMMK(Math.abs(row.value))}
                    </p>
                    {!isResult ? (
                      <p className="text-ink-muted">{t('charts.runningTotal', { amount: fmtMMK(row.end) })}</p>
                    ) : null}
                  </div>,
                )
              }
              onMouseMove={move}
              onMouseLeave={hide}
            >
              <span
                className={`col-span-2 truncate text-xs sm:col-span-1 ${
                  isResult ? 'font-medium text-ink' : 'text-ink-secondary'
                }`}
              >
                {row.label}
              </span>

              <span
                className="relative block w-full min-w-0 rounded-sm"
                style={{ height, background: 'var(--gridline)' }}
              >
                {hasNegative ? (
                  <span
                    className="absolute inset-y-0 w-px"
                    style={{ left: `${zeroPct}%`, background: 'var(--baseline)' }}
                    aria-hidden="true"
                  />
                ) : null}
                <span
                  className="absolute inset-y-0 rounded"
                  style={{
                    left: `${row.leftPct}%`,
                    width: `${row.widthPct}%`,
                    background: color,
                    opacity: isResult ? 1 : 0.85,
                  }}
                />
              </span>

              <span
                className="justify-self-end text-xs font-medium tabular-nums"
                style={{ color: isResult ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              >
                {negative ? '−' : ''}
                {fmtMMK(Math.abs(row.value), { compact: true })}
              </span>
            </li>
          );
        })}
      </ul>

      <ChartTooltip tip={tip} />
    </div>
  );
}

function Key({ color, label }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />
      {label}
    </li>
  );
}
