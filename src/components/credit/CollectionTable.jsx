import { Banknote, FileText, Lock, MessageCircle } from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { CREDIT_STATUS } from '../../domain/credit';
import { townshipLabel } from '../../constants/districts';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { StatusPill } from '../ui/StatusPill';
import { DueMeter } from './DueMeter';

/**
 * The collection worklist — the screen the accountant actually works from,
 * ordered worst-first by the portfolio evaluator.
 *
 * It doubles as the table view for the ageing chart above it, which is what
 * discharges the relief rule for the lighter status fills.
 */
export function CollectionTable({ rows, onPay, onStatement, onOpenShop, canCollect }) {
  const { t, locale } = useLocale();

  if (!rows.length) {
    return (
      <EmptyState
        icon={Banknote}
        title={t('credit.nothingToChase')}
        description={t('credit.nothingToChaseHint')}
      />
    );
  }

  return (
    <>
      {/* Phone layout — a rep in the field works from a card, not a wide table. */}
      <ul className="divide-y divide-line-hair lg:hidden">
        {rows.map(({ shop, state }) => (
          <li key={shop.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => onOpenShop(shop)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium text-ink">{shop.name}</p>
                <p className="text-2xs text-ink-secondary">
                  {townshipLabel(shop.township, locale)} · {state.oldestVoucher?.voucherNo ?? '—'}
                </p>
              </button>
              <StatusPill
                status={state.status}
                size="sm"
                detail={
                  state.status === CREDIT_STATUS.LOCKED
                    ? t('credit.daysShort', { n: state.maxDaysOverdue })
                    : null
                }
              />
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <DueMeter aging={state.oldestAging} />
              <p className="text-right text-sm font-medium tabular-nums text-ink">
                K {fmtMMK(state.outstanding)}
                {state.overdueAmount > 0 ? (
                  <span className="block text-2xs font-normal text-status-critical">
                    {t('credit.overdueAmount', { amount: fmtMMK(state.overdueAmount) })}
                  </span>
                ) : null}
              </p>
            </div>

            <div className="mt-2.5 flex gap-2">
              <Button
                size="sm"
                variant="quiet"
                icon={MessageCircle}
                className="flex-1"
                onClick={() => onStatement(shop, state)}
              >
                {t('credit.remind')}
              </Button>
              {canCollect ? (
                <Button
                  size="sm"
                  variant={state.overdueAmount > 0 ? 'primary' : 'secondary'}
                  icon={Banknote}
                  className="flex-1"
                  onClick={() => onPay(shop, state)}
                >
                  {t('credit.collect')}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: six columns. Township rides under the shop name and the
          overdue figure under the outstanding one, so the table fits a laptop
          without a horizontal scroll hiding the action buttons. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-hair text-left text-xs text-ink-secondary">
              <th className="px-4 py-2 font-medium">{t('credit.colShop')}</th>
              <th className="px-3 py-2 font-medium">{t('credit.colStatus')}</th>
              <th className="px-3 py-2 font-medium">{t('credit.colOldest')}</th>
              <th className="px-3 py-2 font-medium">{t('credit.colTerm')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('credit.colOutstanding')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('credit.colAction')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ shop, state }) => (
              <tr key={shop.id} className="border-b border-line-hair last:border-0 hover:bg-raised">
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => onOpenShop(shop)}
                    className="whitespace-nowrap text-left font-medium text-ink hover:underline"
                  >
                    {shop.name}
                  </button>
                  <p className="whitespace-nowrap text-2xs text-ink-secondary">
                    {townshipLabel(shop.township, locale)}
                  </p>
                </td>

                <td className="whitespace-nowrap px-3 py-2.5">
                  <StatusPill
                    status={state.status}
                    size="sm"
                    detail={
                      state.override
                        ? t('credit.overrideTag')
                        : state.status === CREDIT_STATUS.LOCKED
                          ? t('credit.daysShort', { n: state.maxDaysOverdue })
                          : null
                    }
                  />
                </td>

                <td className="whitespace-nowrap px-3 py-2.5">
                  <p className="tabular-nums text-ink">{state.oldestVoucher?.voucherNo ?? '—'}</p>
                  <p className="text-2xs text-ink-muted">
                    {t('credit.dueOn', { date: fmtDate(state.oldestAging?.dueDate, 'dd MMM') })}
                  </p>
                </td>

                <td className="px-3 py-2.5">
                  <DueMeter aging={state.oldestAging} />
                </td>

                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <p className="font-medium tabular-nums text-ink">{fmtMMK(state.outstanding)}</p>
                  {state.overdueAmount > 0 ? (
                    <p className="text-2xs tabular-nums text-status-critical">
                      {t('credit.overdueSmall', { amount: fmtMMK(state.overdueAmount) })}
                    </p>
                  ) : null}
                </td>

                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="quiet"
                      icon={MessageCircle}
                      onClick={() => onStatement(shop, state)}
                      title={t('credit.sendStatementHint')}
                    >
                      {t('credit.remind')}
                    </Button>
                    {canCollect ? (
                      <Button
                        size="sm"
                        variant={state.overdueAmount > 0 ? 'primary' : 'secondary'}
                        icon={Banknote}
                        onClick={() => onPay(shop, state)}
                      >
                        {t('credit.collect')}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function LockedBanner({ count, amount, onReview }) {
  const { t } = useLocale();
  if (!count) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-status-critical/40 bg-wash-critical px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Lock size={17} className="mt-0.5 shrink-0 text-status-critical" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-ink">{t('credit.lockedBanner', { count })}</p>
          <p className="text-xs text-ink-secondary">
            {t('credit.lockedBody', { amount: fmtMMK(amount) })}
          </p>
        </div>
      </div>
      {onReview ? (
        <Button size="sm" variant="secondary" icon={FileText} onClick={onReview}>
          {t('credit.reviewLocked')}
        </Button>
      ) : null}
    </div>
  );
}
