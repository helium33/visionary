/**
 * ---------------------------------------------------------------------------
 * SHARED RECHARTS THEMING.
 * ---------------------------------------------------------------------------
 * Every colour handed to Recharts below is a CSS custom-property STRING
 * (`'var(--status-good)'`), never a resolved hex value. Recharts spreads
 * `fill`/`stroke` straight onto the underlying SVG elements as plain
 * attributes, and SVG presentation attributes resolve `var()` exactly like a
 * CSS property in every evergreen browser — so a chart built from these
 * tokens repaints itself the instant the light/dark toggle flips, with no
 * re-render, no theme prop threaded through, and no chart-specific dark-mode
 * branch to keep in sync. This is the same validated categorical/status
 * palette the rest of the app's hand-rolled charts use (see index.css) — the
 * point of routing Recharts through it too is that a chart never looks like
 * it came from a different design system depending on which library drew it.
 */

export const CHART_COLORS = {
  series: ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'],
  status: {
    good: 'var(--status-good)',
    warning: 'var(--status-warning)',
    serious: 'var(--status-serious)',
    critical: 'var(--status-critical)',
  },
  diverge: { pos: 'var(--diverge-pos)', neg: 'var(--diverge-neg)' },
  grid: 'var(--gridline)',
  axis: 'var(--baseline)',
  textMuted: 'var(--text-muted)',
  textSecondary: 'var(--text-secondary)',
  surface: 'var(--surface-1)',
};

/** Shared Cartesian axis/grid props — hairline, solid, recessive, per the mark spec. */
export const axisTickStyle = { fontSize: 11, fill: CHART_COLORS.textMuted };
export const gridProps = { stroke: CHART_COLORS.grid, strokeDasharray: '0', vertical: false };

/** Bars stay ≤24px and never fill their slot; corners round only at the data-end. */
export const BAR_SIZE = 20;
export const BAR_MAX_SIZE = 24;

/**
 * The tooltip box styled to match `components/charts/ChartTooltip.jsx` (the
 * hand-rolled charts' own tooltip) so a Recharts panel does not read as a
 * different product from the ones beside it.
 */
export function tooltipContentStyle() {
  return {
    background: CHART_COLORS.surface,
    border: '1px solid var(--border-hair)',
    borderRadius: 8,
    fontSize: 12,
    padding: '8px 10px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
  };
}

export const tooltipLabelStyle = { color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2 };
export const tooltipItemStyle = { color: 'var(--text-secondary)', padding: 0 };
