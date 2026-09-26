import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  axisTickStyle,
  BAR_MAX_SIZE,
  CHART_COLORS,
  gridProps,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from '../charts/rechartsTheme';
import { useLocale } from '../../context/LocaleContext';
import { fmtMMK } from '../../lib/format';

/**
 * Collected vs outstanding — a two-slice donut.
 *
 * A pie chart is usually the wrong form (the dataviz guidance this app
 * follows treats many-slice pies as an anti-pattern), but a 2-way
 * part-of-whole split is the one case a pie reads correctly at a glance, and
 * it is what was explicitly asked for. Both slices are direct-labelled with
 * their amount and share, so nothing depends on reading the legend to know
 * which colour is which.
 */
export function CollectedVsOutstandingChart({ collected, outstanding }) {
  const { t } = useLocale();
  const total = collected + outstanding;

  // `name` here is a STABLE identity ('collected'/'outstanding'), never the
  // translated label. Recharts uses a Pie slice's name/dataKey to match
  // sectors across re-renders for its enter/update/exit transitions — feed it
  // a string that changes on every locale toggle and it has nothing stable to
  // match against, so it silently re-derives sector (and legend) order from
  // scratch each time. That is exactly what happened here: switching to
  // Myanmar flipped which slice drew first, with the same two numbers, the
  // same colours, the same code path — only the label had changed. Translated
  // text belongs in the label/tooltip/legend FORMATTERS below, which run at
  // render time from this stable key, never in the data Recharts uses to
  // reconcile itself.
  const data = useMemo(
    () => [
      { key: 'collected', name: 'collected', label: t('credit.collected'), value: collected, color: CHART_COLORS.status.good },
      { key: 'outstanding', name: 'outstanding', label: t('credit.outstanding'), value: outstanding, color: CHART_COLORS.status.warning },
    ],
    [collected, outstanding, t],
  );

  if (total === 0) {
    return <p className="py-10 text-center text-xs text-ink-secondary">{t('common.noData')}</p>;
  }

  return (
    <div>
      {/*
        Hand-rolled legend, not Recharts' <Legend>. For a Pie specifically,
        Recharts wires the legend to the chart's own internal sector state
        rather than reliably honouring an explicit `payload` override — it
        kept reverting to the slice's raw identity key instead of the
        translated label the moment a Pie was involved. `data` is fully known
        here, so a plain row of dot+label+value is both simpler and can never
        reorder or relabel itself the way the library's did — the same reason
        `TrendChart.jsx` builds its own legend instead of relying on one.
      */}
      <ul className="mb-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink-secondary">
        {data.map((entry) => (
          <li key={entry.key} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: entry.color }}
              aria-hidden="true"
            />
            {entry.label} — K {fmtMMK(entry.value, { compact: true })}
          </li>
        ))}
      </ul>

      <div style={{ width: '100%', height: 192 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="key"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              stroke={CHART_COLORS.surface}
              strokeWidth={2}
              isAnimationActive={false}
              label={({ value }) => `${((value / total) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {data.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              // The label comes from `props.payload.label` — MY data row's
              // translated field — never from Recharts' own `name`/`nameKey`
              // resolution, for the same reason the legend was rebuilt below:
              // that path showed the raw stable identity key, not the label.
              formatter={(value, _name, props) => [`K ${fmtMMK(value)}`, props?.payload?.label]}
              contentStyle={tooltipContentStyle()}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Debt ageing, 0–7 / 8–14 / overdue — the coarse 3-band split, sourced from
 * `domain/credit.js#simplifiedAgeingBuckets` so it can never disagree with the
 * lock logic about which voucher is overdue. Colour is a severity ramp
 * (good→warning→critical), each bar carries its own value as a direct label,
 * and — a single series — needs no legend box; the axis names the categories.
 */
export function DebtAgeingChart({ buckets }) {
  const { t } = useLocale();

  const data = useMemo(
    () =>
      buckets.map((bucket) => ({
        key: bucket.key,
        label: t(`credit.bucket${labelSuffix(bucket.key)}`),
        value: bucket.value,
        color: CHART_COLORS.status[bucket.tone] ?? CHART_COLORS.status.warning,
      })),
    [buckets, t],
  );

  const total = data.reduce((sum, row) => sum + row.value, 0);
  if (total === 0) {
    return <p className="py-10 text-center text-xs text-ink-secondary">{t('common.noData')}</p>;
  }

  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" tick={axisTickStyle} axisLine={{ stroke: CHART_COLORS.axis }} tickLine={false} />
          <YAxis
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => fmtMMK(value, { compact: true })}
            width={48}
          />
          <Tooltip
            formatter={(value) => [`K ${fmtMMK(value)}`, undefined]}
            cursor={{ fill: 'var(--raised)', opacity: 0.5 }}
            contentStyle={tooltipContentStyle()}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Bar dataKey="value" maxBarSize={BAR_MAX_SIZE} radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function labelSuffix(key) {
  if (key === 'DAYS_0_7') return '0_7';
  if (key === 'DAYS_8_14') return '8_14';
  return 'Overdue';
}
