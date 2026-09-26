import { Banknote, KeyRound, MapPin, Phone, Receipt } from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { CREDIT_STATUS } from '../../domain/credit';
import { PRICE_TIERS } from '../../lib/constants';
import { townshipLabel } from '../../constants/districts';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { StatusPill } from '../ui/StatusPill';
import { DueMeter } from './DueMeter';

/**
 * Shop profile as the credit screen needs it: who they are, what they owe, and
 * every open voucher with its position in the 14-day term.
 */
export function ShopCreditPanel({ open, shop, state, onClose, onPay, onStatement, onOverride, canOverride }) {
  const { t, locale } = useLocale();
  if (!open || !shop || !state) return null;

  const locked = state.status === CREDIT_STATUS.LOCKED;
  const tier = PRICE_TIERS[shop.priceTier] ?? PRICE_TIERS.STANDARD;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title={shop.name}
      subtitle={shop.nameMM}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('ui.close')}
          </Button>
          <Button variant="secondary" icon={Receipt} onClick={() => onStatement(shop, state)}>
            {t('credit.statement')}
          </Button>
          {locked && canOverride ? (
            <Button variant="danger" icon={KeyRound} onClick={() => onOverride(shop, state)}>
              {t('credit.releaseShop')}
            </Button>
          ) : null}
          <Button variant="primary" icon={Banknote} onClick={() => onPay(shop, state)}>
            {t('credit.recordPayment')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-secondary">
          <span className="flex items-center gap-1">
            <MapPin size={13} aria-hidden="true" /> {townshipLabel(shop.township, locale)}
          </span>
          <span className="flex items-center gap-1">
            <Phone size={13} aria-hidden="true" /> {shop.phone}
          </span>
          <span>{shop.ownerName}</span>
          <span className="rounded bg-raised px-1.5 py-0.5">{t(`labels.priceTier.${tier.key}`)}</span>
          <StatusPill
            status={state.status}
            size="sm"
            detail={state.override ? t('credit.overrideActiveTag') : null}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label={t('credit.colOutstanding')} value={state.outstanding} />
          <MiniStat
            label={t('credit.statOverdue')}
            value={state.overdueAmount}
            tone={state.overdueAmount > 0 ? 'critical' : 'neutral'}
          />
          <MiniStat
            label={t('credit.statLimit')}
            value={state.creditLimit}
            footnote={
              state.availableCredit != null
                ? t('credit.availableShort', { amount: fmtMMK(state.availableCredit, { compact: true }) })
                : null
            }
          />
          <MiniStat label={t('credit.statOpen')} value={state.openCount} raw />
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold text-ink">{t('credit.openOldestFirst')}</h3>
          <div className="overflow-x-auto rounded-card border border-line-hair">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-line-hair text-left text-2xs text-ink-secondary">
                  <th className="px-3 py-2 font-medium">{t('credit.colVoucher')}</th>
                  <th className="px-3 py-2 font-medium">{t('credit.colIssued')}</th>
                  <th className="px-3 py-2 font-medium">{t('credit.colDue')}</th>
                  <th className="px-3 py-2 font-medium">{t('credit.colTerm')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('credit.colTotal')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('credit.colBalance')}</th>
                </tr>
              </thead>
              <tbody>
                {state.agedVouchers.map(({ voucher, aging }) => (
                  <tr key={voucher.id} className="border-b border-line-hair last:border-0">
                    <td className="px-3 py-2 tabular-nums text-ink">{voucher.voucherNo}</td>
                    <td className="px-3 py-2 text-ink-secondary">{fmtDate(voucher.issueDate, 'dd MMM')}</td>
                    <td className="px-3 py-2 text-ink-secondary">{fmtDate(aging.dueDate, 'dd MMM')}</td>
                    <td className="px-3 py-2">
                      <DueMeter aging={aging} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">
                      {fmtMMK(voucher.grandTotal)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">
                      {fmtMMK(aging.balanceDue)}
                    </td>
                  </tr>
                ))}
                {state.agedVouchers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-xs text-ink-secondary">
                      {t('credit.fullySettled')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {state.override ? (
          <p className="rounded-card border border-line-hair bg-wash-warning px-3 py-2 text-xs text-ink">
            {t('credit.overrideUntil', {
              time: fmtDate(state.override.expiresAt, 'HH:mm'),
              by: state.override.grantedBy ?? t('labels.role.ADMIN'),
            })}
            {state.override.reason
              ? ` ${t('credit.overrideReason', { reason: state.override.reason })}`
              : ''}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function MiniStat({ label, value, tone = 'neutral', footnote, raw = false }) {
  return (
    <div className="rounded-card border border-line-hair px-3 py-2">
      <p className="text-2xs text-ink-secondary">{label}</p>
      <p
        className={`mt-0.5 text-base font-semibold tabular-nums ${
          tone === 'critical' ? 'text-status-critical' : 'text-ink'
        }`}
      >
        {raw ? value : `K ${fmtMMK(value, { compact: true })}`}
      </p>
      {footnote ? <p className="text-2xs text-ink-muted">{footnote}</p> : null}
    </div>
  );
}
