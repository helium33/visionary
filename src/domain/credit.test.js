import { describe, expect, it } from 'vitest';
import { addDays } from 'date-fns';
import {
  CREDIT_STATUS,
  ageVoucher,
  canIssueVoucher,
  evaluatePortfolio,
  evaluateShopCredit,
  simplifiedAgeingBuckets,
} from './credit';
import { allocatePayment } from './allocation';

const TODAY = new Date('2026-09-21T10:00:00+06:30');

/** A voucher issued `daysAgo` days before TODAY with the given open balance. */
function voucher(daysAgo, balanceDue, extra = {}) {
  const issueDate = addDays(TODAY, -daysAgo);
  return {
    id: `v-${daysAgo}-${balanceDue}`,
    voucherNo: `VN-${daysAgo}`,
    shopId: 'shop-1',
    type: 'SALE',
    status: balanceDue > 0 ? 'ISSUED' : 'PAID',
    issueDate,
    dueDate: addDays(issueDate, 14),
    grandTotal: balanceDue,
    paidAmount: 0,
    balanceDue,
    ...extra,
  };
}

const shop = (extra = {}) => ({ id: 'shop-1', name: 'Latha Optic', creditLimit: 0, ...extra });

describe('ageVoucher — the 14-day boundary', () => {
  it.each([
    [0, 14, 0, 'CURRENT'],
    [11, 3, 0, 'CURRENT'],
    [12, 2, 0, 'APPROACHING'],
    [14, 0, 0, 'APPROACHING'], // due today is not yet overdue
    [15, -1, 1, 'OVERDUE_1_7'],
    [21, -7, 7, 'OVERDUE_1_7'],
    [22, -8, 8, 'OVERDUE_8_PLUS'],
  ])('day %i → %i until due, %i overdue, bucket %s', (daysAgo, untilDue, overdue, bucket) => {
    const aging = ageVoucher(voucher(daysAgo, 100_000), TODAY);
    expect(aging.daysUntilDue).toBe(untilDue);
    expect(aging.daysOverdue).toBe(overdue);
    expect(aging.bucket).toBe(bucket);
  });
});

describe('evaluateShopCredit', () => {
  it('is ACTIVE inside the term', () => {
    const state = evaluateShopCredit(shop(), [voucher(3, 500_000)], TODAY);
    expect(state.status).toBe(CREDIT_STATUS.ACTIVE);
    expect(state.outstanding).toBe(500_000);
    expect(state.overdueAmount).toBe(0);
  });

  it('raises WATCH at day 12 — the approaching-due alert', () => {
    const state = evaluateShopCredit(shop(), [voucher(12, 500_000)], TODAY);
    expect(state.status).toBe(CREDIT_STATUS.WATCH);
  });

  it('LOCKS the shop once any voucher passes 14 days', () => {
    const state = evaluateShopCredit(shop(), [voucher(15, 200_000), voucher(2, 800_000)], TODAY);
    expect(state.status).toBe(CREDIT_STATUS.LOCKED);
    expect(state.overdueAmount).toBe(200_000); // only the aged voucher is overdue
    expect(state.outstanding).toBe(1_000_000);
    expect(state.maxDaysOverdue).toBe(1);
  });

  it('ignores consignment stock — sample stock carries no debt', () => {
    const consigned = voucher(40, 900_000, { type: 'CONSIGNMENT' });
    const state = evaluateShopCredit(shop(), [consigned], TODAY);
    expect(state.status).toBe(CREDIT_STATUS.ACTIVE);
    expect(state.outstanding).toBe(0);
  });

  it('ignores settled vouchers however old', () => {
    const state = evaluateShopCredit(shop(), [voucher(90, 0)], TODAY);
    expect(state.status).toBe(CREDIT_STATUS.ACTIVE);
  });

  it('derives status from the clock, not from a stored flag', () => {
    // Same document, two different "todays" — the stored status field is stale
    // by construction, which is exactly why nothing reads it.
    const v = voucher(10, 300_000);
    const staleShop = shop({ credit: { status: 'ACTIVE' } });
    expect(evaluateShopCredit(staleShop, [v], TODAY).status).toBe(CREDIT_STATUS.ACTIVE);
    const later = addDays(TODAY, 6); // voucher is now 16 days old
    expect(evaluateShopCredit(staleShop, [v], later).status).toBe(CREDIT_STATUS.LOCKED);
  });

  it('honours a live admin override but not an expired one', () => {
    const vouchers = [voucher(20, 400_000)];
    const live = shop({ credit: { override: { expiresAt: addDays(TODAY, 1), by: 'admin' } } });
    const expired = shop({ credit: { override: { expiresAt: addDays(TODAY, -1), by: 'admin' } } });
    expect(evaluateShopCredit(live, vouchers, TODAY).override).toBeTruthy();
    expect(evaluateShopCredit(expired, vouchers, TODAY).override).toBeNull();
  });
});

describe('canIssueVoucher — the gate every voucher passes through', () => {
  it('blocks a locked shop and asks for the master password', () => {
    const state = evaluateShopCredit(shop(), [voucher(18, 250_000)], TODAY);
    const gate = canIssueVoucher(state, { amount: 100_000 });
    expect(gate.allowed).toBe(false);
    expect(gate.requiresOverride).toBe(true);
    expect(gate.code).toBe('OVERDUE_LOCK');
  });

  it('lets a locked shop through while an override is live', () => {
    const overridden = shop({ credit: { override: { expiresAt: addDays(TODAY, 1) } } });
    const state = evaluateShopCredit(overridden, [voucher(18, 250_000)], TODAY);
    expect(canIssueVoucher(state, { amount: 100_000 }).allowed).toBe(true);
  });

  it('blocks a voucher that would breach the credit limit', () => {
    const state = evaluateShopCredit(shop({ creditLimit: 1_000_000 }), [voucher(2, 900_000)], TODAY);
    const gate = canIssueVoucher(state, { amount: 200_000 });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe('OVER_LIMIT');
  });

  it('always allows consignment transfers', () => {
    const state = evaluateShopCredit(shop(), [voucher(30, 500_000)], TODAY);
    expect(canIssueVoucher(state, { amount: 1, isConsignment: true }).allowed).toBe(true);
  });
});

describe('allocatePayment — oldest voucher first', () => {
  const vouchers = [voucher(2, 300_000), voucher(20, 200_000), voucher(9, 150_000)];

  it('clears the oldest voucher before touching newer ones', () => {
    const { allocations, applied, unapplied } = allocatePayment(vouchers, 250_000, TODAY);
    expect(allocations.map((a) => a.voucherNo)).toEqual(['VN-20', 'VN-9']);
    expect(allocations[0]).toMatchObject({ amount: 200_000, settles: true });
    expect(allocations[1]).toMatchObject({ amount: 50_000, settles: false, balanceAfter: 100_000 });
    expect(applied).toBe(250_000);
    expect(unapplied).toBe(0);
  });

  it('reports an overpayment as an on-account credit', () => {
    const { applied, unapplied } = allocatePayment(vouchers, 700_000, TODAY);
    expect(applied).toBe(650_000);
    expect(unapplied).toBe(50_000);
  });

  it('flags the payment that lifts the lock', () => {
    expect(allocatePayment(vouchers, 199_000, TODAY).clearsLock).toBe(false);
    expect(allocatePayment(vouchers, 200_000, TODAY).clearsLock).toBe(true);
  });
});

describe('evaluatePortfolio', () => {
  it('rolls shops up and sorts the worst offender first', () => {
    const shops = [
      { id: 'a', name: 'A', township: 'Latha' },
      { id: 'b', name: 'B', township: 'Kamayut' },
      { id: 'c', name: 'C', township: 'Latha' },
    ];
    const vouchers = [
      { ...voucher(3, 100_000), id: 'v1', shopId: 'a' },
      { ...voucher(25, 400_000), id: 'v2', shopId: 'b' },
      { ...voucher(13, 250_000), id: 'v3', shopId: 'c' },
    ];
    const { rows, totals } = evaluatePortfolio(shops, vouchers, TODAY);
    expect(rows[0].shop.id).toBe('b');
    expect(rows[0].state.status).toBe(CREDIT_STATUS.LOCKED);
    expect(totals.outstanding).toBe(750_000);
    expect(totals.overdueAmount).toBe(400_000);
    expect(totals.counts).toMatchObject({ LOCKED: 1, WATCH: 1, ACTIVE: 1 });
    expect(totals.buckets.OVERDUE_8_PLUS).toBe(400_000);
    expect(totals.buckets.APPROACHING).toBe(250_000);
  });
});

describe('simplifiedAgeingBuckets — the 3-band chart regrouping', () => {
  it('splits open balance into 0–7 / 8–14 / overdue, reusing ageVoucher’s day math', () => {
    const shops = [{ id: 'a', name: 'A', township: 'Latha' }];
    const vouchers = [
      { ...voucher(3, 100_000), id: 'v1', shopId: 'a' }, // day 3 → 0-7
      { ...voucher(10, 200_000), id: 'v2', shopId: 'a' }, // day 10 → 8-14
      { ...voucher(20, 50_000), id: 'v3', shopId: 'a' }, // overdue
    ];
    const portfolio = evaluatePortfolio(shops, vouchers, TODAY);
    const buckets = simplifiedAgeingBuckets(portfolio);

    expect(buckets).toEqual([
      { key: 'DAYS_0_7', tone: 'good', value: 100_000 },
      { key: 'DAYS_8_14', tone: 'warning', value: 200_000 },
      { key: 'OVERDUE', tone: 'critical', value: 50_000 },
    ]);
  });

  it('agrees with evaluatePortfolio about who is overdue — never a second opinion', () => {
    const shops = [{ id: 'a', name: 'A', township: 'Latha' }];
    // Day 15 is overdue under ageVoucher (>14 days); the bucket split must
    // land it in OVERDUE, not in an 8-14 band that would understate risk.
    const vouchers = [{ ...voucher(15, 300_000), id: 'v1', shopId: 'a' }];
    const portfolio = evaluatePortfolio(shops, vouchers, TODAY);
    const buckets = simplifiedAgeingBuckets(portfolio);

    expect(portfolio.totals.overdueAmount).toBe(300_000);
    expect(buckets.find((b) => b.key === 'OVERDUE').value).toBe(300_000);
    expect(buckets.find((b) => b.key === 'DAYS_8_14').value).toBe(0);
  });

  it('returns zeroed buckets rather than an empty array for a clean portfolio', () => {
    const portfolio = evaluatePortfolio([], [], TODAY);
    expect(simplifiedAgeingBuckets(portfolio)).toEqual([
      { key: 'DAYS_0_7', tone: 'good', value: 0 },
      { key: 'DAYS_8_14', tone: 'warning', value: 0 },
      { key: 'OVERDUE', tone: 'critical', value: 0 },
    ]);
  });
});
