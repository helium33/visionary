import { Layers, Package, Trash2 } from 'lucide-react';
import { fmtMMK } from '../../lib/format';
import { EmptyState } from '../ui/EmptyState';

/**
 * The voucher's lines, grouped by model so a rep reads the order the way the
 * shop gave it. The tier badge on each line shows which price won and why,
 * because "why is C2 cheaper than last week" is the question reps get asked.
 */
export function VoucherLines({ lines, bundles, onChangeQty, onRemove }) {
  if (!lines.length) {
    return (
      <EmptyState
        icon={Package}
        title="No items yet"
        description="Pick a model above and type quantities across its colour row."
      />
    );
  }

  const groups = groupByModel(lines);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-line-hair text-left text-2xs text-ink-secondary">
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Price applied</th>
              <th className="px-3 py-2 text-center font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Unit</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>

          {groups.map((group) => (
            <tbody key={group.modelNo}>
              <tr className="bg-raised/60">
                <td colSpan={6} className="px-4 py-1.5">
                  <span className="text-2xs font-semibold tabular-nums text-ink">
                    {group.modelNo}
                  </span>
                  <span className="ml-2 text-2xs text-ink-secondary">
                    {group.qty} pcs · K {fmtMMK(group.total)}
                  </span>
                </td>
              </tr>

              {group.lines.map((line) => (
                <tr key={`${line.productId}-${line.colorCode}`} className="border-b border-line-hair">
                  <td className="px-4 py-2">
                    <span className="font-medium tabular-nums text-ink">{line.colorCode}</span>
                    <span className="ml-1.5 text-ink-secondary">{line.colorName}</span>
                  </td>

                  <td className="px-3 py-2">
                    <span className="rounded bg-wash-accent px-1.5 py-0.5 text-2xs font-medium text-ink">
                      {line.tierLabel}
                    </span>
                    <p className="mt-0.5 text-2xs text-ink-muted">{line.tierReason}</p>
                  </td>

                  <td className="px-3 py-2 text-center">
                    <input
                      inputMode="numeric"
                      value={line.qty}
                      onChange={(e) => onChangeQty(line, e.target.value)}
                      aria-label={`Quantity for ${line.modelNo} ${line.colorCode}`}
                      className="h-8 w-14 rounded border border-line-hair bg-surface text-center
                        text-sm font-medium tabular-nums text-ink outline-none"
                    />
                  </td>

                  <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">
                    {fmtMMK(line.unitPrice)}
                    {line.discountPct > 0 ? (
                      <p className="text-2xs text-ink-muted line-through">{fmtMMK(line.listPrice)}</p>
                    ) : null}
                  </td>

                  <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">
                    {fmtMMK(line.lineTotal)}
                  </td>

                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onRemove(line)}
                      aria-label={`Remove ${line.modelNo} ${line.colorCode}`}
                      className="rounded p-1 text-ink-muted hover:bg-raised hover:text-status-critical"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {bundles.length ? (
        <div className="flex items-start gap-2 border-t border-line-hair px-4 py-2.5">
          <Layers size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
          <p className="text-2xs text-ink-secondary">
            <span className="font-medium text-ink">Bundled automatically:</span>{' '}
            {bundles.map((b) => `${b.qty} × ${b.modelNo}`).join(', ')} — deducted from stock, not
            charged to the shop.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function groupByModel(lines) {
  const map = new Map();
  for (const line of lines) {
    const current = map.get(line.modelNo) ?? { modelNo: line.modelNo, lines: [], qty: 0, total: 0 };
    current.lines.push(line);
    current.qty += line.qty;
    current.total += line.lineTotal;
    map.set(line.modelNo, current);
  }
  return [...map.values()];
}
