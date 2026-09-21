import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ArrowDownToLine, Banknote, Unlock } from 'lucide-react';
import { allocatePayment } from '../../domain/allocation';
import { PAYMENT_METHODS } from '../../lib/constants';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { recordPayment } from '../../services/creditService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/**
 * Partial payments are the normal case, so the allocation is shown BEFORE the
 * money is posted: the accountant sees exactly which vouchers a K 300,000
 * payment will clear, oldest first, and whether it lifts the 14-day lock.
 *
 * The same pure `allocatePayment` runs here and inside the write, so the
 * preview can never disagree with what gets committed — including offline,
 * where the write is queued rather than confirmed.
 */
export function RecordPaymentModal({ open, shop, state, vouchers, onClose, onRecorded }) {
  const { user } = useAuth();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const { register, control, handleSubmit, reset } = useForm({
    defaultValues: { amount: '', method: 'CASH', note: '' },
  });

  const amountRaw = useWatch({ control, name: 'amount' });
  const amount = Number(String(amountRaw).replace(/[^\d]/g, '')) || 0;

  const preview = useMemo(
    () => allocatePayment(vouchers ?? [], amount, state?.evaluatedAt ?? new Date()),
    [vouchers, amount, state?.evaluatedAt],
  );

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit = async (values) => {
    if (amount <= 0) return;
    setSubmitting(true);
    const result = await recordPayment({
      shop,
      vouchers,
      amount,
      method: values.method,
      note: values.note,
      actor: user,
      today: state.evaluatedAt,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.push(result.message, { tone: 'error' });
      return;
    }
    toast.push(
      `Receipt ${result.payment.receiptNo} · K ${fmtMMK(result.applied)} applied to ` +
        `${result.allocations.length} voucher${result.allocations.length === 1 ? '' : 's'}` +
        (result.clearsLock ? '. Shop released — overdue balance cleared.' : '.'),
      { tone: 'success' },
    );
    onRecorded?.(result);
    close();
  };

  if (!open || !shop) return null;

  const quickAmounts = [
    state.oldestAging?.balanceDue,
    state.overdueAmount,
    state.outstanding,
  ].filter((v, i, arr) => v > 0 && arr.indexOf(v) === i);

  return (
    <Modal
      open={open}
      onClose={close}
      width="max-w-2xl"
      title="Record payment"
      subtitle={`${shop.name} · outstanding K ${fmtMMK(state.outstanding)}`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={ArrowDownToLine}
            disabled={submitting || amount <= 0}
            onClick={handleSubmit(onSubmit)}
          >
            {submitting ? 'Posting…' : `Post K ${fmtMMK(amount)}`}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label htmlFor="pay-amount" className="mb-1 block text-xs font-medium text-ink">
              Amount received (MMK)
            </label>
            <input
              id="pay-amount"
              inputMode="numeric"
              autoComplete="off"
              className="w-full rounded-md border border-line-hair bg-surface px-3 py-2 text-lg
                font-semibold tabular-nums text-ink outline-none placeholder:text-ink-muted"
              placeholder="0"
              {...register('amount')}
            />
          </div>
          <div>
            <label htmlFor="pay-method" className="mb-1 block text-xs font-medium text-ink">
              Method
            </label>
            <select
              id="pay-method"
              className="h-[42px] w-full rounded-md border border-line-hair bg-surface px-2 text-sm text-ink outline-none sm:w-40"
              {...register('method')}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {quickAmounts.map((value, i) => (
            <button
              key={value}
              type="button"
              onClick={() => reset({ amount: String(value) }, { keepValues: false })}
              className="rounded border border-line-hair px-2 py-1 text-xs text-ink-secondary hover:bg-raised hover:text-ink"
            >
              {['Oldest voucher', 'Clear overdue', 'Settle all'][i] ?? 'Amount'} · K{' '}
              {fmtMMK(value, { compact: true })}
            </button>
          ))}
        </div>

        {/* Allocation preview — oldest voucher first. */}
        <div className="rounded-card border border-line-hair">
          <div className="flex items-center gap-2 border-b border-line-hair px-3 py-2">
            <Banknote size={14} className="text-ink-muted" aria-hidden="true" />
            <p className="text-xs font-medium text-ink">
              Allocation preview — oldest voucher first
            </p>
          </div>

          {preview.allocations.length === 0 ? (
            <p className="px-3 py-4 text-xs text-ink-secondary">
              Enter an amount to see which vouchers it settles.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-2xs text-ink-secondary">
                  <th className="px-3 py-1.5 font-medium">Voucher</th>
                  <th className="px-3 py-1.5 font-medium">Due</th>
                  <th className="px-3 py-1.5 text-right font-medium">Balance</th>
                  <th className="px-3 py-1.5 text-right font-medium">Applied</th>
                  <th className="px-3 py-1.5 text-right font-medium">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {preview.allocations.map((alloc) => (
                  <tr key={alloc.voucherId} className="border-t border-line-hair">
                    <td className="px-3 py-2 tabular-nums text-ink">
                      {alloc.voucherNo}
                      {alloc.settles ? (
                        <span className="ml-1.5 rounded bg-wash-good px-1 py-0.5 text-2xs text-status-good">
                          settled
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-secondary">
                      {fmtDate(alloc.dueDate, 'dd MMM')}
                      {alloc.daysOverdue > 0 ? (
                        <span className="ml-1 text-status-critical">+{alloc.daysOverdue}d</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">
                      {fmtMMK(alloc.balanceBefore)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">
                      {fmtMMK(alloc.amount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">
                      {fmtMMK(alloc.balanceAfter)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {preview.unapplied > 0 ? (
            <p className="border-t border-line-hair px-3 py-2 text-xs text-ink-secondary">
              K {fmtMMK(preview.unapplied)} exceeds the outstanding balance and will be held as an
              on-account credit for this shop.
            </p>
          ) : null}

          {preview.clearsLock ? (
            <p className="flex items-center gap-1.5 border-t border-line-hair bg-wash-good px-3 py-2 text-xs text-status-good">
              <Unlock size={13} aria-hidden="true" />
              This payment clears every overdue voucher — the shop unlocks immediately.
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="pay-note" className="mb-1 block text-xs font-medium text-ink">
            Note (optional)
          </label>
          <input
            id="pay-note"
            className="w-full rounded-md border border-line-hair bg-surface px-3 py-2 text-sm text-ink outline-none"
            placeholder="e.g. KBZPay ref 8842, collected by Ko Zin"
            {...register('note')}
          />
        </div>
      </form>
    </Modal>
  );
}
