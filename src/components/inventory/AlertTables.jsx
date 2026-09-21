import { PackageX, Skull, Tag } from 'lucide-react';
import { bandMeta, variantUnits } from '../../domain/inventory';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { StatusPill } from '../ui/StatusPill';

/**
 * Dead stock — models nobody has bought in three months or more.
 *
 * The column that matters is not the unit count, it is the capital: this table
 * exists to answer "how much cash is sitting in things that stopped selling",
 * which is the question that justifies a clearance price.
 */
export function DeadStockTable({ rows, onPrintModel }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={Skull}
        title="Nothing has gone dead"
        description="Every model in stock has sold within the last three months."
      />
    );
  }

  const totalCapital = rows.reduce((sum, row) => sum + row.costValue, 0);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line-hair text-left text-xs text-ink-secondary">
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Attributes</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Last sold</th>
              <th className="px-3 py-2 text-right font-medium">Units</th>
              <th className="px-3 py-2 text-right font-medium">Capital at cost</th>
              <th className="px-4 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = bandMeta(row.band);
              return (
                <tr key={row.product.id} className="border-b border-line-hair last:border-0 hover:bg-raised">
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium tabular-nums text-ink">
                    {row.product.modelNo}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-2xs text-ink-secondary">
                    {[row.product.material, row.product.shape?.replace('_', ' ')]
                      .filter(Boolean)
                      .join(' · ')}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <StatusPill tone={meta.tone} label={meta.label} size="sm" />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-secondary">
                    {fmtDate(row.product.lastSoldAt, 'dd MMM yy')}
                    <span className="ml-1.5 text-2xs text-ink-muted">{row.daysSinceSale}d ago</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">{row.units}</td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-status-critical">
                    {fmtMMK(row.costValue)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" variant="quiet" icon={Tag} onClick={() => onPrintModel(row)}>
                      Clearance labels
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-line-hair px-4 py-2.5 text-xs text-ink-secondary">
        <span className="font-medium text-ink">K {fmtMMK(totalCapital)}</span> of stock has not sold
        in three months or more. Clearing it at cost releases that cash; holding it does not.
      </p>
    </>
  );
}

/** Colours at or below their reorder point, out-of-stock first. */
export function LowStockTable({ rows, locationId, onPrintModel }) {
  const entries = rows.flatMap((row) => [
    ...row.outVariants.map((variant) => ({ row, variant, out: true })),
    ...row.lowVariants.map((variant) => ({ row, variant, out: false })),
  ]);

  if (!entries.length) {
    return (
      <EmptyState
        icon={PackageX}
        title="Every colour is above its reorder point"
        description="Nothing needs restocking at this location."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line-hair text-left text-xs text-ink-secondary">
            <th className="px-4 py-2 font-medium">Model</th>
            <th className="px-3 py-2 font-medium">Colour</th>
            <th className="px-3 py-2 text-right font-medium">On hand</th>
            <th className="px-3 py-2 text-right font-medium">Reorder at</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-4 py-2 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(({ row, variant, out }) => (
            <tr
              key={`${row.product.id}-${variant.colorCode}`}
              className="border-b border-line-hair last:border-0 hover:bg-raised"
            >
              <td className="whitespace-nowrap px-4 py-2.5 font-medium tabular-nums text-ink">
                {row.product.modelNo}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-full border border-line-hair"
                    style={{ background: variant.hex }}
                    aria-hidden="true"
                  />
                  <span className="tabular-nums text-ink">{variant.colorCode}</span>
                  <span className="text-ink-secondary">{variant.colorName}</span>
                </span>
              </td>
              <td
                className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                  out ? 'text-status-critical' : 'text-ink'
                }`}
              >
                {variantUnits(variant, locationId)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-ink-secondary">
                {variant.reorderPoint ?? '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                <StatusPill
                  tone={out ? 'critical' : 'warning'}
                  label={out ? 'Out of stock' : 'Low'}
                  size="sm"
                />
              </td>
              <td className="px-4 py-2.5 text-right">
                <Button size="sm" variant="quiet" icon={Tag} onClick={() => onPrintModel(row)}>
                  Labels
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
