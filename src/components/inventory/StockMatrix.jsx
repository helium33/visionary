import { ChevronDown, ChevronRight, Tag } from 'lucide-react';
import { bandMeta, variantUnits } from '../../domain/inventory';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { StatusPill } from '../ui/StatusPill';

/**
 * The matrix: one row per model, expanding into its colour row.
 *
 * Models collapse by default because a catalogue of 40 models × 6 colours is
 * 240 rows nobody reads. The colour grid opens on the model the warehouse is
 * actually counting — and that is also when its variants are fetched.
 */
/** The colour row of one model — shared by the table and the phone cards. */
function ColourGrid({ row, locationId, selected, onSelectVariant, onSelectModel }) {
  const { product } = row;
  const isSelected = (variant) =>
    selected.some(
      (s) => s.product.id === product.id && s.variant.colorCode === variant.colorCode,
    );

  if (!row.variants.length) {
    return <p className="text-xs text-ink-secondary">Loading colours…</p>;
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-2xs font-medium text-ink">Colours — tick to include in a label run</p>
        <button
          type="button"
          onClick={() => onSelectModel(row)}
          className="text-2xs text-ink-secondary underline hover:text-ink"
        >
          Select all colours
        </button>
      </div>

      <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {row.variants.map((variant) => {
          const units = variantUnits(variant, locationId);
          const reorder = Number(variant.reorderPoint) || 0;
          const out = units === 0;
          const low = !out && reorder > 0 && units <= reorder;

          return (
            <li key={variant.colorCode}>
              <label className="flex cursor-pointer items-center gap-2 rounded border border-line-hair bg-surface px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={isSelected(variant)}
                  onChange={() => onSelectVariant(product, variant)}
                  className="h-3.5 w-3.5 shrink-0"
                />
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-line-hair"
                  style={{ background: variant.hex }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-ink">
                  <span className="font-medium tabular-nums">{variant.colorCode}</span>{' '}
                  <span className="text-ink-secondary">{variant.colorName}</span>
                </span>
                <span
                  className={`shrink-0 text-xs tabular-nums ${
                    out ? 'text-status-critical' : low ? 'text-ink' : 'text-ink-secondary'
                  }`}
                >
                  {units}
                </span>
                {out ? (
                  <span className="shrink-0 rounded bg-wash-critical px-1 py-0.5 text-2xs text-status-critical">
                    out
                  </span>
                ) : low ? (
                  <span className="shrink-0 rounded bg-wash-warning px-1 py-0.5 text-2xs text-ink">
                    low
                  </span>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-2xs text-ink-muted">
        Barcodes: {row.variants[0]?.barcode ?? '—'} … · landed cost K {fmtMMK(row.unitCost)} / pc ·
        list K {fmtMMK(row.unitPrice)}
      </p>
    </>
  );
}

export function StockMatrix({
  rows,
  expandedId,
  onToggle,
  locationId,
  selected,
  onSelectVariant,
  onSelectModel,
  onPrintModel,
}) {
  if (!rows.length) {
    return <EmptyState icon={Tag} title="No models match" description="Try a different filter." />;
  }

  const isSelected = (product, variant) =>
    selected.some((s) => s.product.id === product.id && s.variant.colorCode === variant.colorCode);

  return (
    <>
      {/* Phone: one card per model, so units, capital and the label action stay
          on screen during a stock count. */}
      <ul className="divide-y divide-line-hair lg:hidden">
        {rows.map((row) => {
          const open = expandedId === row.product.id;
          const meta = bandMeta(row.band);
          return (
            <li key={row.product.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onToggle(open ? null : row.product.id)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
                >
                  {open ? (
                    <ChevronDown size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
                  ) : (
                    <ChevronRight size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium tabular-nums text-ink">
                      {row.product.modelNo}
                    </span>
                    <span className="block text-2xs text-ink-secondary">
                      {[row.product.material, row.product.shape?.replace('_', ' ')]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
                <StatusPill
                  tone={meta.tone}
                  label={meta.label}
                  size="sm"
                  detail={row.daysSinceSale != null ? `${row.daysSinceSale}d` : 'never'}
                />
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-ink-secondary">
                  <span className="font-medium tabular-nums text-ink">{row.units}</span> pcs ·{' '}
                  {row.variantCount || row.product.colorCount} colours
                  {row.outVariants.length ? (
                    <span className="text-status-critical"> · {row.outVariants.length} out</span>
                  ) : null}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-ink-secondary">
                    K {fmtMMK(row.costValue, { compact: true })}
                  </span>
                  <Button size="sm" variant="quiet" icon={Tag} onClick={() => onPrintModel(row)}>
                    Print
                  </Button>
                </div>
              </div>

              {open ? (
                <div className="mt-3 rounded-card border border-line-hair bg-raised/50 p-2.5">
                  <ColourGrid
                    row={row}
                    locationId={locationId}
                    selected={selected}
                    onSelectVariant={onSelectVariant}
                    onSelectModel={onSelectModel}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto lg:block">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-line-hair text-left text-xs text-ink-secondary">
            <th className="px-4 py-2 font-medium">Model</th>
            <th className="px-3 py-2 font-medium">Attributes</th>
            <th className="px-3 py-2 text-right font-medium">Colours</th>
            <th className="px-3 py-2 text-right font-medium">Units</th>
            <th className="px-3 py-2 text-right font-medium">At cost</th>
            <th className="px-3 py-2 font-medium">Last sold</th>
            <th className="px-4 py-2 text-right font-medium">Labels</th>
          </tr>
        </thead>

        {rows.map((row) => {
          const { product } = row;
          const open = expandedId === product.id;
          const meta = bandMeta(row.band);

          return (
            <tbody key={product.id}>
              <tr className="border-b border-line-hair hover:bg-raised">
                <td className="whitespace-nowrap px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => onToggle(open ? null : product.id)}
                    aria-expanded={open}
                    className="flex items-center gap-1.5 font-medium tabular-nums text-ink"
                  >
                    {open ? (
                      <ChevronDown size={14} className="text-ink-muted" aria-hidden="true" />
                    ) : (
                      <ChevronRight size={14} className="text-ink-muted" aria-hidden="true" />
                    )}
                    {product.modelNo}
                  </button>
                </td>

                <td className="whitespace-nowrap px-3 py-2.5 text-2xs text-ink-secondary">
                  {[product.material, product.shape?.replace('_', ' '), product.gender]
                    .filter(Boolean)
                    .join(' · ')}
                </td>

                <td className="px-3 py-2.5 text-right tabular-nums text-ink-secondary">
                  {row.variantCount || product.colorCount}
                  {row.outVariants.length ? (
                    <span className="text-2xs text-status-critical">
                      {' · '}
                      {row.outVariants.length} out
                    </span>
                  ) : null}
                </td>

                <td className="px-3 py-2.5 text-right font-medium tabular-nums text-ink">
                  {row.units}
                </td>

                <td className="px-3 py-2.5 text-right tabular-nums text-ink-secondary">
                  {fmtMMK(row.costValue)}
                </td>

                <td className="whitespace-nowrap px-3 py-2.5">
                  <StatusPill
                    tone={meta.tone}
                    label={meta.label}
                    size="sm"
                    detail={row.daysSinceSale != null ? `${row.daysSinceSale}d` : 'never'}
                  />
                  <p className="mt-0.5 text-2xs text-ink-muted">
                    {product.lastSoldAt ? fmtDate(product.lastSoldAt, 'dd MMM') : '—'}
                  </p>
                </td>

                <td className="px-4 py-2.5 text-right">
                  <Button
                    size="sm"
                    variant="quiet"
                    icon={Tag}
                    onClick={() => onPrintModel(row)}
                    title={`Print labels for every colour of ${product.modelNo}`}
                  >
                    Print
                  </Button>
                </td>
              </tr>

              {open ? (
                <tr className="border-b border-line-hair">
                  <td colSpan={7} className="bg-raised/50 px-4 py-3">
                    <ColourGrid
                      row={row}
                      locationId={locationId}
                      selected={selected}
                      onSelectVariant={onSelectVariant}
                      onSelectModel={onSelectModel}
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          );
        })}
      </table>
      </div>
    </>
  );
}
