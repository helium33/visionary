import { CREDIT_TERM_DAYS } from './credit';
import { EXPENSE_CATEGORIES, summariseExpenses } from './purchasing';
import { toDate } from '../lib/dates';

/**
 * ---------------------------------------------------------------------------
 * NET PROFIT — revenue − cost of goods − general expenses.
 * ---------------------------------------------------------------------------
 * Two decisions make this honest rather than decorative:
 *
 *  1. COST IS READ FROM THE VOUCHER, NOT THE PRODUCT. Every sold line carries
 *     the landed cost it was sold at (see domain/voucher.js). Looking the cost
 *     up on the product today would mean that receiving a shipment at a new
 *     landed price silently restates last quarter's profit — the figure would
 *     move without a single sale changing. Where an older voucher predates that
 *     field the product's current cost is used as a fallback and the result is
 *     flagged `costEstimated`, because a number the business might act on
 *     should say when it is a guess.
 *
 *  2. CONSIGNMENT IS NOT REVENUE. Sample stock on a shop's shelf is our stock
 *     until it converts. Counting it would inflate both revenue and cost.
 */

/** Cost of one sold line: the frame plus the case and cloth that shipped with it. */
export function lineCost(item, productsById) {
  const stored = Number(item?.unitCost);
  if (Number.isFinite(stored) && stored > 0) {
    return {
      unitCost: stored + (Number(item.bundleUnitCost) || 0),
      estimated: false,
    };
  }

  // Fallback for vouchers written before cost was frozen on the line.
  const product = productsById?.get?.(item?.productId);
  return {
    unitCost: Number(product?.costing?.actualCost) || 0,
    estimated: true,
  };
}

export function isRevenueVoucher(voucher) {
  return voucher?.type !== 'CONSIGNMENT' && voucher?.status !== 'VOID';
}

export function computeProfitAndLoss({
  vouchers = [],
  payments = [],
  expenses = [],
  productsById,
  from,
  to = new Date(),
} = {}) {
  const inWindow = (value) => {
    const date = toDate(value);
    if (!date) return false;
    if (from && date < from) return false;
    return date <= to;
  };

  const sales = vouchers.filter(
    (voucher) => isRevenueVoucher(voucher) && inWindow(voucher.issueDate),
  );

  let grossSales = 0;
  let discounts = 0;
  let revenue = 0;
  let cogs = 0;
  let pieces = 0;
  let estimatedLines = 0;
  let costedLines = 0;

  for (const voucher of sales) {
    grossSales += Number(voucher.subtotal) || 0;
    discounts += Number(voucher.discount) || 0;
    revenue += Number(voucher.grandTotal) || 0;

    for (const item of voucher.items ?? []) {
      const qty = Number(item.qty) || 0;
      const { unitCost, estimated } = lineCost(item, productsById);
      cogs += qty * unitCost;
      pieces += qty;
      costedLines += 1;
      if (estimated) estimatedLines += 1;
    }
  }

  const expenseSummary = summariseExpenses(expenses, { from, to });
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expenseSummary.total;

  const collected = payments
    .filter((payment) => inWindow(payment.receivedAt))
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

  return {
    from,
    to,
    grossSales: round0(grossSales),
    discounts: round0(discounts),
    revenue: round0(revenue),
    cogs: round0(cogs),
    grossProfit: round0(grossProfit),
    grossMarginPct: revenue ? round1((grossProfit / revenue) * 100) : 0,
    expenses: expenseSummary,
    netProfit: round0(netProfit),
    netMarginPct: revenue ? round1((netProfit / revenue) * 100) : 0,
    voucherCount: sales.length,
    pieces,
    avgVoucher: sales.length ? Math.round(revenue / sales.length) : 0,
    collected: round0(collected),
    // Cash actually in the door against revenue booked — the gap is credit.
    collectionRatePct: revenue ? round1((collected / revenue) * 100) : 0,
    costEstimated: estimatedLines > 0,
    estimatedLines,
    costedLines,
  };
}

/**
 * The revenue-to-net-profit bridge, as a waterfall reads it: start at revenue,
 * take out what it cost, stop at gross, take out what running the business
 * cost, land on net.
 */
export function profitBridge(pnl) {
  return [
    { key: 'REVENUE', label: 'Revenue', value: pnl.revenue, type: 'total' },
    { key: 'COGS', label: 'Cost of goods', value: -pnl.cogs, type: 'decrease' },
    { key: 'GROSS', label: 'Gross profit', value: pnl.grossProfit, type: 'subtotal' },
    ...pnl.expenses.byCategory.map((category) => ({
      key: category.key,
      label: EXPENSE_CATEGORIES[category.key] ?? category.label,
      value: -category.value,
      type: 'decrease',
    })),
    { key: 'NET', label: 'Net profit', value: pnl.netProfit, type: 'total' },
  ];
}

/**
 * Which models actually make money. Revenue alone hides a model that sells
 * well at a thin margin — the profit column is what decides reorders.
 */
export function profitByModel({ vouchers = [], productsById, from, to = new Date() } = {}) {
  const models = new Map();

  for (const voucher of vouchers) {
    if (!isRevenueVoucher(voucher)) continue;
    const date = toDate(voucher.issueDate);
    if (!date || (from && date < from) || date > to) continue;

    for (const item of voucher.items ?? []) {
      const key = item.modelNo ?? item.productId ?? 'Unknown';
      const qty = Number(item.qty) || 0;
      const { unitCost } = lineCost(item, productsById);
      const current = models.get(key) ?? {
        key,
        productId: item.productId,
        revenue: 0,
        cogs: 0,
        qty: 0,
        count: 0,
      };
      current.revenue += Number(item.lineTotal) || 0;
      current.cogs += qty * unitCost;
      current.qty += qty;
      current.count += 1;
      models.set(key, current);
    }
  }

  return [...models.values()]
    .map((row) => ({
      ...row,
      profit: round0(row.revenue - row.cogs),
      marginPct: row.revenue ? round1(((row.revenue - row.cogs) / row.revenue) * 100) : 0,
      value: round0(row.revenue - row.cogs), // what BarList ranks on
    }))
    .sort((a, b) => b.profit - a.profit);
}

export { CREDIT_TERM_DAYS };

function round0(n) {
  return Math.round(Number(n) || 0);
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}
