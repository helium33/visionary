import { toDate } from '../lib/dates';
import { isRevenueVoucher } from './profit';

/**
 * ---------------------------------------------------------------------------
 * SALES REP COMMISSION — volume, plus a bonus for collecting inside 14 days.
 * ---------------------------------------------------------------------------
 * The structure is the point. Paying commission on sales alone rewards a rep
 * for selling to shops that never pay: the voucher counts the day it is
 * written, and the debt becomes someone else's problem. So the scheme has two
 * halves —
 *
 *   base      = a percentage of what the rep sold
 *   bonus     = a percentage of what the rep COLLECTED INSIDE THE TERM
 *
 * — and the bonus half is deliberately tied to `payments.onTime`, which the
 * payment write sets when every allocation was still within its 14 days. A rep
 * who sells hard and collects slowly earns the base and forfeits the bonus,
 * which is exactly the behaviour the 14-day rule exists to encourage.
 */

export const DEFAULT_RATES = {
  basePct: 2.5, // of net sales value
  onTimeBonusPct: 1.0, // of cash collected within the credit term
};

export function computeCommissions({
  vouchers = [],
  payments = [],
  reps = [],
  shops = [],
  from,
  to = new Date(),
  rates = DEFAULT_RATES,
} = {}) {
  const inWindow = (value) => {
    const date = toDate(value);
    if (!date) return false;
    if (from && date < from) return false;
    return date <= to;
  };

  const shopRep = new Map(shops.map((shop) => [shop.id, shop.salesRepId]));

  const rows = reps.map((rep) => {
    const repId = rep.uid ?? rep.id;

    const sold = vouchers.filter(
      (voucher) =>
        isRevenueVoucher(voucher) &&
        inWindow(voucher.issueDate) &&
        (voucher.salesRepId ?? shopRep.get(voucher.shopId)) === repId,
    );

    const collectedPayments = payments.filter(
      (payment) => inWindow(payment.receivedAt) && payment.receivedBy === repId,
    );

    const salesValue = sold.reduce((sum, v) => sum + (Number(v.grandTotal) || 0), 0);
    const pieces = sold.reduce(
      (sum, v) => sum + (v.items ?? []).reduce((n, item) => n + (Number(item.qty) || 0), 0),
      0,
    );
    const collected = collectedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const collectedOnTime = collectedPayments
      .filter((payment) => payment.onTime)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const basePct = Number(rep.commissionRatePct ?? rates.basePct) || 0;
    const baseCommission = Math.round((salesValue * basePct) / 100);
    const collectionBonus = Math.round((collectedOnTime * rates.onTimeBonusPct) / 100);

    return {
      rep,
      repId,
      name: rep.name,
      shopCount: shops.filter((shop) => shop.salesRepId === repId).length,
      voucherCount: sold.length,
      pieces,
      salesValue,
      collected,
      collectedOnTime,
      onTimeRatePct: collected ? round1((collectedOnTime / collected) * 100) : 0,
      basePct,
      bonusPct: rates.onTimeBonusPct,
      baseCommission,
      collectionBonus,
      // The bonus forgone — the number that makes the incentive legible to the
      // rep, rather than a total they cannot decompose.
      bonusForgone: Math.round(((collected - collectedOnTime) * rates.onTimeBonusPct) / 100),
      total: baseCommission + collectionBonus,
    };
  });

  rows.sort((a, b) => b.total - a.total);

  return {
    rows,
    totals: {
      salesValue: sum(rows, 'salesValue'),
      collected: sum(rows, 'collected'),
      collectedOnTime: sum(rows, 'collectedOnTime'),
      baseCommission: sum(rows, 'baseCommission'),
      collectionBonus: sum(rows, 'collectionBonus'),
      total: sum(rows, 'total'),
    },
    rates,
  };
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}
