import { useEffect, useMemo, useState } from 'react';
import { subDays } from 'date-fns';
import {
  AlertTriangle,
  Banknote,
  Coins,
  Package,
  Receipt,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { computeCommissions } from '../domain/commission';
import { computeProfitAndLoss, profitBridge, profitByModel } from '../domain/profit';
import { ROLES } from '../lib/constants';
import {
  subscribeExpenses,
  subscribePayments,
  subscribeRecentVouchers,
  subscribeShops,
  subscribeUsers,
} from '../services/dataSource';
import { fmtDate } from '../lib/dates';
import { fmtMMK, fmtPct } from '../lib/format';
import { useCatalogue } from '../hooks/useCatalogue';
import { useLocale } from '../context/LocaleContext';
import { tOr } from '../i18n/translate';
import { useToday } from '../hooks/useToday';
import { BarList } from '../components/charts/BarList';
import { Waterfall } from '../components/charts/Waterfall';
import { CommissionTable } from '../components/reports/CommissionTable';
import { ShopsTownshipsReport } from '../components/reports/ShopsTownshipsReport';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { SkeletonRows } from '../components/ui/EmptyState';
import { StatTile } from '../components/ui/StatTile';
import { Rich } from '../components/ui/Rich';
import { PageHeader } from '../components/layout/AppShell';

/**
 * ===========================================================================
 * REPORTS — net profit and rep commissions.
 * ===========================================================================
 * Everything here is computed from documents, not from a stored summary:
 *
 *  • Cost of goods comes off each sold line, where it was frozen at sale time.
 *    Reading it from the product would mean the next shipment silently
 *    restates last quarter's profit.
 *  • Commission splits into volume and collection, because paying on sales
 *    alone rewards selling to shops that never pay.
 *
 * The period compares against the window immediately before it, so a figure
 * always arrives with the context needed to judge it.
 */
const PERIODS = [
  { key: 30, label: 'common.last30' },
  { key: 90, label: 'common.last90' },
  { key: 365, label: 'common.last365' },
];

export default function Reports() {
  const today = useToday();
  const { t } = useLocale();
  const { byId, loading: catalogueLoading } = useCatalogue();
  const [tab, setTab] = useState('profit');
  const [days, setDays] = useState(90);
  const [vouchers, setVouchers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [users, setUsers] = useState([]);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);

  // A 12-month view needs two years of documents to show a comparison, so the
  // listeners are scoped to twice the longest window rather than the current one.
  const since = useMemo(() => subDays(today, 365 * 2), [today]);

  useEffect(() => {
    const pending = new Set(['v', 'p', 'e', 'u', 's']);
    const settle = (key) => {
      pending.delete(key);
      if (pending.size === 0) setLoading(false);
    };
    const unsubs = [
      subscribeRecentVouchers(({ data }) => {
        setVouchers(data);
        settle('v');
      }, { since }),
      subscribePayments(({ data }) => {
        setPayments(data);
        settle('p');
      }, { since }),
      subscribeExpenses(({ data }) => {
        setExpenses(data);
        settle('e');
      }, { since }),
      subscribeUsers(({ data }) => {
        setUsers(data);
        settle('u');
      }),
      subscribeShops(({ data }) => {
        setShops(data);
        settle('s');
      }, {}),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [since]);

  const from = useMemo(() => subDays(today, days), [today, days]);
  const previousFrom = useMemo(() => subDays(from, days), [from, days]);

  const pnl = useMemo(
    () =>
      computeProfitAndLoss({ vouchers, payments, expenses, productsById: byId, from, to: today }),
    [vouchers, payments, expenses, byId, from, today],
  );

  const previous = useMemo(
    () =>
      computeProfitAndLoss({
        vouchers,
        payments,
        expenses,
        productsById: byId,
        from: previousFrom,
        to: from,
      }),
    [vouchers, payments, expenses, byId, previousFrom, from],
  );

  // Expense steps are keyed by category (SALARY, RENT…), the rest by line.
  const bridge = useMemo(
    () =>
      profitBridge(pnl).map((step) => ({
        ...step,
        label: tOr(t, `reports.bridge.${step.key}`, tOr(t, `purchasing.expenseCategory.${step.key}`, step.label)),
      })),
    [pnl, t],
  );

  const models = useMemo(
    () => profitByModel({ vouchers, productsById: byId, from, to: today }),
    [vouchers, byId, from, today],
  );

  const reps = useMemo(() => users.filter((user) => user.role === ROLES.SALES), [users]);

  const commissions = useMemo(
    () => computeCommissions({ vouchers, payments, reps, shops, from, to: today }),
    [vouchers, payments, reps, shops, from, today],
  );

  const delta = (current, prior) => {
    if (!prior) return null;
    return ((current - prior) / Math.abs(prior)) * 100;
  };

  const netDelta = delta(pnl.netProfit, previous.netProfit);
  const busy = loading || catalogueLoading;

  return (
    <>
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle', { from: fmtDate(from), to: fmtDate(today), days })}
        actions={
          <div className="flex gap-1 rounded-md border border-line-hair p-0.5 text-xs">
            {PERIODS.map((period) => (
              <button
                key={period.key}
                type="button"
                onClick={() => setDays(period.key)}
                aria-pressed={days === period.key}
                className={`rounded px-2.5 py-1.5 font-medium transition ${
                  days === period.key ? 'bg-ink text-plane' : 'text-ink-secondary hover:bg-raised'
                }`}
              >
                {t(period.label)}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-4 flex gap-1 rounded-md border border-line-hair p-0.5 text-xs">
        {[
          { key: 'profit', label: t('reports.tabProfit') },
          { key: 'shops', label: t('reports.tabShops') },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setTab(option.key)}
            aria-pressed={tab === option.key}
            className={`rounded px-3 py-1.5 font-medium transition ${
              tab === option.key ? 'bg-ink text-plane' : 'text-ink-secondary hover:bg-raised'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === 'shops' ? (
        <ShopsTownshipsReport vouchers={vouchers} from={from} to={today} loading={busy} />
      ) : (
      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_2fr]">
          {/* One hero per view: the number the owner opens this page for. */}
          <Card className="flex flex-col justify-between p-5">
            <div>
              <p className="text-xs font-medium text-ink-secondary">
                {t('reports.netProfitDays', { days })}
              </p>
              <p
                className={`mt-2 text-[42px] font-semibold leading-none tracking-tight ${
                  pnl.netProfit < 0 ? 'text-status-critical' : 'text-ink'
                }`}
              >
                <span className="mr-1.5 text-xl font-medium text-ink-muted">K</span>
                {fmtMMK(pnl.netProfit, { compact: true })}
              </p>

              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
                <span className="rounded bg-raised px-1.5 py-0.5 tabular-nums">
                  {t('reports.marginPct', { pct: fmtPct(pnl.netMarginPct, 1) })}
                </span>
                {netDelta != null ? (
                  <span
                    className={`inline-flex items-center gap-1 tabular-nums ${
                      netDelta >= 0 ? 'text-status-good' : 'text-status-critical'
                    }`}
                  >
                    {netDelta >= 0 ? (
                      <TrendingUp size={12} aria-hidden="true" />
                    ) : (
                      <TrendingDown size={12} aria-hidden="true" />
                    )}
                    {t('reports.vsPrevious', {
                      delta: `${netDelta >= 0 ? '+' : ''}${fmtPct(netDelta, 0)}`,
                      days,
                    })}
                  </span>
                ) : (
                  <span className="text-ink-muted">{t('reports.noPrior')}</span>
                )}
              </p>
            </div>

            <p className="mt-5 text-2xs text-ink-secondary">
              {t('reports.formula', {
                revenue: fmtMMK(pnl.revenue),
                cogs: fmtMMK(pnl.cogs),
                expenses: fmtMMK(pnl.expenses.total),
              })}
            </p>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label={t('reports.revenue')}
              value={pnl.revenue}
              icon={Banknote}
              footnote={t('reports.vouchersPieces', {
                vouchers: t(pnl.voucherCount === 1 ? 'charts.voucherOne' : 'charts.voucherMany', {
                  count: pnl.voucherCount,
                }),
                pieces: pnl.pieces,
              })}
            />
            <StatTile
              label={t('reports.grossProfit')}
              value={pnl.grossProfit}
              icon={TrendingUp}
              tone="good"
              footnote={t('reports.grossMargin', { pct: fmtPct(pnl.grossMarginPct, 1) })}
            />
            <StatTile
              label={t('reports.cogs')}
              value={pnl.cogs}
              icon={Package}
              footnote={
                pnl.costEstimated
                  ? t('reports.linesEstimated', {
                      estimated: pnl.estimatedLines,
                      costed: pnl.costedLines,
                    })
                  : t('reports.frozenAtSale')
              }
            />
            <StatTile
              label={t('reports.expenses')}
              value={pnl.expenses.total}
              icon={Receipt}
              footnote={t('reports.entries', { count: pnl.expenses.count })}
            />
          </div>
        </div>

        {pnl.costEstimated ? (
          <p className="flex items-start gap-2 rounded-card border border-line-hair bg-wash-warning px-3 py-2.5 text-xs text-ink-secondary">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <Rich
                text={t('reports.estimatedWarning', {
                  estimated: pnl.estimatedLines,
                  costed: pnl.costedLines,
                })}
              />
            </span>
          </p>
        ) : null}

        <Card>
          <CardHeader
            title={t('reports.bridgeTitle')}
            subtitle={t('reports.bridgeSub')}
            icon={Coins}
          />
          <CardBody>{busy ? <SkeletonRows rows={5} /> : <Waterfall steps={bridge} />}</CardBody>
        </Card>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader
              title={t('reports.topModels')}
              subtitle={t('reports.topModelsSub')}
              icon={TrendingUp}
            />
            <CardBody>
              {busy ? (
                <SkeletonRows rows={5} />
              ) : (
                <BarList
                  rows={models.slice(0, 8)}
                  valueLabel={t('reports.grossProfit')}
                  emptyLabel={t('reports.noSales')}
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t('reports.thinMargins')}
              subtitle={t('reports.thinMarginsSub')}
              icon={TrendingDown}
            />
            <CardBody>
              {busy ? (
                <SkeletonRows rows={5} />
              ) : models.length === 0 ? (
                <p className="py-8 text-center text-xs text-ink-secondary">{t('reports.noSales')}</p>
              ) : (
                <ul className="space-y-2">
                  {[...models]
                    .sort((a, b) => a.marginPct - b.marginPct)
                    .slice(0, 6)
                    .map((model) => (
                      <li
                        key={model.key}
                        className="flex items-center justify-between gap-3 border-b border-line-hair pb-2 last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium tabular-nums text-ink">
                            {model.key}
                          </p>
                          <p className="text-2xs text-ink-secondary">
                            {t('reports.modelLine', {
                              qty: model.qty,
                              revenue: fmtMMK(model.revenue, { compact: true }),
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={`text-sm font-medium tabular-nums ${
                              model.marginPct < 20 ? 'text-status-critical' : 'text-ink'
                            }`}
                          >
                            {fmtPct(model.marginPct, 1)}
                          </p>
                          <p className="text-2xs tabular-nums text-ink-muted">
                            K {fmtMMK(model.profit, { compact: true })}
                          </p>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title={t('reports.commissionTitle')}
            subtitle={t('reports.commissionSub')}
            icon={Users}
          />
          {busy ? <SkeletonRows rows={4} /> : <CommissionTable result={commissions} />}
        </Card>
      </div>
      )}
    </>
  );
}
