import { useEffect, useMemo, useState } from 'react';
import { eachWeekOfInterval, endOfWeek, isWithinInterval, subDays } from 'date-fns';
import { toDate } from '../lib/dates';
import { subscribePayments, subscribeRecentVouchers } from '../services/dataSource';

/**
 * Township and shop performance over a rolling window.
 *
 * Consignment vouchers are excluded from revenue everywhere in here — sample
 * stock sitting on a shop's shelf is not a sale until it converts, and counting
 * it would overstate both the township ranking and the rep's commission.
 */
export function useSalesAnalytics({ days = 90 } = {}) {
  const since = useMemo(() => subDays(new Date(), days), [days]);
  const [vouchers, setVouchers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let gotV = false;
    let gotP = false;
    const settle = () => {
      if (gotV && gotP) setLoading(false);
    };
    const unsubV = subscribeRecentVouchers(({ data }) => {
      setVouchers(data);
      gotV = true;
      settle();
    }, { since });
    const unsubP = subscribePayments(({ data }) => {
      setPayments(data);
      gotP = true;
      settle();
    }, { since });
    return () => {
      unsubV();
      unsubP();
    };
  }, [since]);

  return useMemo(() => {
    const sales = vouchers.filter((v) => v.type !== 'CONSIGNMENT');

    const byTownship = groupSum(sales, (v) => v.township);
    const byShop = groupSum(sales, (v) => v.shopName, (v) => ({
      township: v.township,
      shopId: v.shopId,
    }));

    const consignmentValue = vouchers
      .filter((v) => v.type === 'CONSIGNMENT')
      .reduce((sum, v) => sum + (Number(v.grandTotal) || 0), 0);

    const revenue = sales.reduce((sum, v) => sum + (Number(v.grandTotal) || 0), 0);
    const collected = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    return {
      loading,
      since,
      revenue,
      collected,
      consignmentValue,
      voucherCount: sales.length,
      avgVoucher: sales.length ? Math.round(revenue / sales.length) : 0,
      topTownships: rank(byTownship).slice(0, 8),
      topShops: rank(byShop).slice(0, 8),
      weekly: weeklySeries(sales, payments, since),
    };
  }, [vouchers, payments, loading, since]);
}

function groupSum(rows, keyFn, metaFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row) ?? 'Unassigned';
    const current = map.get(key) ?? { key, value: 0, count: 0, ...(metaFn?.(row) ?? {}) };
    current.value += Number(row.grandTotal) || 0;
    current.count += 1;
    map.set(key, current);
  }
  return map;
}

function rank(map) {
  return [...map.values()].sort((a, b) => b.value - a.value);
}

/** Two same-unit series (kyat) on one axis — sales issued vs cash collected. */
function weeklySeries(sales, payments, since) {
  const weeks = eachWeekOfInterval({ start: since, end: new Date() }, { weekStartsOn: 1 });
  return weeks.map((start) => {
    const end = endOfWeek(start, { weekStartsOn: 1 });
    const inWeek = (value) => {
      const date = toDate(value);
      return date ? isWithinInterval(date, { start, end }) : false;
    };
    return {
      start,
      sales: sales.filter((v) => inWeek(v.issueDate)).reduce((s, v) => s + (Number(v.grandTotal) || 0), 0),
      collected: payments
        .filter((p) => inWeek(p.receivedAt))
        .reduce((s, p) => s + (Number(p.amount) || 0), 0),
    };
  });
}
