import { useCallback, useState } from 'react';

/**
 * Shared hover layer. An HTML chart is interactive by default, so every chart
 * in this app ships a tooltip rather than relying on axis reading alone.
 */
export function useChartTooltip() {
  const [tip, setTip] = useState(null);

  const show = useCallback((event, content) => {
    setTip({ x: event.clientX, y: event.clientY, content });
  }, []);

  const move = useCallback((event) => {
    setTip((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
  }, []);

  const hide = useCallback(() => setTip(null), []);

  return { tip, show, move, hide };
}

export function ChartTooltip({ tip }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none fixed z-50 max-w-[240px] rounded-md border border-line-hair
        bg-surface px-2.5 py-2 text-xs shadow-lg"
      style={{
        left: Math.min(tip.x + 12, window.innerWidth - 250),
        top: Math.min(tip.y + 12, window.innerHeight - 110),
      }}
      role="tooltip"
    >
      {tip.content}
    </div>
  );
}
