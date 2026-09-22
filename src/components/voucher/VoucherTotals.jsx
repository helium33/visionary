import { CalendarClock, Percent, Save, Wallet } from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { DISCOUNT_MODES } from '../../domain/voucher';
import { PAYMENT_METHODS } from '../../lib/constants';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { Button } from '../ui/Button';

/**
 * The invoice panel — and the only place a rep sees the shop's whole position.
 *
 * The order of rows is the order the printed voucher reads, deliberately:
 * this voucher, then what was already owed, then what is being paid now, then
 * the new balance and the date it falls due. A shop owner checks those five
 * numbers in that sequence, so the screen and the paper must not diverge.
 */
export function VoucherTotals({
  totals,
  discount,
  discountMode,
  onDiscountChange,
  onDiscountModeChange,
  payment,
  onPaymentChange,
  paymentMethod,
  onPaymentMethodChange,
  type,
  saving,
  canSave,
  onSave,
}) {
  const { t } = useLocale();
  const isConsignment = type === 'CONSIGNMENT';

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Row label={t('vouchers.itemsPieces', { pieces: totals.pieces })} value={totals.subtotal} />
        {totals.tierSavings > 0 ? (
          <>
            <Row label={t('vouchers.tierSaving')} value={-totals.tierSavings} tone="good" />
            <p className="text-2xs text-ink-muted">
              {t('vouchers.listWouldBe', { amount: fmtMMK(totals.listSubtotal) })}
            </p>
          </>
        ) : null}
      </div>

      {/* Voucher-level discount, on top of whatever tier the lines earned. */}
      <div>
        <label htmlFor="voucher-discount" className="mb-1 block text-xs font-medium text-ink">
          {t('vouchers.extraDiscount')}
        </label>
        <div className="flex gap-1.5">
          <div className="flex overflow-hidden rounded-md border border-line-hair">
            {[
              [DISCOUNT_MODES.AMOUNT, 'K'],
              [DISCOUNT_MODES.PERCENT, '%'],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onDiscountModeChange(mode)}
                aria-pressed={discountMode === mode}
                className={`w-9 text-xs font-medium transition ${
                  discountMode === mode ? 'bg-ink text-plane' : 'text-ink-secondary hover:bg-raised'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            id="voucher-discount"
            inputMode="numeric"
            value={discount}
            onChange={(e) => onDiscountChange(e.target.value)}
            placeholder="0"
            className="h-9 min-w-0 flex-1 rounded-md border border-line-hair bg-surface px-3
              text-sm tabular-nums text-ink outline-none"
          />
        </div>
        {totals.discountAmount > 0 ? (
          <p className="mt-1 text-2xs text-ink-secondary">
            {t('vouchers.offThisVoucher', { amount: fmtMMK(totals.discountAmount) })}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5 border-t border-line-hair pt-3">
        <Row label={t('vouchers.thisVoucher')} value={totals.grandTotal} strong />
        <Row label={t('vouchers.previousBalance')} value={totals.previousBalance} />
      </div>

      {!isConsignment ? (
        <div>
          <label htmlFor="voucher-payment" className="mb-1 block text-xs font-medium text-ink">
            {t('vouchers.paymentNow')}
          </label>
          <div className="flex gap-1.5">
            <input
              id="voucher-payment"
              inputMode="numeric"
              value={payment}
              onChange={(e) => onPaymentChange(e.target.value)}
              placeholder="0"
              className="h-9 min-w-0 flex-1 rounded-md border border-line-hair bg-surface px-3
                text-sm tabular-nums text-ink outline-none"
            />
            <select
              aria-label={t('vouchers.paymentMethod')}
              value={paymentMethod}
              onChange={(e) => onPaymentMethodChange(e.target.value)}
              className="h-9 w-28 rounded-md border border-line-hair bg-surface px-2 text-xs text-ink-secondary"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.key} value={m.key}>
                  {t(`labels.paymentMethod.${m.key}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[totals.grandTotal, totals.previousBalance + totals.grandTotal]
              .filter((v, i, arr) => v > 0 && arr.indexOf(v) === i)
              .map((value, i) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onPaymentChange(String(value))}
                  className="rounded border border-line-hair px-2 py-0.5 text-2xs text-ink-secondary hover:bg-raised hover:text-ink"
                >
                  {t(i === 0 ? 'vouchers.thisVoucher' : 'vouchers.settleAll')} · K {fmtMMK(value, { compact: true })}
                </button>
              ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-card border border-line-hair bg-raised p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
            <Wallet size={13} aria-hidden="true" />
            {t(isConsignment ? 'vouchers.consignmentValue' : 'vouchers.newBalance')}
          </span>
          <span className="text-xl font-semibold tabular-nums text-ink">
            K {fmtMMK(isConsignment ? totals.grandTotal : totals.newBalance)}
          </span>
        </div>

        <p className="mt-1.5 flex items-center gap-1.5 text-2xs text-ink-secondary">
          <CalendarClock size={12} aria-hidden="true" />
          {isConsignment
            ? t('vouchers.consignmentNote')
            : t('vouchers.dueIn', { date: fmtDate(totals.dueDate), days: totals.termDays })}
        </p>
      </div>

      <Button
        variant="primary"
        size="lg"
        icon={Save}
        className="w-full"
        disabled={!canSave || saving}
        onClick={onSave}
      >
        {t(saving ? 'common.saving' : isConsignment ? 'vouchers.recordConsignment' : 'vouchers.issueVoucher')}
      </Button>
    </div>
  );
}

function Row({ label, value, strong, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={strong ? 'font-medium text-ink' : 'text-ink-secondary'}>{label}</span>
      <span
        className={`tabular-nums ${
          tone === 'good' ? 'text-status-good' : strong ? 'font-semibold text-ink' : 'text-ink'
        }`}
      >
        {value < 0 ? '−' : ''}K {fmtMMK(Math.abs(value))}
      </span>
    </div>
  );
}

export { Percent };
