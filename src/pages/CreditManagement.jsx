import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Clock,
  Filter,
  Lock,
  Search,
  Wallet,
} from 'lucide-react';
import { CREDIT_STATUS, CREDIT_TERM_DAYS, GRACE_DAYS, collectionWorklist } from '../domain/credit';
import { TOWNSHIP_NAMES } from '../lib/constants';
import { fmtDate } from '../lib/dates';
import { fmtMMK } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useCreditData } from '../hooks/useCreditData';
import { AgingBar } from '../components/charts/AgingBar';
import { CollectionTable, LockedBanner } from '../components/credit/CollectionTable';
import { MasterPasswordModal } from '../components/credit/MasterPasswordModal';
import { RecordPaymentModal } from '../components/credit/RecordPaymentModal';
import { ShopCreditPanel } from '../components/credit/ShopCreditPanel';
import { StatementModal } from '../components/credit/StatementModal';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { SkeletonRows } from '../components/ui/EmptyState';
import { StatTile } from '../components/ui/StatTile';
import { PageHeader } from '../components/layout/AppShell';

const FILTERS = [
  { key: 'WORKLIST', label: 'Needs action' },
  { key: CREDIT_STATUS.LOCKED, label: 'Locked' },
  // Only reachable when the business runs a grace period; with GRACE_DAYS = 0
  // a shop goes straight from WATCH to LOCKED, so the tab would always be 0.
  ...(GRACE_DAYS > 0 ? [{ key: CREDIT_STATUS.OVERDUE, label: 'Overdue' }] : []),
  { key: CREDIT_STATUS.WATCH, label: 'Due soon' },
  { key: 'ALL', label: 'All shops' },
];

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
 */
export default function CreditManagement() {
  const { user, can } = useAuth();
  const { portfolio, vouchersByShop, loading, today } = useCreditData();
  const [filter, setFilter] = useState('WORKLIST');
  const [township, setTownship] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState(null); // { shop, state }
  const [dialog, setDialog] = useState(null); // 'pay' | 'statement' | 'override' | 'shop'

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
        title="Credit control"
        subtitle={`${CREDIT_TERM_DAYS}-day terms · evaluated ${fmtDate(today)} · ${
          totals.shopsWithDebt
        } shops carrying balances`}
      />

      <div className="space-y-4">
        <LockedBanner
          count={lockedRows.length}
          amount={lockedAmount}
          onReview={() => setFilter(CREDIT_STATUS.LOCKED)}
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Total outstanding"
            value={totals.outstanding}
            icon={Wallet}
            footnote={`across ${totals.shopsWithDebt} shops`}
          />
          <StatTile
            label="Overdue (past 14 days)"
            value={totals.overdueAmount}
            icon={AlertTriangle}
            tone={totals.overdueAmount > 0 ? 'critical' : 'neutral'}
            footnote={
              totals.outstanding
                ? `${((totals.overdueAmount / totals.outstanding) * 100).toFixed(0)}% of receivables`
                : 'nothing past term'
            }
          />
          <StatTile
            label="Locked shops"
            value={totals.counts.LOCKED}
            unit=""
            raw
            icon={Lock}
            tone={totals.counts.LOCKED > 0 ? 'critical' : 'neutral'}
            footnote="new vouchers blocked"
          />
          <StatTile
            label="Due within 2 days"
            value={watchRows.reduce((sum, { state }) => sum + state.outstanding, 0)}
            icon={Clock}
            footnote={`${watchRows.length} shops at day 12–14`}
          />
        </div>

        <Card>
          <CardHeader
            title="Receivables ageing"
            subtitle="Every open voucher placed against its 14-day term"
            icon={Banknote}
          />
          <CardBody>
            <AgingBar buckets={totals.buckets} total={totals.outstanding} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Collection worklist"
            subtitle="Worst first — locked shops, then by days past term"
            icon={Filter}
            action={
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <label className="relative">
                  <span className="sr-only">Search shops</span>
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted"
                    aria-hidden="true"
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search shop"
                    className="h-7 w-full min-w-[9rem] rounded border border-line-hair bg-surface pl-7 pr-2 text-xs text-ink outline-none sm:w-36"
                  />
                </label>
                <select
                  aria-label="Filter by township"
                  value={township}
                  onChange={(e) => setTownship(e.target.value)}
                  className="h-7 rounded border border-line-hair bg-surface px-2 text-xs text-ink-secondary"
                >
                  <option value="ALL">All townships</option>
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
              Showing {rows.length} of {portfolio.rows.length} shops · K{' '}
              {fmtMMK(rows.reduce((sum, r) => sum + r.state.outstanding, 0))} outstanding in this view
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
