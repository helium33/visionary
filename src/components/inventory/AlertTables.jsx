import { PackageX, Skull, Tag } from 'lucide-react';
import { bandMeta, variantUnits } from '../../domain/inventory';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { productAttributes } from '../../lib/productAttributes';
import { useLocale } from '../../context/LocaleContext';
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
  const { t } = useLocale();

  if (!rows.length) {
    return (
      <EmptyState
        icon={Skull}
        title={t('inventory.nothingDead')}
        description={t('inventory.nothingDeadHint')}
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
              <th className="px-4 py-2 font-medium">{t('inventory.colModel')}</th>
              <th className="px-3 py-2 font-medium">{t('inventory.colAttributes')}</th>
              <th className="px-3 py-2 font-medium">{t('inventory.colStatus')}</th>
              <th className="px-3 py-2 font-medium">{t('inventory.colLastSold')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('inventory.colUnits')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('inventory.colCapital')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('inventory.colAction')}</th>
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
                    {productAttributes(row.product, t, { gender: false })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <StatusPill tone={meta.tone} label={t(`inventory.band.${meta.key}`)} size="sm" />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-secondary">
                    {fmtDate(row.product.lastSoldAt, 'dd MMM yy')}
                    <span className="ml-1.5 text-2xs text-ink-muted">
                      {t('inventory.daysAgo', { n: row.daysSinceSale })}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">{row.units}</td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-status-critical">
                    {fmtMMK(row.costValue)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" variant="quiet" icon={Tag} onClick={() => onPrintModel(row)}>
                      {t('inventory.clearanceLabels')}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-line-hair px-4 py-2.5 text-xs text-ink-secondary">
        <span className="font-medium text-ink">K {fmtMMK(totalCapital)}</span> {t('inventory.deadFooter')}
      </p>
    </>
  );
}

/** Colours at or below their reorder point, out-of-stock first. */
export function LowStockTable({ rows, locationId, onPrintModel }) {
  const { t } = useLocale();
  const entries = rows.flatMap((row) => [
    ...row.outVariants.map((variant) => ({ row, variant, out: true })),
    ...row.lowVariants.map((variant) => ({ row, variant, out: false })),
  ]);

  if (!entries.length) {
    return (
      <EmptyState
        icon={PackageX}
        title={t('inventory.allAboveReorder')}
        description={t('inventory.allAboveReorderHint')}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line-hair text-left text-xs text-ink-secondary">
            <th className="px-4 py-2 font-medium">{t('inventory.colModel')}</th>
            <th className="px-3 py-2 font-medium">{t('inventory.colColour')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('inventory.colOnHand')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('inventory.colReorderAt')}</th>
            <th className="px-3 py-2 font-medium">{t('inventory.colStatus')}</th>
            <th className="px-4 py-2 text-right font-medium">{t('inventory.colAction')}</th>
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
                  label={out ? t('inventory.outOfStock') : t('inventory.low')}
                  size="sm"
                />
              </td>
              <td className="px-4 py-2.5 text-right">
                <Button size="sm" variant="quiet" icon={Tag} onClick={() => onPrintModel(row)}>
                  {t('inventory.labels')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
