import { AlertTriangle, CheckCircle2, Clock, Lock } from 'lucide-react';
import { fmtMMK } from '../../lib/format';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';

const TONE_COLOR = {
  good: 'var(--status-good)',
  warning: 'var(--status-warning)',
  serious: 'var(--status-serious)',
  critical: 'var(--status-critical)',
};

const TONE_ICON = {
  good: CheckCircle2,
  warning: Clock,
  serious: AlertTriangle,
  critical: Lock,
};

/**
 * One severity-banded stacked bar, shared by receivables ageing and stock
 * ageing — the two "how bad is it, and how much of it" questions in the app.
 *
 * Status colours carry the severity, so each is paired with an icon and a
 * written label in the legend — never colour alone. Segments are separated by
 * a 2px gap in the surface colour rather than a stroke, so neighbouring
 * severities stay distinct without extra ink.
 *
 * @param {{key,label,range,tone,value}[]} segments  in severity order
 */
export function StackedBar({ segments, total, unit = 'K', ariaLabel }) {
  const { tip, show, move, hide } = useChartTooltip();
  const sum = total || segments.reduce((acc, s) => acc + s.value, 0);

  const withPct = segments.map((segment) => ({
    ...segment,
    pct: sum ? (segment.value / sum) * 100 : 0,
  }));
  const visible = withPct.filter((segment) => segment.value > 0);

  return (
    <div>
      <div
        className="flex h-6 w-full overflow-hidden rounded"
        style={{ background: 'var(--gridline)', gap: '2px' }}
        role="img"
        aria-label={
          ariaLabel ??
          visible.map((s) => `${s.label} ${s.range}: ${unit} ${fmtMMK(s.value)}`).join(', ')
        }
      >
        {visible.map((segment) => (
          <div
            key={segment.key}
            className="h-6 first:rounded-l last:rounded-r"
            style={{ width: `${segment.pct}%`, background: TONE_COLOR[segment.tone] }}
            onMouseEnter={(e) =>
              show(
                e,
                <div className="space-y-0.5">
                  <p className="font-medium text-ink">
                    {segment.label} · {segment.range}
                  </p>
                  <p className="text-ink-secondary">
                    {unit} {fmtMMK(segment.value)} · {segment.pct.toFixed(1)}%
                  </p>
                </div>,
              )
            }
            onMouseMove={move}
            onMouseLeave={hide}
          />
        ))}
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {withPct.map((segment) => {
          const Icon = TONE_ICON[segment.tone];
          return (
            <li key={segment.key} className="flex items-start gap-1.5">
              <Icon
                size={13}
                className="mt-0.5 shrink-0"
                style={{ color: TONE_COLOR[segment.tone] }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-2xs leading-tight text-ink-secondary">
                  {segment.label}
                  <span className="block text-ink-muted">{segment.range}</span>
                </p>
                <p className="mt-0.5 text-sm font-medium tabular-nums text-ink">
                  {unit} {fmtMMK(segment.value, { compact: true })}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <ChartTooltip tip={tip} />
    </div>
  );
}
