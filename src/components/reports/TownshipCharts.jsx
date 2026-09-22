import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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
import { districtLabel, districtShortLabel } from '../../constants/districts';
import { fmtMMK } from '../../lib/format';

/**
 * ---------------------------------------------------------------------------
 * SHOPS & TOWNSHIPS CHARTS.
 * ---------------------------------------------------------------------------
 * Revenue and volume are two different units (kyat vs. pieces) — the
 * dataviz rule this app follows never puts two different-scale measures on
 * one chart's two y-axes, so "revenue AND volume across the four districts"
 * is two small-multiple bar charts side by side (`DistrictBarChart` called
 * twice), not one dual-axis chart. Same reasoning for the leaderboard: bar
 * length ranks shops by revenue, and order count rides as a direct label
 * rather than a second axis.
 *
 * Only the district axis carries translated text (the four district names
 * have real Burmese labels the brief specified). Township and shop names are
 * proper nouns with no Burmese form in this app's dictionary — same as the
 * existing township filter dropdowns — so those two charts pass the English
 * name straight through as both identity and label, with nothing that
 * changes across a locale toggle for Recharts to lose track of.
 */

const districtColor = (index) => CHART_COLORS.series[index % CHART_COLORS.series.length];

/**
 * One bar per Yangon district. `key` (the district code) is the STABLE
 * identity used for the array order and each `<Cell>`'s React key — DISTRICT_ORDER
 * never changes with locale, so unlike the Credit pie chart there is no
 * cross-render identity to lose; `label` (the translated name) only feeds the
 * axis tick text and the tooltip, resolved fresh every render. `isAnimationActive={false}`
 * is kept anyway, as the same cheap insurance `DebtAgeingChart` uses.
 */
export function DistrictBarChart({ rows, metric, locale, emptyLabel }) {
  const data = useMemo(
    () =>
      rows.map((row, index) => ({
        key: row.key,
        // The axis tick shows the compact form ("North") — the card title
        // already says "by district", and a full "North District" plus three
        // siblings doesn't fit a phone-width chart without Recharts silently
        // dropping half of them. The tooltip below still shows the full name.
        label: districtShortLabel(row.key, locale),
        fullLabel: districtLabel(row.key, locale),
        value: metric === 'volume' ? row.volume : row.revenue,
        color: districtColor(index),
      })),
    [rows, metric, locale],
  );

  const total = data.reduce((sum, row) => sum + row.value, 0);
  if (total === 0) {
    return <p className="py-10 text-center text-xs text-ink-secondary">{emptyLabel}</p>;
  }

  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="label"
            interval={0}
            tick={axisTickStyle}
            axisLine={{ stroke: CHART_COLORS.axis }}
            tickLine={false}
          />
          <YAxis
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => (metric === 'volume' ? value.toLocaleString() : fmtMMK(value, { compact: true }))}
            width={48}
          />
          <Tooltip
            formatter={(value) => [metric === 'volume' ? `${value.toLocaleString()} pcs` : `K ${fmtMMK(value)}`, undefined]}
            labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullLabel ?? _label}
            cursor={{ fill: 'var(--raised)', opacity: 0.5 }}
            contentStyle={tooltipContentStyle()}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Bar dataKey="value" maxBarSize={BAR_MAX_SIZE} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Townships within one district, horizontal so a long name (e.g. "Dagon
 * Myothit (South)") never collides with its neighbour the way a rotated
 * vertical-axis label would — the same reason the brief's own "Top 10 shops"
 * leaderboard is horizontal. Bars are pre-sorted worst-to-best by the domain
 * layer, so the best-selling township always reads at the top.
 */
export function TownshipDrilldownChart({ rows, emptyLabel }) {
  const total = rows.reduce((sum, row) => sum + row.revenue, 0);
  if (total === 0) {
    return <p className="py-10 text-center text-xs text-ink-secondary">{emptyLabel}</p>;
  }

  const height = Math.max(rows.length * 32, 160);

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid {...gridProps} horizontal={false} vertical />
          <XAxis
            type="number"
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => fmtMMK(value, { compact: true })}
          />
          <YAxis
            type="category"
            dataKey="key"
            tick={axisTickStyle}
            axisLine={{ stroke: CHART_COLORS.axis }}
            tickLine={false}
            width={128}
          />
          <Tooltip
            formatter={(value, _name, props) => [
              `K ${fmtMMK(value)} · ${props?.payload?.count ?? 0} vouchers`,
              undefined,
            ]}
            cursor={{ fill: 'var(--raised)', opacity: 0.5 }}
            contentStyle={tooltipContentStyle()}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Bar
            dataKey="revenue"
            fill={CHART_COLORS.series[0]}
            maxBarSize={BAR_MAX_SIZE}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Top 10 shops by revenue. Order count is printed at the end of each bar
 * rather than plotted — two measures, one visible per bar, no second axis.
 */
export function TopShopsChart({ rows, ordersLabel, emptyLabel }) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-xs text-ink-secondary">{emptyLabel}</p>;
  }

  const height = Math.max(rows.length * 32, 160);

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps} horizontal={false} vertical />
          <XAxis
            type="number"
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => fmtMMK(value, { compact: true })}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={axisTickStyle}
            axisLine={{ stroke: CHART_COLORS.axis }}
            tickLine={false}
            width={128}
          />
          <Tooltip
            formatter={(value, _name, props) => [
              `K ${fmtMMK(value)} · ${props?.payload?.orders ?? 0} ${ordersLabel}`,
              undefined,
            ]}
            cursor={{ fill: 'var(--raised)', opacity: 0.5 }}
            contentStyle={tooltipContentStyle()}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Bar
            dataKey="revenue"
            fill={CHART_COLORS.series[2]}
            maxBarSize={BAR_MAX_SIZE}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          >
            <LabelList dataKey="orders" position="right" formatter={(value) => `${value} ${ordersLabel}`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
