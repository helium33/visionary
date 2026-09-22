import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Clock,
  Filter,
  Lock,
  PieChart,
  Search,
  Wallet,
} from 'lucide-react';
import {
  CREDIT_STATUS,
  GRACE_DAYS,
  collectionWorklist,
  simplifiedAgeingBuckets,
} from '../domain/credit';
import { TOWNSHIP_NAMES } from '../lib/constants';
import { fmtDate } from '../lib/dates';
import { fmtMMK } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useCreditData } from '../hooks/useCreditData';
import { useSalesAnalytics } from '../hooks/useSalesAnalytics';
import { AgingBar } from '../components/charts/AgingBar';
import { CollectedVsOutstandingChart, DebtAgeingChart } from '../components/credit/CreditCharts';
import { CollectionTable, LockedBanner } from '../components/credit/CollectionTable';
import { MasterPasswordModal } from '../components/credit/MasterPasswordModal';
import { RecordPaymentModal } from '../components/credit/RecordPaymentModal';
import { ShopCreditPanel } from '../components/credit/ShopCreditPanel';
import { StatementModal } from '../components/credit/StatementModal';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { SkeletonRows } from '../components/ui/EmptyState';
import { StatTile } from '../components/ui/StatTile';
import { PageHeader } from '../components/layout/AppShell';

/**
 * ===========================================================================
 * CREDIT MANAGEMENT DASHBOARD
 * ===========================================================================
 * The 14-day rule made visible and actionable:
 *
 *   • Every figure on this screen is DERIVED from open vouchers against the
 *     current date (see domain/credit.js) — never read from a stored status
 *     field, so it is correct the moment a shop crosses its due date, with no
 *     nightly job and no connectivity.
 *   • Locked shops are surfaced first, because a locked shop is a sale the
 *     reps cannot make today.
 *   • Every action a collector needs — chase, collect, release — is on the row.
 *
 * Two charts sit beneath the KPI tiles: a Collected-vs-Outstanding donut and a
 * 0–7 / 8–14 / overdue debt-ageing bar, both Recharts, both reading the exact
 * same `portfolio` this whole page derives from — so a number a collector
 * checks on the table always matches what the chart above it shows. The
 * existing four-band `AgingBar` stays untouched beside them: it answers "how
 * much is in each precise bucket", the new bar answers "how much is close to
 * the wall" at a glance. Different questions, same source of truth.
 */
export default function CreditManagement() {
  const { user, can } = useAuth();
  const { t } = useLocale();
  const { portfolio, vouchersByShop, loading, today } = useCreditData();
  // Collected is real cash received (payments), not a slice of open debt —
  // `totals.currentAmount` from the portfolio is still-unpaid balance inside
  // the term, which is a different thing and would mislabel the pie chart.
  // 90 days matches how "Cash collected" is already defined on the Dashboard.
  const { collected: cashCollected, loading: collectedLoading } = useSalesAnalytics({ days: 90 });
  const [filter, setFilter] = useState('WORKLIST');
  const [township, setTownship] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState(null); // { shop, state }
  const [dialog, setDialog] = useState(null); // 'pay' | 'statement' | 'override' | 'shop'

  const FILTERS = [
    { key: 'WORKLIST', label: t('credit.needsAction') },
    { key: CREDIT_STATUS.LOCKED, label: t('credit.lockedShops') },
    // Only reachable when the business runs a grace period; with GRACE_DAYS = 0
    // a shop goes straight from WATCH to LOCKED, so the tab would always be 0.
    ...(GRACE_DAYS > 0 ? [{ key: CREDIT_STATUS.OVERDUE, label: t('credit.overduePastTerm') }] : []),
    { key: CREDIT_STATUS.WATCH, label: t('credit.dueSoon') },
    { key: 'ALL', label: t('credit.allShops') },
  ];

  const canCollect = can('payment:create') || can('payment:collect');
  const canOverride = user?.role === 'ADMIN';

  const rows = useMemo(() => {
    let list =
      filter === 'WORKLIST'
        ? collectionWorklist(portfolio)
        : filter === 'ALL'
          ? portfolio.rows
          : portfolio.rows.filter(({ state }) => state.status === filter);

    if (township !== 'ALL') list = list.filter(({ shop }) => shop.township === township);

    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(
        ({ shop }) =>
          shop.name.toLowerCase().includes(term) ||
          (shop.nameMM ?? '').includes(term) ||
          (shop.code ?? '').toLowerCase().includes(term),
      );
    }
    return list;
  }, [portfolio, filter, township, search]);

  const { totals } = portfolio;
  const lockedRows = portfolio.rows.filter(({ state }) => state.status === CREDIT_STATUS.LOCKED);
  const lockedAmount = lockedRows.reduce((sum, { state }) => sum + state.overdueAmount, 0);
  const watchRows = portfolio.rows.filter(({ state }) => state.status === CREDIT_STATUS.WATCH);
  const debtBuckets = useMemo(() => simplifiedAgeingBuckets(portfolio), [portfolio]);

  const open = (kind) => (shop, state) => {
    setSelection({ shop, state });
    setDialog(kind);
  };
  const close = () => setDialog(null);

  // Keep the open dialog bound to freshly derived state after a write lands.
  const liveSelection = useMemo(() => {
    if (!selection) return null;
    const row = portfolio.rows.find(({ shop }) => shop.id === selection.shop.id);
    return row ? { shop: row.shop, state: row.state } : selection;
  }, [selection, portfolio]);

  return (
    <>
      <PageHeader
        title={t('credit.title')}
        subtitle={t('credit.subtitle', { date: fmtDate(today), count: totals.shopsWithDebt })}
      />

      <div className="space-y-4">
        <LockedBanner
          count={lockedRows.length}
          amount={lockedAmount}
          onReview={() => setFilter(CREDIT_STATUS.LOCKED)}
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label={t('credit.totalOutstanding')}
            value={totals.outstanding}
            icon={Wallet}
            footnote={t('credit.acrossShops', { count: totals.shopsWithDebt })}
          />
          <StatTile
            label={t('credit.overduePastTerm')}
            value={totals.overdueAmount}
            icon={AlertTriangle}
            tone={totals.overdueAmount > 0 ? 'critical' : 'neutral'}
            footnote={
              totals.outstanding
                ? `${((totals.overdueAmount / totals.outstanding) * 100).toFixed(0)}${t('credit.ofReceivables')}`
                : 'nothing past term'
            }
          />
          <StatTile
            label={t('credit.lockedShops')}
            value={totals.counts.LOCKED}
            unit=""
            raw
            icon={Lock}
            tone={totals.counts.LOCKED > 0 ? 'critical' : 'neutral'}
            footnote={t('credit.newVouchersBlocked')}
          />
          <StatTile
            label={t('credit.dueWithin2')}
            value={watchRows.reduce((sum, { state }) => sum + state.outstanding, 0)}
            icon={Clock}
            footnote={t('credit.shopsAtDay', { count: watchRows.length })}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={t('credit.collectionSplit')} subtitle={t('credit.collectionSplitSub')} icon={PieChart} />
            <CardBody>
              {loading || collectedLoading ? (
                <SkeletonRows rows={4} />
              ) : (
                <CollectedVsOutstandingChart collected={cashCollected} outstanding={totals.outstanding} />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('credit.debtAgeing')} subtitle={t('credit.debtAgeingSub')} icon={Clock} />
            <CardBody>
              {loading ? <SkeletonRows rows={4} /> : <DebtAgeingChart buckets={debtBuckets} />}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title={t('credit.ageingTitle')} subtitle={t('credit.ageingSub')} icon={Banknote} />
          <CardBody>
            <AgingBar buckets={totals.buckets} total={totals.outstanding} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t('credit.worklistTitle')}
            subtitle={t('credit.worklistSub')}
            icon={Filter}
            action={
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <label className="relative">
                  <span className="sr-only">{t('credit.searchShop')}</span>
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted"
                    aria-hidden="true"
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('credit.searchShop')}
                    className="h-7 w-full min-w-[9rem] rounded border border-line-hair bg-surface pl-7 pr-2 text-xs text-ink outline-none sm:w-36"
                  />
                </label>
                <select
                  aria-label={t('common.township')}
                  value={township}
                  onChange={(e) => setTownship(e.target.value)}
                  className="h-7 rounded border border-line-hair bg-surface px-2 text-xs text-ink-secondary"
                >
                  <option value="ALL">{t('common.allTownships')}</option>
                  {TOWNSHIP_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            }
          />

          <div className="flex flex-wrap gap-1 border-b border-line-hair px-4 py-2">
            {FILTERS.map((option) => {
              const count =
                option.key === 'WORKLIST'
                  ? collectionWorklist(portfolio).length
                  : option.key === 'ALL'
                    ? portfolio.rows.length
                    : totals.counts[option.key] ?? 0;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setFilter(option.key)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                    filter === option.key
                      ? 'bg-ink text-plane'
                      : 'text-ink-secondary hover:bg-raised hover:text-ink'
                  }`}
                >
                  {option.label}
                  <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <SkeletonRows rows={6} />
          ) : (
            <CollectionTable
              rows={rows}
              canCollect={canCollect}
              onPay={open('pay')}
              onStatement={open('statement')}
              onOpenShop={(shop) => {
                const row = portfolio.rows.find((r) => r.shop.id === shop.id);
                open('shop')(shop, row?.state);
              }}
            />
          )}

          {!loading && rows.length > 0 ? (
            <p className="border-t border-line-hair px-4 py-2 text-2xs text-ink-secondary">
              {t('credit.showing', {
                shown: rows.length,
                total: portfolio.rows.length,
                amount: fmtMMK(rows.reduce((sum, r) => sum + r.state.outstanding, 0)),
              })}
            </p>
          ) : null}
        </Card>
      </div>

      {liveSelection ? (
        <>
          <RecordPaymentModal
            open={dialog === 'pay'}
            shop={liveSelection.shop}
            state={liveSelection.state}
            vouchers={vouchersByShop.get(liveSelection.shop.id) ?? []}
            onClose={close}
          />
          <StatementModal
            open={dialog === 'statement'}
            shop={liveSelection.shop}
            state={liveSelection.state}
            onClose={close}
          />
          <MasterPasswordModal
            open={dialog === 'override'}
            shop={liveSelection.shop}
            state={liveSelection.state}
            onClose={close}
          />
          <ShopCreditPanel
            open={dialog === 'shop'}
            shop={liveSelection.shop}
            state={liveSelection.state}
            canOverride={canOverride}
            onClose={close}
            onPay={open('pay')}
            onStatement={open('statement')}
            onOverride={open('override')}
          />
        </>
      ) : null}
    </>
  );
}
