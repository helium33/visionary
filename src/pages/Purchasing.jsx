import { useEffect, useMemo, useState } from 'react';
import { subDays } from 'date-fns';
import { Coins, Receipt, Ship, TrendingUp, Truck } from 'lucide-react';
import { computeLandedCost } from '../domain/landedCost';
import { openCommitments, summariseExpenses } from '../domain/purchasing';
import {
  subscribeExpenses,
  subscribePurchaseOrders,
  subscribeStockLocations,
} from '../services/dataSource';
import { fmtDate } from '../lib/dates';
import { fmtMMK, fmtPct } from '../lib/format';
import { useCatalogue } from '../hooks/useCatalogue';
import { useToday } from '../hooks/useToday';
import { useLocale } from '../context/LocaleContext';
import { ExpensesPanel } from '../components/purchasing/ExpensesPanel';
import { PoDetailModal } from '../components/purchasing/PoDetailModal';
import { PoTable } from '../components/purchasing/PoTable';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { SkeletonRows } from '../components/ui/EmptyState';
import { StatTile } from '../components/ui/StatTile';
import { StatusPill } from '../components/ui/StatusPill';
import { PageHeader } from '../components/layout/AppShell';

/**
 * ===========================================================================
 * PURCHASING & LANDED COST
 * ===========================================================================
 * Factory price + cargo + transport + labeling = actual cost.
 *
 * This is where estimated cost becomes real. Receiving a purchase order writes
 * the landed figure back to `products.costing.actualCost`, and every margin,
 * stock valuation and dead-stock capital number in the system reads that one
 * field — so the profit side of the business is only as honest as this screen.
 */
const TABS = [
  { key: 'ORDERS', label: 'purchasing.tabOrders' },
  { key: 'EXPENSES', label: 'purchasing.tabExpenses' },
];

const PERIODS = [
  { key: 30, label: 'common.last30' },
  { key: 90, label: 'common.last90' },
  { key: 365, label: 'common.last365' },
];

export default function Purchasing() {
  const today = useToday();
  const { t } = useLocale();
  const { byId, loading: catalogueLoading } = useCatalogue();
  const [orders, setOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ORDERS');
  const [days, setDays] = useState(90);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let gotOrders = false;
    let gotExpenses = false;
    const settle = () => {
      if (gotOrders && gotExpenses) setLoading(false);
    };
    const unsubOrders = subscribePurchaseOrders(({ data }) => {
      setOrders(data);
      gotOrders = true;
      settle();
    });
    const unsubExpenses = subscribeExpenses(({ data }) => {
      setExpenses(data);
      gotExpenses = true;
      settle();
    });
    const unsubLocations = subscribeStockLocations(({ data }) => setLocations(data));
    return () => {
      unsubOrders();
      unsubExpenses();
      unsubLocations();
    };
  }, []);

  const from = useMemo(() => subDays(today, days), [today, days]);

  const expenseSummary = useMemo(
    () => summariseExpenses(expenses, { from, to: today }),
    [expenses, from, today],
  );

  const commitments = useMemo(() => openCommitments(orders, today), [orders, today]);

  /** Everything that actually landed inside the window — the real cost base. */
  const received = useMemo(
    () =>
      orders
        .filter((po) => po.status === 'RECEIVED' && po.receivedAt && new Date(po.receivedAt) >= from)
        .map((po) => ({ po, costed: computeLandedCost(po) })),
    [orders, from],
  );

  const totals = useMemo(() => {
    const committedValue = commitments.reduce(
      (sum, { po }) => sum + computeLandedCost(po).totalLanded,
      0,
    );
    const landedValue = received.reduce((sum, { costed }) => sum + costed.totalLanded, 0);
    const factoryValue = received.reduce((sum, { costed }) => sum + costed.totalFactoryMMK, 0);
    const pieces = received.reduce((sum, { costed }) => sum + costed.totalQty, 0);

    return {
      committedValue,
      committedCount: commitments.length,
      landedValue,
      factoryValue,
      pieces,
      // What freight and handling add to the factory price — the figure that
      // decides whether air freight was worth it.
      upliftPct: factoryValue ? ((landedValue - factoryValue) / factoryValue) * 100 : 0,
      avgUnitCost: pieces ? Math.round(landedValue / pieces) : 0,
      lateCount: commitments.filter(({ arrival }) => arrival.overdue).length,
    };
  }, [commitments, received]);

  const sortedOrders = useMemo(
    () =>
      [...orders].sort(
        (a, b) => new Date(b.orderedAt ?? 0) - new Date(a.orderedAt ?? 0),
      ),
    [orders],
  );

  return (
    <>
      <PageHeader
        title={t('purchasing.title')}
        subtitle={t('purchasing.subtitle')}
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

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label={t('purchasing.statCommitted')}
            value={totals.committedValue}
            icon={Ship}
            tone={totals.lateCount > 0 ? 'critical' : 'neutral'}
            footnote={
              !totals.committedCount
                ? t('purchasing.statNothingOnWater')
                : totals.lateCount
                  ? t('purchasing.statOrdersLate', { count: totals.committedCount, late: totals.lateCount })
                  : t('purchasing.statOrders', { count: totals.committedCount })
            }
          />
          <StatTile
            label={t('purchasing.statLanded')}
            value={totals.landedValue}
            icon={Coins}
            footnote={t('purchasing.statLandedNote', {
              pieces: totals.pieces,
              avg: fmtMMK(totals.avgUnitCost),
            })}
          />
          <StatTile
            label={t('purchasing.statUplift')}
            value={fmtPct(totals.upliftPct, 1)}
            unit=""
            raw
            icon={Truck}
            footnote={t('purchasing.statUpliftNote', {
              amount: fmtMMK(totals.factoryValue, { compact: true }),
            })}
          />
          <StatTile
            label={t('purchasing.statExpenses')}
            value={expenseSummary.total}
            icon={Receipt}
            footnote={t('purchasing.statExpensesNote', { count: expenseSummary.count, days })}
          />
        </div>

        {commitments.length ? (
          <Card>
            <CardHeader
              title={t('purchasing.onWaterTitle')}
              subtitle={t('purchasing.onWaterSub')}
              icon={Ship}
            />
            <CardBody className="space-y-2 pt-0">
              <ul className="divide-y divide-line-hair">
                {commitments.map(({ po, arrival }) => {
                  const costed = computeLandedCost(po);
                  return (
                    <li
                      key={po.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(po)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-medium tabular-nums text-ink">
                          {po.poNo}
                        </p>
                        <p className="truncate text-2xs text-ink-secondary">
                          {po.supplierName} · {t('common.pcs', { n: costed.totalQty })}
                        </p>
                      </button>
                      <StatusPill
                        tone={arrival.tone}
                        label={t(`purchasing.status.${arrival.key}`)}
                        size="sm"
                        detail={
                          arrival.overdue
                            ? t('purchasing.daysLate', { n: arrival.daysLate })
                            : arrival.daysUntil != null
                              ? t('purchasing.inDays', { n: arrival.daysUntil })
                              : null
                        }
                      />
                      <span className="text-2xs text-ink-secondary">
                        {fmtDate(po.expectedAt, 'dd MMM')}
                      </span>
                      <span className="w-24 text-right text-sm font-medium tabular-nums text-ink">
                        K {fmtMMK(costed.totalLanded, { compact: true })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title={t(tab === 'ORDERS' ? 'purchasing.tabOrders' : 'purchasing.tabExpenses')}
            subtitle={t(tab === 'ORDERS' ? 'purchasing.ordersSub' : 'purchasing.expensesSub')}
            icon={tab === 'ORDERS' ? Ship : Receipt}
          />

          <div className="flex flex-wrap gap-1 border-b border-line-hair px-4 py-2">
            {TABS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setTab(option.key)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  tab === option.key
                    ? 'bg-ink text-plane'
                    : 'text-ink-secondary hover:bg-raised hover:text-ink'
                }`}
              >
                {t(option.label)}
                <span className="ml-1.5 tabular-nums opacity-70">
                  {option.key === 'ORDERS' ? orders.length : expenseSummary.count}
                </span>
              </button>
            ))}
          </div>

          {loading || catalogueLoading ? (
            <SkeletonRows rows={6} />
          ) : tab === 'ORDERS' ? (
            <PoTable orders={sortedOrders} today={today} onOpen={setSelected} />
          ) : (
            <ExpensesPanel summary={expenseSummary} />
          )}
        </Card>

        <p className="flex items-start gap-2 px-1 text-2xs text-ink-secondary">
          <TrendingUp size={13} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
          {t('purchasing.footnote')}
        </p>
      </div>

      <PoDetailModal
        open={Boolean(selected)}
        po={selected}
        productsById={byId}
        locations={locations}
        today={today}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
