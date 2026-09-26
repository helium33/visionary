import { Award, Users } from 'lucide-react';
import { fmtMMK, fmtPct, initialsOf } from '../../lib/format';
import { useLocale } from '../../context/LocaleContext';
import { EmptyState } from '../ui/EmptyState';
import { Rich } from '../ui/Rich';

/**
 * Rep earnings, decomposed.
 *
 * The two halves are shown separately on purpose. A single "commission" total
 * tells a rep nothing about how to earn more; base and bonus shown side by
 * side, with the bonus they gave up by collecting late, make the incentive
 * legible — which is the whole point of tying half the scheme to the 14-day
 * term.
 */
export function CommissionTable({ result }) {
  const { t } = useLocale();

  if (!result.rows.length) {
    return (
      <EmptyState icon={Users} title={t('reports.noReps')} description={t('reports.noRepsHint')} />
    );
  }

  const vouchers = (count) => t(count === 1 ? 'charts.voucherOne' : 'charts.voucherMany', { count });

  return (
    <>
      <ul className="divide-y divide-line-hair lg:hidden">
        {result.rows.map((row) => (
          <li key={row.repId} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Avatar name={row.name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                  <p className="text-2xs text-ink-secondary">
                    {t('reports.repShopsVouchers', { shops: row.shopCount, vouchers: vouchers(row.voucherCount) })}
                  </p>
                </div>
              </div>
              <p className="text-right text-sm font-semibold tabular-nums text-ink">
                K {fmtMMK(row.total)}
              </p>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-2xs">
              <Cell label={t('reports.colSold')} value={`K ${fmtMMK(row.salesValue, { compact: true })}`} />
              <Cell label={t('reports.onTime')} value={fmtPct(row.onTimeRatePct)} />
              <Cell label={t('reports.colBonus')} value={`K ${fmtMMK(row.collectionBonus)}`} />
            </dl>
            <OnTimeMeter pct={row.onTimeRatePct} className="mt-2" />
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-line-hair text-left text-xs text-ink-secondary">
              <th className="px-4 py-2 font-medium">{t('reports.colRep')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('reports.colSold')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('reports.colBase')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('reports.colCollected')}</th>
              <th className="px-3 py-2 font-medium">{t('reports.colInside')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('reports.colBonus')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('reports.colEarns')}</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.repId} className="border-b border-line-hair last:border-0 hover:bg-raised">
                <td className="whitespace-nowrap px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Avatar name={row.name} />
                    <div>
                      <p className="font-medium text-ink">{row.name}</p>
                      <p className="text-2xs text-ink-secondary">
                        {t('reports.repShopsVouchersPieces', {
                          shops: row.shopCount,
                          vouchers: vouchers(row.voucherCount),
                          pieces: row.pieces,
                        })}
                      </p>
                    </div>
                  </div>
                </td>

                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink">
                  {fmtMMK(row.salesValue)}
                </td>

                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-secondary">
                  {fmtMMK(row.baseCommission)}
                  <span className="block text-2xs text-ink-muted">{fmtPct(row.basePct, 1)}</span>
                </td>

                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-secondary">
                  {fmtMMK(row.collected)}
                </td>

                <td className="px-3 py-2.5">
                  <OnTimeMeter pct={row.onTimeRatePct} />
                  <p className="mt-0.5 text-2xs text-ink-muted">
                    {t('reports.onTimeOf', {
                      onTime: fmtMMK(row.collectedOnTime, { compact: true }),
                      collected: fmtMMK(row.collected, { compact: true }),
                    })}
                  </p>
                </td>

                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <span className="tabular-nums text-ink">{fmtMMK(row.collectionBonus)}</span>
                  {row.bonusForgone > 0 ? (
                    <span className="block text-2xs tabular-nums text-status-serious">
                      {t('reports.missed', { amount: fmtMMK(row.bonusForgone) })}
                    </span>
                  ) : null}
                </td>

                <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-ink">
                  {fmtMMK(row.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-base text-sm">
              <td className="px-4 py-2 font-medium text-ink">{t('reports.team')}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink">
                {fmtMMK(result.totals.salesValue)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ink">
                {fmtMMK(result.totals.baseCommission)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ink">
                {fmtMMK(result.totals.collected)}
              </td>
              <td className="px-3 py-2 text-2xs text-ink-secondary">
                {t('reports.collectedOnTime', {
                  pct: result.totals.collected
                    ? fmtPct((result.totals.collectedOnTime / result.totals.collected) * 100)
                    : '—',
                })}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ink">
                {fmtMMK(result.totals.collectionBonus)}
              </td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">
                {fmtMMK(result.totals.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="flex items-start gap-2 border-t border-line-hair px-4 py-2.5 text-2xs text-ink-secondary">
        <Award size={13} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
        {/* One span, not loose text plus <strong>: inside a flex row each of
            those becomes its own flex item and the sentence breaks apart. */}
        <span>
          <Rich
            text={t('reports.commissionNote', {
              base: fmtPct(result.rates.basePct, 1),
              bonus: fmtPct(result.rates.onTimeBonusPct, 1),
            })}
          />
        </span>
      </p>
    </>
  );
}

/**
 * Collection quality. The number is the signal; the bar is the glance. Colour
 * follows the threshold the business actually cares about — most of the money
 * back inside the term.
 */
function OnTimeMeter({ pct, className = '' }) {
  const { t } = useLocale();
  const tone = pct >= 80 ? 'good' : pct >= 50 ? 'warning' : 'critical';
  const color = {
    good: 'var(--status-good)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-critical)',
  }[tone];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        className="h-1.5 w-20 shrink-0 rounded-full"
        style={{ background: 'var(--gridline)' }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={t('reports.onTimeAria')}
      >
        <span
          className="block h-1.5 rounded-full"
          style={{ width: `${Math.max(Math.min(pct, 100), 2)}%`, background: color }}
        />
      </span>
      <span className="text-xs tabular-nums text-ink">{fmtPct(pct)}</span>
    </div>
  );
}

function Avatar({ name }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-raised text-2xs font-medium text-ink-secondary">
      {initialsOf(name)}
    </span>
  );
}

function Cell({ label, value }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
}
