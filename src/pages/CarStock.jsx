import { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Boxes,
  CreditCard,
  MapPin,
  PackagePlus,
  Truck,
  Users,
} from 'lucide-react';
import { TRIP_STATUS, reconcileTrip } from '../domain/carStock';
import { ROLES } from '../lib/constants';
import { loadCar } from '../services/carStockService';
import {
  subscribeCarTrips,
  subscribePayments,
  subscribeRecentVouchers,
  subscribeUsers,
} from '../services/dataSource';
import { fmtDateTime } from '../lib/dates';
import { fmtMMK } from '../lib/format';
import { townshipLabel } from '../constants/districts';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useCatalogue } from '../hooks/useCatalogue';
import { useToday } from '../hooks/useToday';
import { ReconcilePanel } from '../components/carstock/ReconcilePanel';
import { GridFastEntry } from '../components/voucher/GridFastEntry';
import { ModelPicker } from '../components/voucher/ModelPicker';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { SkeletonRows } from '../components/ui/EmptyState';
import { StatTile } from '../components/ui/StatTile';
import { StatusPill } from '../components/ui/StatusPill';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { PageHeader } from '../components/layout/AppShell';

/**
 * ===========================================================================
 * CAR STOCK
 * ===========================================================================
 * A rep leaves with a bag of frames and comes back with some frames, some cash
 * and some new debt. The three have to tie out together or the business does
 * not know what it owns.
 *
 * The expected figure is built from the trip's own movements — took, sold,
 * should have — rather than read off the live stock field, so the rep can
 * check the arithmetic standing at the counter. A reconciliation nobody trusts
 * gets signed without counting.
 */
export default function CarStock() {
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const today = useToday();
  const toast = useToast();
  const { byId, frames, ensureVariants, loading: catalogueLoading } = useCatalogue({
    allVariants: true,
  });

  const [trips, setTrips] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [modelId, setModelId] = useState(null);
  const [loadingCar, setLoadingCar] = useState(false);

  useEffect(() => {
    const pending = new Set(['t', 'v', 'p', 'u']);
    const settle = (key) => {
      pending.delete(key);
      if (pending.size === 0) setLoading(false);
    };
    const since = new Date(today.getTime() - 1000 * 60 * 60 * 24 * 30);
    const unsubs = [
      subscribeCarTrips(({ data }) => {
        setTrips(data);
        settle('t');
      }, {}),
      subscribeRecentVouchers(({ data }) => {
        setVouchers(data);
        settle('v');
      }, { since }),
      subscribePayments(({ data }) => {
        setPayments(data);
        settle('p');
      }, { since }),
      subscribeUsers(({ data }) => {
        setUsers(data);
        settle('u');
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (modelId) ensureVariants(modelId);
  }, [modelId, ensureVariants]);

  const sorted = useMemo(
    () => [...trips].sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt)),
    [trips],
  );

  const selected = useMemo(
    () => sorted.find((trip) => trip.id === selectedId) ?? sorted.find((trip) => trip.status === 'OPEN') ?? sorted[0],
    [sorted, selectedId],
  );

  /** Reconciliation is pure, so the panel can re-run it as the rep types. */
  const reconcile = (trip) =>
    reconcileTrip({ trip, vouchers, payments, productsById: byId, today });

  const reconciliation = useMemo(
    () => (selected ? reconcile(selected) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, vouchers, payments, byId, today],
  );

  const reps = useMemo(() => users.filter((u) => u.role === ROLES.SALES), [users]);
  const openTrips = sorted.filter((trip) => trip.status === 'OPEN');

  const onRoad = useMemo(
    () =>
      openTrips.reduce((total, trip) => {
        const r = reconcile(trip);
        return total + (r?.piecesExpected ?? 0);
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openTrips, vouchers, payments, byId, today],
  );

  const cashOut = useMemo(
    () => openTrips.reduce((total, trip) => total + (reconcile(trip)?.expectedCash ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openTrips, vouchers, payments, byId, today],
  );

  const creditOut = useMemo(
    () => openTrips.reduce((total, trip) => total + (reconcile(trip)?.creditIssued ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openTrips, vouchers, payments, byId, today],
  );

  const selectedModel = modelId ? byId.get(modelId) : null;
  const canLoad = selected?.status === 'OPEN';

  const onLoad = async (lines) => {
    setLoadingCar(true);
    const result = await loadCar({
      trip: selected,
      lines: lines.map((line) => ({
        ...line,
        modelNo: byId.get(line.productId)?.modelNo,
        colorName: byId
          .get(line.productId)
          ?.variants?.find((v) => v.colorCode === line.colorCode)?.colorName,
      })),
      actor: user,
    });
    setLoadingCar(false);
    toast.push(
      result.ok
        ? t('carstock.loadedToast', {
            pieces: lines.reduce((s, l) => s + l.qty, 0),
            rep: selected.repName,
          })
        : result.message,
      { tone: result.ok ? 'success' : 'error' },
    );
  };

  return (
    <>
      <PageHeader
        title={t('carstock.title')}
        subtitle={t('carstock.subtitle')}
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label={t('carstock.statTrips')}
            value={openTrips.length}
            unit=""
            raw
            icon={Truck}
            footnote={openTrips.map((trip) => trip.repName).join(', ') || t('carstock.statEveryoneIn')}
          />
          <StatTile
            label={t('carstock.statOnRoad')}
            value={onRoad}
            unit=""
            raw
            icon={Boxes}
            footnote={t('carstock.statOnRoadNote')}
          />
          <StatTile
            label={t('carstock.statCash')}
            value={cashOut}
            icon={Banknote}
            footnote={t('carstock.statCashNote')}
          />
          <StatTile
            label={t('carstock.statCredit')}
            value={creditOut}
            icon={CreditCard}
            footnote={t('carstock.statCreditNote')}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardHeader title={t('carstock.trips')} icon={Users} />
            {loading ? (
              <SkeletonRows rows={3} />
            ) : (
              <ul className="divide-y divide-line-hair">
                {sorted.map((trip) => {
                  const meta = TRIP_STATUS[trip.status] ?? TRIP_STATUS.OPEN;
                  const active = trip.id === selected?.id;
                  return (
                    <li key={trip.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(trip.id)}
                        aria-pressed={active}
                        className={`w-full px-4 py-2.5 text-left transition ${
                          active ? 'bg-raised' : 'hover:bg-raised'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">{trip.repName}</p>
                            <p className="truncate text-2xs tabular-nums text-ink-secondary">
                              {trip.tripNo}
                            </p>
                          </div>
                          <StatusPill tone={meta.tone} label={t(`carstock.status.${meta.key}`)} size="sm" />
                        </div>
                        {trip.route?.length ? (
                          <p className="mt-1 flex items-center gap-1 text-2xs text-ink-muted">
                            <MapPin size={10} aria-hidden="true" />
                            {trip.route.map((name) => townshipLabel(name, locale)).join(' · ')}
                          </p>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
                {sorted.length === 0 ? (
                  <li className="px-4 py-6 text-center text-xs text-ink-secondary">
                    {t('carstock.noTrips', { count: reps.length })}
                  </li>
                ) : null}
              </ul>
            )}
          </Card>

          <div className="min-w-0 space-y-4">
            {!selected ? (
              <Card>
                <CardBody>
                  <p className="py-8 text-center text-xs text-ink-secondary">
                    {t('carstock.selectTrip')}
                  </p>
                </CardBody>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader
                    title={`${selected.repName} · ${selected.tripNo}`}
                    subtitle={
                      selected.closedAt
                        ? t('carstock.outSinceSettled', {
                            date: fmtDateTime(selected.openedAt),
                            settled: fmtDateTime(selected.closedAt),
                          })
                        : t('carstock.outSince', { date: fmtDateTime(selected.openedAt) })
                    }
                    icon={Truck}
                    action={
                      <StatusPill
                        tone={(TRIP_STATUS[selected.status] ?? TRIP_STATUS.OPEN).tone}
                        label={t(`carstock.status.${(TRIP_STATUS[selected.status] ?? TRIP_STATUS.OPEN).key}`)}
                        size="sm"
                      />
                    }
                  />

                  {reconciliation ? (
                    <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Fact
                        label={t('carstock.factTookOut')}
                        value={t('common.pcs', { n: reconciliation.piecesOut })}
                      />
                      <Fact
                        label={t('carstock.factSold')}
                        value={t('common.pcs', { n: reconciliation.piecesSold })}
                      />
                      <Fact
                        label={t('carstock.factCash')}
                        value={`K ${fmtMMK(reconciliation.expectedCash, { compact: true })}`}
                      />
                      <Fact
                        label={t('carstock.factCredit')}
                        value={`K ${fmtMMK(reconciliation.creditIssued, { compact: true })}`}
                      />
                    </CardBody>
                  ) : null}
                </Card>

                {canLoad ? (
                  <Card>
                    <CardHeader
                      title={t('carstock.loadTitle')}
                      subtitle={t('carstock.loadSub')}
                      icon={PackagePlus}
                    />
                    <CardBody className="pb-0">
                      {catalogueLoading ? (
                        <SkeletonRows rows={3} />
                      ) : (
                        <ModelPicker products={frames} selectedId={modelId} onSelect={setModelId} />
                      )}
                    </CardBody>
                    <div className="mt-3 border-t border-line-hair">
                      <GridFastEntry
                        product={selectedModel}
                        locationId="LOC-MAIN"
                        purpose="TRANSFER"
                        addLabel={loadingCar ? t('carstock.loading') : t('carstock.load')}
                        onAdd={onLoad}
                      />
                    </div>
                  </Card>
                ) : null}

                <Card>
                  <CardHeader
                    title={t(selected.status === 'CLOSED' ? 'carstock.reconciliation' : 'carstock.countIn')}
                    subtitle={t(
                      selected.status === 'CLOSED' ? 'carstock.reconciledSub' : 'carstock.countInSub',
                    )}
                    icon={Banknote}
                  />
                  <CardBody>
                    {!reconciliation ? (
                      <SkeletonRows rows={4} />
                    ) : selected.status === 'CLOSED' ? (
                      <ClosedSummary reconciliation={reconciliation} />
                    ) : (
                      <ReconcilePanel
                        key={selected.id}
                        reconciliation={reconciliation}
                        onCounted={reconcile}
                        onClosed={() => setSelectedId(selected.id)}
                      />
                    )}
                  </CardBody>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ClosedSummary({ reconciliation }) {
  const { t } = useLocale();
  const short = reconciliation.shortPieces > 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label={t('carstock.shouldHaveHad')} value={t('common.pcs', { n: reconciliation.piecesExpected })} />
        <Fact label={t('carstock.counted')} value={t('common.pcs', { n: reconciliation.piecesCounted ?? 0 })} />
        <Fact
          label={t('carstock.short')}
          value={short ? t('common.pcs', { n: reconciliation.shortPieces }) : t('carstock.none')}
          tone={short ? 'critical' : 'good'}
        />
        <Fact
          label={t('carstock.cashVariance')}
          value={
            reconciliation.cashVariance == null
              ? '—'
              : `K ${fmtMMK(Math.abs(reconciliation.cashVariance))}`
          }
          tone={reconciliation.cashVariance ? 'critical' : 'good'}
        />
      </div>

      {short ? (
        <div className="overflow-x-auto rounded-card border border-line-hair">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-line-hair text-left text-2xs text-ink-secondary">
                <th className="px-3 py-2 font-medium">{t('carstock.colItem')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('carstock.colShort')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('carstock.colAtCost')}</th>
              </tr>
            </thead>
            <tbody>
              {reconciliation.shortLines.map((line) => (
                <tr key={line.key} className="border-b border-line-hair last:border-0">
                  <td className="px-3 py-2 text-ink">
                    <span className="font-medium tabular-nums">{line.modelNo}</span>{' '}
                    <span className="text-ink-secondary">{line.colorCode}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-status-critical">
                    {line.variance}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink">
                    K {fmtMMK(Math.abs(line.varianceValue))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-status-good">{t('carstock.allTiedOut')}</p>
      )}

      {reconciliation.trip.cash?.note ? (
        <p className="text-2xs text-ink-muted">{reconciliation.trip.cash.note}</p>
      ) : null}
    </div>
  );
}

function Fact({ label, value, tone = 'neutral' }) {
  return (
    <div className="rounded-card border border-line-hair px-3 py-2">
      <p className="text-2xs text-ink-secondary">{label}</p>
      <p
        className={`mt-0.5 text-base font-semibold tabular-nums ${
          tone === 'critical' ? 'text-status-critical' : tone === 'good' ? 'text-status-good' : 'text-ink'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
