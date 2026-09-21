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
      <PageHeader
        title="Dashboard"
        subtitle="Last 90 days · Yangon wholesale"
      />

      <div className="space-y-4">
        {/* Hero + the three figures that qualify it. */}
        <div className="grid gap-3 lg:grid-cols-[1.3fr_2fr]">
          <Card className="flex flex-col justify-between p-5">
            <div>
              <p className="text-xs font-medium text-ink-secondary">Outstanding receivables</p>
              <p className="mt-2 text-[42px] font-semibold leading-none tracking-tight text-ink">
                <span className="mr-1.5 text-xl font-medium text-ink-muted">K</span>
                {fmtMMK(totals.outstanding, { compact: true })}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
                <StatusPill
                  tone={totals.overdueAmount > 0 ? 'critical' : 'good'}
                  label={`K ${fmtMMK(totals.overdueAmount, { compact: true })} overdue`}
                  size="sm"
                />
                <span>
                  {totals.counts.LOCKED} locked · {totals.counts.WATCH} due within 2 days
                </span>
              </p>
            </div>
            <div className="mt-5">
              <AgingBar buckets={totals.buckets} total={totals.outstanding} />
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Revenue (90 days)"
              value={analytics.revenue}
              icon={TrendingUp}
              footnote={`${analytics.voucherCount} vouchers · avg K ${fmtMMK(analytics.avgVoucher, { compact: true })}`}
            />
            <StatTile
              label="Cash collected"
              value={analytics.collected}
              icon={Banknote}
              tone="good"
              footnote={`${collectionRate.toFixed(0)}% of revenue issued`}
            />
            <StatTile
              label="Consignment out"
              value={analytics.consignmentValue}
              icon={Package}
              footnote="sample stock — not revenue yet"
            />
            <StatTile
              label="Active shops"
              value={portfolio.rows.length}
              unit=""
              raw
              icon={Store}
              footnote={`${totals.shopsWithDebt} carrying a balance`}
            />
          </div>
        </div>

        <Card>
          <CardHeader
            title="Sales issued vs cash collected"
            subtitle="Weekly, last 90 days — the gap is credit extended"
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
              title="Top townships"
              subtitle="Sales value, last 90 days"
              icon={MapPin}
            />
            <CardBody>
              {analytics.loading ? <SkeletonRows rows={5} /> : <BarList rows={analytics.topTownships} />}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Top shops" subtitle="Sales value, last 90 days" icon={Store} />
            <CardBody>
              {analytics.loading ? <SkeletonRows rows={5} /> : <BarList rows={analytics.topShops} />}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Needs attention today"
            subtitle="Shops past — or about to pass — their 14-day term"
            icon={AlertTriangle}
            action={
              <Link
                to="/credit"
                className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary hover:text-ink"
              >
                Credit control <ArrowRight size={13} aria-hidden="true" />
              </Link>
            }
          />
          {creditLoading ? (
            <SkeletonRows rows={4} />
          ) : attention.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-ink-secondary">
              Every shop is inside its 14-day term.
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
          <CardHeader title="Quick actions" icon={Receipt} />
          <CardBody className="flex flex-wrap gap-2">
            {[
              ['/vouchers/new', 'New voucher'],
              ['/credit', 'Collect payment'],
              ['/inventory', 'Grid stock entry'],
              ['/logistics', 'Load car stock'],
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
