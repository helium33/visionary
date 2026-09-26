import { daysBetween } from '../lib/dates';

/**
 * Purchase-order progress and expense roll-ups — the two things the purchasing
 * screen reasons about that are not landed-cost arithmetic.
 */

export const PO_STATUSES = {
  DRAFT: { key: 'DRAFT', label: 'Draft', tone: 'neutral' },
  ORDERED: { key: 'ORDERED', label: 'Ordered', tone: 'neutral' },
  IN_TRANSIT: { key: 'IN_TRANSIT', label: 'In transit', tone: 'neutral' },
  RECEIVED: { key: 'RECEIVED', label: 'Received', tone: 'good' },
  CLOSED: { key: 'CLOSED', label: 'Closed', tone: 'neutral' },
};

export const EXPENSE_CATEGORIES = {
  SALARY: 'Salaries & commission',
  RENT: 'Rent',
  OFFICE: 'Office & utilities',
  TRANSPORT: 'Transport',
  FEES: 'Bank & payment fees',
  OTHER: 'Other',
};

/**
 * Where a shipment is, and whether it is late.
 *
 * "Late" is the only part that earns a warning colour: a purchase order sitting
 * in ORDERED is not a problem, but one whose expected date has passed without
 * arriving is money already spent and stock the sales team is promising.
 */
export function poArrivalState(po, today = new Date()) {
  const status = PO_STATUSES[po?.status] ?? PO_STATUSES.DRAFT;
  const settled = po?.status === 'RECEIVED' || po?.status === 'CLOSED';

  if (settled || !po?.expectedAt) {
    return { ...status, overdue: false, daysLate: 0, daysUntil: null };
  }

  const daysUntil = daysBetween(today, po.expectedAt);
  const overdue = daysUntil != null && daysUntil < 0;

  return {
    ...status,
    tone: overdue ? 'serious' : status.tone,
    overdue,
    daysLate: overdue ? -daysUntil : 0,
    daysUntil,
  };
}

/** Purchase orders that have been paid for but have not landed yet. */
export function openCommitments(orders = [], today = new Date()) {
  return orders
    .filter((po) => po.status === 'ORDERED' || po.status === 'IN_TRANSIT')
    .map((po) => ({ po, arrival: poArrivalState(po, today) }))
    .sort((a, b) => (a.arrival.daysUntil ?? 0) - (b.arrival.daysUntil ?? 0));
}

/**
 * General expenses by category over a window. This is the second half of net
 * profit: revenue − cost of goods − THIS.
 */
export function summariseExpenses(expenses = [], { from, to = new Date() } = {}) {
  const inWindow = expenses.filter((expense) => {
    const date = new Date(expense.date);
    if (Number.isNaN(date.getTime())) return false;
    if (from && date < from) return false;
    return date <= to;
  });

  const byCategory = new Map();
  let total = 0;

  for (const expense of inWindow) {
    const amount = Number(expense.amount) || 0;
    total += amount;
    const key = expense.category ?? 'OTHER';
    const current = byCategory.get(key) ?? { key, label: EXPENSE_CATEGORIES[key] ?? key, value: 0, count: 0 };
    current.value += amount;
    current.count += 1;
    byCategory.set(key, current);
  }

  return {
    total,
    count: inWindow.length,
    rows: inWindow.sort((a, b) => new Date(b.date) - new Date(a.date)),
    byCategory: [...byCategory.values()].sort((a, b) => b.value - a.value),
  };
}
