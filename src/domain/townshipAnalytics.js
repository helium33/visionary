import { DISTRICT_ORDER, DISTRICT_TOWNSHIPS, groupByDistrict } from '../constants/districts';
import { toDate } from '../lib/dates';
import { isRevenueVoucher } from './profit';

/**
 * ---------------------------------------------------------------------------
 * SHOPS & TOWNSHIPS ANALYTICS — district, township and shop rollups.
 * ---------------------------------------------------------------------------
 * "Revenue" and "volume" (pieces sold) are reused, not redefined, from the
 * rest of the reporting stack:
 *
 *  • `isRevenueVoucher()` (domain/profit.js) is the one place that decides
 *    what counts as a sale — consignment stock and voided vouchers excluded.
 *    A second copy of that rule here could drift from the P&L's and make the
 *    Reports tabs disagree about the same period's revenue.
 *  • Volume sums `items[].qty`, the same field `computeProfitAndLoss` sums
 *    for `pieces` — one sold pair of glasses is one unit everywhere.
 *  • District is never stored — every row below is grouped by
 *    `getDistrictForTownship(voucher.township)` (constants/districts.js) at
 *    call time, so re-mapping a township's district is a one-line edit that
 *    reclassifies every past voucher the next time a report runs.
 *
 * Every function here takes the RAW voucher list (not pre-filtered) and
 * applies `isRevenueVoucher` itself, so a caller can never forget the filter
 * and silently count consignment stock as revenue.
 */

/**
 * Same window convention `profitByModel`/`computeCommissions` use: callers
 * pass the raw multi-year voucher list plus `{ from, to }`, not a
 * pre-filtered array, so there is one place per report that decides what
 * "in this period" means.
 */
function windowed(vouchers, from, to) {
  if (!from && !to) return vouchers;
  return vouchers.filter((voucher) => {
    const date = toDate(voucher.issueDate);
    if (!date) return false;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
}

function volumeOf(voucher) {
  if (!Array.isArray(voucher.items)) return 0;
  return voucher.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
}

function emptyTotals(key) {
  return { key, revenue: 0, volume: 0, count: 0 };
}

function addVoucher(row, voucher) {
  row.revenue += Number(voucher.grandTotal) || 0;
  row.volume += volumeOf(voucher);
  row.count += 1;
  return row;
}

/**
 * One row per Yangon district, always in `DISTRICT_ORDER` — even a district
 * with zero sales in the window still gets a bar, so the axis never quietly
 * shrinks to "whichever districts happened to sell something". Vouchers
 * whose township doesn't map to any district (see districts.js's coverage
 * note) are rolled into `unassigned` rather than dropped, so
 * `rows` + `unassigned` always reconciles to every revenue voucher in the
 * input.
 */
export function districtSales(vouchers = [], { from, to } = {}) {
  const sales = windowed(vouchers, from, to).filter(isRevenueVoucher);
  const { buckets, unassigned } = groupByDistrict(sales, (v) => v.township);

  const rows = DISTRICT_ORDER.map((key) =>
    buckets.get(key).reduce(addVoucher, emptyTotals(key)),
  );

  return {
    rows,
    unassigned: unassigned.reduce(addVoucher, emptyTotals('UNASSIGNED')),
  };
}

/**
 * Every township mapped to `district`, revenue + volume + order count,
 * sorted worst-to-best by revenue. Zero-filled for a township with no sales
 * in the window — the same "show the full category, not just the ones with
 * data" rule `districtSales` follows — and returns `[]` for an unrecognised
 * district key rather than throwing, so a stale/typo'd selector value just
 * renders an empty chart.
 */
export function townshipSales(vouchers = [], district, { from, to } = {}) {
  const townships = DISTRICT_TOWNSHIPS[district];
  if (!townships) return [];

  const sales = windowed(vouchers, from, to)
    .filter(isRevenueVoucher)
    .filter((v) => v.township && townships.includes(v.township));
  const byTownship = new Map(townships.map((name) => [name, emptyTotals(name)]));

  for (const voucher of sales) {
    addVoucher(byTownship.get(voucher.township), voucher);
  }

  return [...byTownship.values()].sort((a, b) => b.revenue - a.revenue);
}

/**
 * Top shops by revenue. Order count rides as a plain field on each row
 * rather than a second chart axis — revenue (the ranking measure) and order
 * count (a different scale entirely) never share one axis in this app's
 * charts; the leaderboard shows order count as a direct label instead.
 */
export function topShops(vouchers = [], { limit = 10, from, to } = {}) {
  const sales = windowed(vouchers, from, to).filter(isRevenueVoucher);
  const byShop = new Map();

  for (const voucher of sales) {
    const key = voucher.shopId ?? voucher.shopName;
    if (!key) continue;
    const row =
      byShop.get(key) ??
      { key, name: voucher.shopName ?? key, township: voucher.township, revenue: 0, orders: 0 };
    row.revenue += Number(voucher.grandTotal) || 0;
    row.orders += 1;
    byShop.set(key, row);
  }

  return [...byShop.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

/** The district with the most revenue — a sensible default for a drill-down selector. */
export function leadingDistrict(rows) {
  return rows.reduce((best, row) => (row.revenue > best.revenue ? row : best), rows[0]).key;
}
