import { PackageCheck, Ship } from 'lucide-react';
import { computeLandedCost } from '../../domain/landedCost';
import { poArrivalState } from '../../domain/purchasing';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { useLocale } from '../../context/LocaleContext';
import { EmptyState } from '../ui/EmptyState';
import { StatusPill } from '../ui/StatusPill';

/**
 * Purchase orders, newest first. The landed total is computed rather than read
 * from a stored field so an order whose charges were edited five minutes ago
 * shows the new number without waiting on a write-back.
 */
export function PoTable({ orders, today, onOpen }) {
  const { t } = useLocale();

  if (!orders.length) {
    return (
      <EmptyState
        icon={Ship}
        title={t('purchasing.noOrders')}
        description={t('purchasing.noOrdersHint')}
      />
    );
  }

  return (
    <>
      <ul className="divide-y divide-line-hair lg:hidden">
        {orders.map((po) => {
          const costed = computeLandedCost(po);
          const arrival = poArrivalState(po, today);
          return (
            <li key={po.id} className="px-4 py-3">
              <button type="button" onClick={() => onOpen(po)} className="w-full text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium tabular-nums text-ink">{po.poNo}</p>
                    <p className="truncate text-2xs text-ink-secondary">{po.supplierName}</p>
                  </div>
                  <StatusPill
                    tone={arrival.tone}
                    label={t(`purchasing.status.${arrival.key}`)}
                    size="sm"
                    detail={arrival.overdue ? t('purchasing.daysLate', { n: arrival.daysLate }) : null}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                  <span className="text-ink-secondary">
                    {t('purchasing.piecesAtCost', {
                      pieces: costed.totalQty,
                      cost: fmtMMK(costed.averageUnitCost),
                    })}
                  </span>
                  <span className="font-medium tabular-nums text-ink">
                    K {fmtMMK(costed.totalLanded, { compact: true })}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line-hair text-left text-xs text-ink-secondary">
              <th className="px-4 py-2 font-medium">{t('purchasing.colPo')}</th>
              <th className="px-3 py-2 font-medium">{t('purchasing.colSupplier')}</th>
              <th className="px-3 py-2 font-medium">{t('purchasing.colStatus')}</th>
              <th className="px-3 py-2 font-medium">{t('purchasing.colExpected')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('purchasing.colPieces')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('purchasing.colFactory')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('purchasing.colCharges')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('purchasing.colLanded')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((po) => {
              const costed = computeLandedCost(po);
              const arrival = poArrivalState(po, today);

              return (
                <tr
                  key={po.id}
                  className="cursor-pointer border-b border-line-hair last:border-0 hover:bg-raised"
                  onClick={() => onOpen(po)}
                >
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <button
                      type="button"
                      className="font-medium tabular-nums text-ink hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(po);
                      }}
                    >
                      {po.poNo}
                    </button>
                    <p className="text-2xs text-ink-muted">
                      {po.orderedAt ? fmtDate(po.orderedAt, 'dd MMM yy') : t('purchasing.notOrdered')}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="truncate text-ink">{po.supplierName}</p>
                    <p className="text-2xs text-ink-secondary">
                      {po.currency} @ {po.fxRate}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <StatusPill
                      tone={arrival.tone}
                      label={t(`purchasing.status.${arrival.key}`)}
                      size="sm"
                      detail={arrival.overdue ? t('purchasing.daysLate', { n: arrival.daysLate }) : null}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-secondary">
                    {po.receivedAt ? (
                      <span className="inline-flex items-center gap-1">
                        <PackageCheck size={12} className="text-status-good" aria-hidden="true" />
                        {fmtDate(po.receivedAt, 'dd MMM')}
                      </span>
                    ) : (
                      fmtDate(po.expectedAt, 'dd MMM')
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">{costed.totalQty}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-secondary">
                    {fmtMMK(costed.totalFactoryMMK)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-secondary">
                    {fmtMMK(costed.totalCharges)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <span className="font-medium tabular-nums text-ink">
                      {fmtMMK(costed.totalLanded)}
                    </span>
                    <span className="block text-2xs tabular-nums text-ink-muted">
                      {t('purchasing.perPcK', { amount: fmtMMK(costed.averageUnitCost) })}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
