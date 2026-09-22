import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  MapPin,
  Package,
  Receipt,
  Store,
  TrendingUp,
} from 'lucide-react';
import { CREDIT_STATUS } from '../domain/credit';
import { fmtMMK } from '../lib/format';
import { useLocale } from '../context/LocaleContext';
import { useCreditData } from '../hooks/useCreditData';
import { useSalesAnalytics } from '../hooks/useSalesAnalytics';
import { AgingBar } from '../components/charts/AgingBar';
import { BarList } from '../components/charts/BarList';
import { TrendChart } from '../components/charts/TrendChart';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { SkeletonRows } from '../components/ui/EmptyState';
import { StatTile } from '../components/ui/StatTile';
import { StatusPill } from '../components/ui/StatusPill';
import { PageHeader } from '../components/layout/AppShell';
import { DueMeter } from '../components/credit/DueMeter';

/**
 * The morning screen: what is owed, what is at risk, and where the business is
 * actually selling. One hero figure (outstanding receivables), then the
 * supporting detail — never a wall of equal-weight tiles.
 */
export default function Dashboard() {
  const { t } = useLocale();
  const { portfolio, loading: creditLoading } = useCreditData();
  const analytics = useSalesAnalytics({ days: 90 });
  const { totals } = portfolio;

  const attention = useMemo(
    () =>
      portfolio.rows
        .filter(({ state }) => state.status !== CREDIT_STATUS.ACTIVE && state.outstanding > 0)
        .slice(0, 6),
    [portfolio],
  );

  const collectionRate = analytics.revenue
    ? Math.min(100, (analytics.collected / analytics.revenue) * 100)
    : 0;

  return (
    <>
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      <div className="space-y-4">
        {/* Hero + the three figures that qualify it. */}
        <div className="grid gap-3 lg:grid-cols-[1.3fr_2fr]">
          <Card className="flex flex-col justify-between p-5">
            <div>
              <p className="text-xs font-medium text-ink-secondary">{t('dashboard.outstandingReceivables')}</p>
              <p className="mt-2 text-[42px] font-semibold leading-none tracking-tight text-ink">
                <span className="mr-1.5 text-xl font-medium text-ink-muted">K</span>
                {fmtMMK(totals.outstanding, { compact: true })}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
                <StatusPill
                  tone={totals.overdueAmount > 0 ? 'critical' : 'good'}
                  label={`K ${fmtMMK(totals.overdueAmount, { compact: true })} ${t('dashboard.overdue')}`}
                  size="sm"
                />
                <span>
                  {totals.counts.LOCKED} {t('dashboard.locked')} · {totals.counts.WATCH}{' '}
                  {t('dashboard.dueWithin2Days')}
                </span>
              </p>
            </div>
            <div className="mt-5">
              <AgingBar buckets={totals.buckets} total={totals.outstanding} />
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label={t('dashboard.revenue90')}
              value={analytics.revenue}
              icon={TrendingUp}
              footnote={`${analytics.voucherCount} ${t('common.vouchers')} · avg K ${fmtMMK(analytics.avgVoucher, { compact: true })}`}
            />
            <StatTile
              label={t('dashboard.cashCollected')}
              value={analytics.collected}
              icon={Banknote}
              tone="good"
              footnote={`${collectionRate.toFixed(0)}% of revenue issued`}
            />
            <StatTile
              label={t('dashboard.consignmentOut')}
              value={analytics.consignmentValue}
              icon={Package}
              footnote={t('dashboard.notRevenueYet')}
            />
            <StatTile
              label={t('dashboard.activeShops')}
              value={portfolio.rows.length}
              unit=""
              raw
              icon={Store}
              footnote={`${totals.shopsWithDebt} ${t('dashboard.carryingBalance')}`}
            />
          </div>
        </div>

        <Card>
          <CardHeader
            title={t('dashboard.salesVsCollected')}
            subtitle={t('dashboard.salesVsCollectedSub')}
            icon={TrendingUp}
          />
          <CardBody>
            {analytics.loading ? (
              <SkeletonRows rows={3} />
            ) : (
              <TrendChart weeks={analytics.weekly} />
            )}
          </CardBody>
        </Card>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader
              title={t('dashboard.topTownships')}
              subtitle={t('dashboard.salesValue90')}
              icon={MapPin}
            />
            <CardBody>
              {analytics.loading ? <SkeletonRows rows={5} /> : <BarList rows={analytics.topTownships} />}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('dashboard.topShops')} subtitle={t('dashboard.salesValue90')} icon={Store} />
            <CardBody>
              {analytics.loading ? <SkeletonRows rows={5} /> : <BarList rows={analytics.topShops} />}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title={t('dashboard.needsAttention')}
            subtitle={t('dashboard.needsAttentionSub')}
            icon={AlertTriangle}
            action={
              <Link
                to="/credit"
                className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary hover:text-ink"
              >
                {t('nav.credit')} <ArrowRight size={13} aria-hidden="true" />
              </Link>
            }
          />
          {creditLoading ? (
            <SkeletonRows rows={4} />
          ) : attention.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-ink-secondary">
              {t('dashboard.allInsideTerm')}
            </p>
          ) : (
            <ul className="divide-y divide-line-hair">
              {attention.map(({ shop, state }) => (
                <li key={shop.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{shop.name}</p>
                    <p className="text-2xs text-ink-secondary">
                      {shop.township} · {state.oldestVoucher?.voucherNo ?? '—'}
                    </p>
                  </div>
                  <DueMeter aging={state.oldestAging} />
                  <StatusPill status={state.status} size="sm" />
                  <p className="w-24 text-right text-sm font-medium tabular-nums text-ink">
                    K {fmtMMK(state.outstanding, { compact: true })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={t('dashboard.quickActions')} icon={Receipt} />
          <CardBody className="flex flex-wrap gap-2">
            {[
              ['/vouchers/new', t('dashboard.newVoucher')],
              ['/credit', t('dashboard.collectPayment')],
              ['/inventory', t('dashboard.gridStockEntry')],
              ['/logistics', t('dashboard.loadCarStock')],
            ].map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className="rounded-md border border-line-hair px-3 py-1.5 text-xs font-medium
                  text-ink-secondary transition hover:bg-raised hover:text-ink"
              >
                {label}
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
