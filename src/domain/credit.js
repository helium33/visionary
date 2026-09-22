import { addDaysTo, daysBetween, toDate } from '../lib/dates';

/**
 * ---------------------------------------------------------------------------
 * 14-DAY B2B CREDIT RULES — the single source of truth for the whole system.
 * ---------------------------------------------------------------------------
 *
 * Everything here is a PURE function of (documents, today). Nothing reads the
 * clock on its own and nothing touches Firestore. Three reasons that matters:
 *
 *  1. OFFLINE CORRECTNESS. A shop that was ACTIVE when the sales rep left the
 *     warehouse at 08:00 can be OVERDUE by 15:00 without a single document
 *     changing. If "LOCKED" were only a stored field, a rep with no signal
 *     would keep writing vouchers against a shop that crossed its due date
 *     hours earlier. So the stored `shop.credit.*` fields are a CACHE for
 *     queries and reporting; the status the UI enforces is always RE-DERIVED
 *     from `dueDate` against the current date.
 *  2. TESTABILITY. `today` is an argument, so every boundary (day 11/12/13/14/
 *     15) is a unit test rather than a clock-fiddling exercise.
 *  3. ONE RULE, ONE PLACE. The dashboard, the voucher screen and the Cloud
 *     Function that writes the nightly cache all call these same functions, so
 *     they can never disagree about who is locked.
 */

export const CREDIT_TERM_DAYS = 14; // default; overridable per shop
export const APPROACHING_DAY = 12; // visual warning at day 12 of 14
export const GRACE_DAYS = 0; // days past due before the hard lock engages

export const CREDIT_STATUS = {
  ACTIVE: 'ACTIVE',
  WATCH: 'WATCH', // day 12–14: approaching due
  OVERDUE: 'OVERDUE', // past due, still inside the grace window
  LOCKED: 'LOCKED', // past due + grace — new vouchers blocked
};

export const STATUS_META = {
  [CREDIT_STATUS.ACTIVE]: { label: 'Active', tone: 'good', icon: 'check' },
  [CREDIT_STATUS.WATCH]: { label: 'Approaching due', tone: 'warning', icon: 'clock' },
  [CREDIT_STATUS.OVERDUE]: { label: 'Overdue', tone: 'serious', icon: 'alert' },
  [CREDIT_STATUS.LOCKED]: { label: 'Locked', tone: 'critical', icon: 'lock' },
};

export const AGING_BUCKETS = [
  { key: 'CURRENT', label: 'Current', range: 'day 1–11', tone: 'good' },
  { key: 'APPROACHING', label: 'Due soon', range: 'day 12–14', tone: 'warning' },
  { key: 'OVERDUE_1_7', label: 'Overdue', range: '1–7 days', tone: 'serious' },
  { key: 'OVERDUE_8_PLUS', label: 'Overdue', range: '8+ days', tone: 'critical' },
];

const OPEN_VOUCHER_STATUSES = new Set(['ISSUED', 'PARTIAL', 'OVERDUE']);

/** Vouchers that put money on the shop's account. */
export function isOpenReceivable(voucher) {
  if (!voucher) return false;
  // Consignment stock is not revenue and carries no debt until converted.
  if (voucher.type === 'CONSIGNMENT') return false;
  if (!OPEN_VOUCHER_STATUSES.has(voucher.status)) return false;
  return Number(voucher.balanceDue) > 0;
}

export function computeDueDate(issueDate, termDays = CREDIT_TERM_DAYS) {
  return addDaysTo(issueDate, termDays);
}

/**
 * Per-voucher ageing. `daysOverdue > 0` means the 14-day term has elapsed.
 */
export function ageVoucher(voucher, today = new Date()) {
  const issueDate = toDate(voucher.issueDate);
  const termDays = voucher.termDays ?? CREDIT_TERM_DAYS;
  const dueDate = toDate(voucher.dueDate) ?? computeDueDate(issueDate, termDays);

  const daysOutstanding = daysBetween(issueDate, today) ?? 0;
  const daysUntilDue = daysBetween(today, dueDate);
  const daysOverdue = daysUntilDue == null ? 0 : Math.max(0, -daysUntilDue);

  let bucket = 'CURRENT';
  if (daysOverdue >= 8) bucket = 'OVERDUE_8_PLUS';
  else if (daysOverdue >= 1) bucket = 'OVERDUE_1_7';
  else if (daysOutstanding >= APPROACHING_DAY) bucket = 'APPROACHING';

  return {
    dueDate,
    termDays,
    daysOutstanding,
    daysUntilDue,
    daysOverdue,
    isOverdue: daysOverdue > 0,
    isApproaching: bucket === 'APPROACHING',
    bucket,
    balanceDue: Number(voucher.balanceDue) || 0,
  };
}

/**
 * Rolls a shop's open vouchers into the credit state the UI enforces.
 *
 * @param {object}   shop      shop document (uses creditTermDays, creditLimit, credit.override)
 * @param {object[]} vouchers  that shop's vouchers (open ones are picked out here)
 * @param {Date}     today
 */
export function evaluateShopCredit(shop, vouchers = [], today = new Date()) {
  const open = vouchers.filter(isOpenReceivable);
  const aged = open
    .map((voucher) => ({ voucher, aging: ageVoucher(voucher, today) }))
    .sort((a, b) => a.aging.dueDate - b.aging.dueDate); // oldest due first = FIFO order

  const buckets = { CURRENT: 0, APPROACHING: 0, OVERDUE_1_7: 0, OVERDUE_8_PLUS: 0 };
  let outstanding = 0;
  let overdueAmount = 0;
  let maxDaysOverdue = 0;

  for (const { aging } of aged) {
    outstanding += aging.balanceDue;
    buckets[aging.bucket] += aging.balanceDue;
    if (aging.isOverdue) {
      overdueAmount += aging.balanceDue;
      maxDaysOverdue = Math.max(maxDaysOverdue, aging.daysOverdue);
    }
  }

  const oldest = aged[0] ?? null;
  const override = readOverride(shop, today);

  let status = CREDIT_STATUS.ACTIVE;
  if (maxDaysOverdue > GRACE_DAYS) status = CREDIT_STATUS.LOCKED;
  else if (maxDaysOverdue > 0) status = CREDIT_STATUS.OVERDUE;
  else if (oldest?.aging.isApproaching) status = CREDIT_STATUS.WATCH;

  // A manual hold from the accountant locks a shop regardless of ageing.
  if (shop?.credit?.manualHold) status = CREDIT_STATUS.LOCKED;

  const creditLimit = Number(shop?.creditLimit) || 0;
  const overLimit = creditLimit > 0 && outstanding > creditLimit;

  return {
    shopId: shop?.id ?? null,
    status,
    outstanding,
    overdueAmount,
    currentAmount: outstanding - overdueAmount,
    maxDaysOverdue,
    buckets,
    openCount: aged.length,
    oldestVoucher: oldest?.voucher ?? null,
    oldestAging: oldest?.aging ?? null,
    creditLimit,
    availableCredit: creditLimit > 0 ? Math.max(0, creditLimit - outstanding) : null,
    overLimit,
    override,
    agedVouchers: aged,
    evaluatedAt: today,
  };
}

/** An admin override is only live while it has not expired. */
function readOverride(shop, today) {
  const override = shop?.credit?.override;
  if (!override) return null;
  const expiresAt = toDate(override.expiresAt);
  if (!expiresAt || expiresAt <= today) return null;
  return { ...override, expiresAt };
}

/**
 * THE GATE. Every voucher-creation path must clear this before writing.
 *
 * Returns `allowed:false, requiresOverride:true` rather than throwing, so the
 * UI can offer the master-password dialog instead of a dead end.
 */
export function canIssueVoucher(creditState, { amount = 0, isConsignment = false } = {}) {
  // `details` carries the figures behind `reason`, so the UI can word the
  // explanation in the reader's language rather than show this English.
  const deny = (code, reason, details = {}) => ({
    allowed: false,
    requiresOverride: true,
    code,
    reason,
    details,
  });

  // Consignment moves sample stock, not money — never blocked by ageing.
  if (isConsignment) {
    return { allowed: true, requiresOverride: false, code: 'CONSIGNMENT', reason: null };
  }

  if (creditState.override) {
    return {
      allowed: true,
      requiresOverride: false,
      code: 'OVERRIDE_ACTIVE',
      reason: `Admin override active until ${creditState.override.expiresAt.toLocaleString()}`,
    };
  }

  if (creditState.status === CREDIT_STATUS.LOCKED) {
    if (creditState.shopManualHold) {
      return deny('MANUAL_HOLD', 'Account is on manual hold by the accountant.');
    }
    return deny(
      'OVERDUE_LOCK',
      `Shop is ${creditState.maxDaysOverdue} day(s) past the ${CREDIT_TERM_DAYS}-day term ` +
        `on K ${creditState.overdueAmount.toLocaleString()}.`,
      { days: creditState.maxDaysOverdue, term: CREDIT_TERM_DAYS, amount: creditState.overdueAmount },
    );
  }

  const projected = creditState.outstanding + (Number(amount) || 0);
  if (creditState.creditLimit > 0 && projected > creditState.creditLimit) {
    return deny(
      'OVER_LIMIT',
      `This voucher takes the balance to K ${projected.toLocaleString()}, over the ` +
        `K ${creditState.creditLimit.toLocaleString()} limit.`,
      { projected, limit: creditState.creditLimit },
    );
  }

  return { allowed: true, requiresOverride: false, code: 'OK', reason: null };
}

/**
 * Portfolio roll-up for the dashboard. One pass over every open voucher.
 */
export function evaluatePortfolio(shops = [], vouchers = [], today = new Date()) {
  const byShop = new Map();
  for (const voucher of vouchers) {
    if (!byShop.has(voucher.shopId)) byShop.set(voucher.shopId, []);
    byShop.get(voucher.shopId).push(voucher);
  }

  const states = shops.map((shop) =>
    evaluateShopCredit(shop, byShop.get(shop.id) ?? [], today),
  );

  const totals = {
    outstanding: 0,
    overdueAmount: 0,
    currentAmount: 0,
    buckets: { CURRENT: 0, APPROACHING: 0, OVERDUE_1_7: 0, OVERDUE_8_PLUS: 0 },
    counts: { ACTIVE: 0, WATCH: 0, OVERDUE: 0, LOCKED: 0 },
    shopsWithDebt: 0,
  };

  const rows = states.map((state, index) => {
    const shop = shops[index];
    totals.outstanding += state.outstanding;
    totals.overdueAmount += state.overdueAmount;
    totals.currentAmount += state.currentAmount;
    totals.counts[state.status] += 1;
    if (state.outstanding > 0) totals.shopsWithDebt += 1;
    for (const key of Object.keys(totals.buckets)) {
      totals.buckets[key] += state.buckets[key];
    }
    return { shop, state };
  });

  // Worst first: locked before overdue, then by days past due, then by amount.
  const severity = {
    [CREDIT_STATUS.LOCKED]: 3,
    [CREDIT_STATUS.OVERDUE]: 2,
    [CREDIT_STATUS.WATCH]: 1,
    [CREDIT_STATUS.ACTIVE]: 0,
  };
  rows.sort((a, b) => {
    const bySeverity = severity[b.state.status] - severity[a.state.status];
    if (bySeverity) return bySeverity;
    const byDays = b.state.maxDaysOverdue - a.state.maxDaysOverdue;
    if (byDays) return byDays;
    return b.state.outstanding - a.state.outstanding;
  });

  return { rows, totals, evaluatedAt: today };
}

/** Shops that should be chased today: locked, overdue, or at day 12–14. */
export function collectionWorklist(portfolio) {
  return portfolio.rows.filter(
    ({ state }) => state.status !== CREDIT_STATUS.ACTIVE && state.outstanding > 0,
  );
}

/**
 * The same open-voucher ageing the worklist and the 4-bucket StackedBar
 * already use (`ageVoucher`), regrouped into the coarser 3-band split a quick
 * "how much of our debt is close to the wall" chart wants: 0–7 days into the
 * term, 8–14, and anything already past it. This is a presentation-layer
 * regrouping, not a second ageing rule — the day math is `ageVoucher`'s, so
 * this can never disagree with the lock logic or the detailed ageing bar
 * about which bucket a voucher falls into.
 */
export const DEBT_AGEING_BUCKETS = [
  { key: 'DAYS_0_7', tone: 'good' },
  { key: 'DAYS_8_14', tone: 'warning' },
  { key: 'OVERDUE', tone: 'critical' },
];

export function simplifiedAgeingBuckets(portfolio) {
  const totals = { DAYS_0_7: 0, DAYS_8_14: 0, OVERDUE: 0 };

  for (const { state } of portfolio.rows) {
    for (const { voucher, aging } of state.agedVouchers) {
      const bucket = aging.isOverdue ? 'OVERDUE' : aging.daysOutstanding >= 8 ? 'DAYS_8_14' : 'DAYS_0_7';
      totals[bucket] += Number(voucher.balanceDue) || 0;
    }
  }

  return DEBT_AGEING_BUCKETS.map((bucket) => ({ ...bucket, value: totals[bucket.key] }));
}
