import { CHARGE_KEYS, CHARGE_LABELS, lineMargin } from '../../domain/landedCost';
import { fmtMMK, fmtPct } from '../../lib/format';

/**
 * The landed-cost breakdown — the table that answers "what did this piece
 * actually cost us, and is it still worth selling".
 *
 * Factory price and freight are shown as separate columns rather than a single
 * cost, because the split is the decision-making information: a frame whose
 * cost is 40% freight is a different conversation from one that is 8%.
 */
export function LandedCostTable({ costed, productsById, tier = 'STANDARD' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[780px] text-sm">
        <thead>
          <tr className="border-b border-line-hair text-left text-2xs text-ink-secondary">
            <th className="px-4 py-2 font-medium">Item</th>
            <th className="px-3 py-2 text-right font-medium">Qty</th>
            <th className="px-3 py-2 text-right font-medium">Factory</th>
            <th className="px-3 py-2 text-right font-medium">Freight share</th>
            <th className="px-3 py-2 text-right font-medium">Landed / pc</th>
            <th className="px-3 py-2 text-right font-medium">Sells at</th>
            <th className="px-4 py-2 text-right font-medium">Margin</th>
          </tr>
        </thead>
        <tbody>
          {costed.lines.map((line) => {
            const product = productsById?.get(line.productId);
            const margin = lineMargin(line, product, tier);
            const thin = margin.marginPct < 25 && margin.price > 0;

            return (
              <tr
                key={`${line.productId}-${line.colorCode}`}
                className="border-b border-line-hair last:border-0"
              >
                <td className="whitespace-nowrap px-4 py-2">
                  <span className="font-medium tabular-nums text-ink">{line.modelNo}</span>
                  <span className="ml-1.5 text-ink-secondary">
                    {line.colorCode}
                    {line.colorName ? ` ${line.colorName}` : ''}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">
                  {line.qty}
                  {line.orderedQty != null && line.orderedQty !== line.qty ? (
                    <span className="block text-2xs text-status-serious">
                      of {line.orderedQty}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">
                  {fmtMMK(line.factoryMMK)}
                  <span className="block text-2xs text-ink-muted">
                    {fmtMMK(Math.round(line.factoryMMK / (line.qty || 1)))} / pc
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">
                  {fmtMMK(line.chargeShare)}
                  <span className="block text-2xs text-ink-muted">
                    {fmtPct(line.chargeSharePct, 1)} of cost
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">
                  {fmtMMK(line.landedUnitCost)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">
                  {margin.price ? fmtMMK(margin.price) : '—'}
                </td>
                <td className="px-4 py-2 text-right">
                  {margin.price ? (
                    <>
                      <span
                        className={`font-medium tabular-nums ${
                          margin.margin < 0
                            ? 'text-status-critical'
                            : thin
                              ? 'text-ink'
                              : 'text-status-good'
                        }`}
                      >
                        {fmtPct(margin.marginPct, 1)}
                      </span>
                      <span className="block text-2xs tabular-nums text-ink-muted">
                        {fmtMMK(margin.margin)} / pc
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-line-base">
            <td className="px-4 py-2 font-medium text-ink">Total</td>
            <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">
              {costed.totalQty}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-ink">
              {fmtMMK(costed.totalFactoryMMK)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-ink">
              {fmtMMK(costed.totalCharges)}
            </td>
            <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">
              {fmtMMK(costed.averageUnitCost)}
              <span className="block text-2xs font-normal text-ink-muted">average</span>
            </td>
            <td colSpan={2} className="px-4 py-2 text-right text-2xs text-ink-secondary">
              Landed K {fmtMMK(costed.totalLanded)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** The charge lines, and what they add to the goods. */
export function ChargeSummary({ po, costed, editable, onChange }) {
  return (
    <div className="rounded-card border border-line-hair">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-hair px-3 py-2">
        <p className="text-xs font-medium text-ink">Charges</p>
        <p className="text-2xs text-ink-secondary">
          spread {po.allocationBasis === 'BY_QTY' ? 'per piece' : 'by value'}
        </p>
      </div>

      <ul className="divide-y divide-line-hair">
        {CHARGE_KEYS.map((key) => (
          <li key={key} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <label htmlFor={`charge-${key}`} className="text-xs text-ink-secondary">
              {CHARGE_LABELS[key]}
            </label>
            {editable ? (
              <input
                id={`charge-${key}`}
                inputMode="numeric"
                value={po.charges?.[key] ?? ''}
                onChange={(e) => onChange(key, e.target.value)}
                className="h-7 w-28 rounded border border-line-hair bg-surface px-2 text-right text-xs tabular-nums text-ink outline-none"
              />
            ) : (
              <span className="text-xs tabular-nums text-ink">
                {fmtMMK(po.charges?.[key] ?? 0)}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="space-y-1 border-t border-line-hair px-3 py-2">
        <Row label="Goods at factory" value={costed.totalFactoryMMK} />
        <Row label="Charges" value={costed.totalCharges} />
        <Row label="Landed total" value={costed.totalLanded} strong />
        <p className="pt-1 text-2xs text-ink-muted">
          Charges add {fmtPct(costed.chargeUpliftPct, 1)} to the factory price — K{' '}
          {fmtMMK(costed.averageUnitCost)} average per piece.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className={strong ? 'font-medium text-ink' : 'text-ink-secondary'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold text-ink' : 'text-ink'}`}>
        K {fmtMMK(value)}
      </span>
    </div>
  );
}
