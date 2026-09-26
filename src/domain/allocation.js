import { ageVoucher, isOpenReceivable } from './credit';

/**
 * FIFO payment allocation — "oldest voucher first".
 *
 * Partial payments are the norm in Yangon wholesale: a shop pays K 300,000
 * against three open vouchers and expects the oldest to clear first, because
 * that is the one about to trip the 14-day lock. Allocation is computed here
 * (pure) and applied in a single Firestore batch so a rep who is offline sees
 * exactly the same allocation the server will later confirm.
 *
 * @returns {{allocations: object[], applied: number, unapplied: number, clearsLock: boolean}}
 */
export function allocatePayment(vouchers, amount, today = new Date()) {
  let remaining = Math.max(0, Number(amount) || 0);

  const queue = vouchers
    .filter(isOpenReceivable)
    .map((voucher) => ({ voucher, aging: ageVoucher(voucher, today) }))
    .sort((a, b) => {
      // Oldest due date first; tie-break on voucher number for determinism so
      // an offline client and the server never disagree on the order.
      const byDue = a.aging.dueDate - b.aging.dueDate;
      if (byDue) return byDue;
      return String(a.voucher.voucherNo).localeCompare(String(b.voucher.voucherNo));
    });

  const allocations = [];
  for (const { voucher, aging } of queue) {
    if (remaining <= 0) break;
    const applied = Math.min(remaining, aging.balanceDue);
    if (applied <= 0) continue;
    remaining -= applied;
    const balanceAfter = round0(aging.balanceDue - applied);
    allocations.push({
      voucherId: voucher.id,
      voucherNo: voucher.voucherNo,
      dueDate: aging.dueDate,
      daysOverdue: aging.daysOverdue,
      balanceBefore: aging.balanceDue,
      amount: round0(applied),
      balanceAfter,
      settles: balanceAfter === 0,
    });
  }

  const applied = round0(allocations.reduce((sum, a) => sum + a.amount, 0));

  // Does this payment clear every voucher that is currently past due?
  const overdueBefore = queue.filter((q) => q.aging.isOverdue);
  const clearsLock =
    overdueBefore.length > 0 &&
    overdueBefore.every((q) => {
      const alloc = allocations.find((a) => a.voucherId === q.voucher.id);
      return alloc?.settles;
    });

  return {
    allocations,
    applied,
    unapplied: round0(remaining), // becomes an on-account credit for the shop
    clearsLock,
  };
}

/**
 * A defective-return credit note works the same way, but is applied to the
 * voucher the goods came from when that voucher is still open, and falls back
 * to FIFO otherwise.
 */
export function allocateCreditNote(vouchers, amount, { sourceVoucherId } = {}, today = new Date()) {
  const source = vouchers.find((v) => v.id === sourceVoucherId && isOpenReceivable(v));
  if (!source) return allocatePayment(vouchers, amount, today);

  const aging = ageVoucher(source, today);
  const applied = Math.min(Number(amount) || 0, aging.balanceDue);
  const head = [
    {
      voucherId: source.id,
      voucherNo: source.voucherNo,
      dueDate: aging.dueDate,
      daysOverdue: aging.daysOverdue,
      balanceBefore: aging.balanceDue,
      amount: round0(applied),
      balanceAfter: round0(aging.balanceDue - applied),
      settles: round0(aging.balanceDue - applied) === 0,
    },
  ];

  const spillover = (Number(amount) || 0) - applied;
  const rest =
    spillover > 0
      ? allocatePayment(
          vouchers.filter((v) => v.id !== source.id),
          spillover,
          today,
        )
      : { allocations: [], unapplied: 0 };

  const allocations = [...head, ...rest.allocations];
  return {
    allocations,
    applied: round0(allocations.reduce((sum, a) => sum + a.amount, 0)),
    unapplied: round0(rest.unapplied ?? 0),
    clearsLock: false,
  };
}

/** Kyat has no sub-unit in practice — keep every stored figure a whole number. */
function round0(n) {
  return Math.round(Number(n) || 0);
}
