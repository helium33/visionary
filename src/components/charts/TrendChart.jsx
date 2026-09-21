import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { fmtMMK } from '../../lib/format';

const PAD = { top: 12, right: 12, bottom: 22, left: 44 };

/**
 * Sales issued vs cash collected, weekly.
 *
 * Both series are kyat, so they share ONE axis — never a second y-scale. Two
 * series means a legend is mandatory; the final point of each line also carries
 * an end marker with a 2px surface ring so the lines stay readable where they
 * cross.
 */
export function TrendChart({ weeks, height = 180 }) {
  const [hover, setHover] = useState(null);
  const width = 640; // viewBox units; the SVG scales to its container

  const { salesPath, collectedPath, points, max, ticks } = useMemo(() => {
    const maxValue = Math.max(...weeks.flatMap((w) => [w.sales, w.collected]), 1);
    const niceMax = niceCeil(maxValue);
    const innerW = width - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    const x = (i) => PAD.left + (weeks.length === 1 ? innerW / 2 : (i / (weeks.length - 1)) * innerW);
    const y = (v) => PAD.top + innerH - (v / niceMax) * innerH;

    return {
      max: niceMax,
      points: weeks.map((w, i) => ({ ...w, x: x(i), ySales: y(w.sales), yCollected: y(w.collected) })),
      salesPath: weeks.map((w, i) => `${i ? 'L' : 'M'}${x(i)},${y(w.sales)}`).join(' '),
      collectedPath: weeks.map((w, i) => `${i ? 'L' : 'M'}${x(i)},${y(w.collected)}`).join(' '),
      ticks: [0, 0.5, 1].map((t) => ({ value: niceMax * t, y: y(niceMax * t) })),
    };
  }, [weeks, height]);

  if (!weeks.length) {
    return <p className="py-8 text-center text-xs text-ink-secondary">No activity yet</p>;
  }

  const last = points[points.length - 1];
  const active = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary">
        <LegendKey color="var(--series-1)" label="Sales issued" />
        <LegendKey color="var(--series-3)" label="Cash collected" />
      </ul>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Weekly sales issued versus cash collected"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - box.left) / box.width) * width;
          let nearest = 0;
          points.forEach((p, i) => {
            if (Math.abs(p.x - rel) < Math.abs(points[nearest].x - rel)) nearest = i;
          });
          setHover(nearest);
        }}
      >
        {ticks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={tick.y}
              y2={tick.y}
              stroke="var(--gridline)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={tick.y + 3}
              textAnchor="end"
              className="tnum"
              fontSize="10"
              fill="var(--text-muted)"
            >
              {fmtMMK(tick.value, { compact: true })}
            </text>
          </g>
        ))}

        {active ? (
          <line
            x1={active.x}
            x2={active.x}
            y1={PAD.top}
            y2={height - PAD.bottom}
            stroke="var(--baseline)"
            strokeWidth="1"
          />
        ) : null}

        <path d={salesPath} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={collectedPath} fill="none" stroke="var(--series-3)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {active ? (
          <>
            <circle cx={active.x} cy={active.ySales} r="4.5" fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth="2" />
            <circle cx={active.x} cy={active.yCollected} r="4.5" fill="var(--series-3)" stroke="var(--surface-1)" strokeWidth="2" />
          </>
        ) : (
          <>
            <circle cx={last.x} cy={last.ySales} r="4.5" fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth="2" />
            <circle cx={last.x} cy={last.yCollected} r="4.5" fill="var(--series-3)" stroke="var(--surface-1)" strokeWidth="2" />
          </>
        )}

        {points.map((p, i) =>
          i % Math.ceil(points.length / 6) === 0 || i === points.length - 1 ? (
            <text
              key={p.start.toISOString()}
              x={p.x}
              y={height - 6}
              textAnchor="middle"
              fontSize="10"
              fill="var(--text-muted)"
            >
              {format(p.start, 'd MMM')}
            </text>
          ) : null,
        )}
      </svg>

      {active ? (
        <div
          className="pointer-events-none absolute top-6 rounded-md border border-line-hair bg-surface px-2.5 py-2 text-xs shadow-lg"
          style={{ left: `${Math.min((active.x / width) * 100, 72)}%` }}
        >
          <p className="font-medium text-ink">Week of {format(active.start, 'd MMM')}</p>
          <p className="mt-1 flex items-center gap-1.5 text-ink-secondary">
            <Dot color="var(--series-1)" /> Sales K {fmtMMK(active.sales)}
          </p>
          <p className="flex items-center gap-1.5 text-ink-secondary">
            <Dot color="var(--series-3)" /> Collected K {fmtMMK(active.collected)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function LegendKey({ color, label }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="h-0.5 w-3.5 rounded" style={{ background: color }} aria-hidden="true" />
      {label}
    </li>
  );
}

function Dot({ color }) {
  return <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />;
}

function niceCeil(value) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}
