import { useMemo, useState } from 'react';
import { AlertTriangle, PackageCheck, Ship } from 'lucide-react';
import { QTY_BASIS, computeLandedCost, receiptPlan } from '../../domain/landedCost';
import { poArrivalState } from '../../domain/purchasing';
import { receivePurchaseOrder } from '../../services/purchasingService';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { StatusPill } from '../ui/StatusPill';
import { ChargeSummary, LandedCostTable } from './LandedCostTable';

/**
 * A purchase order in full, and the point where it is received.
 *
 * Charges stay editable until the order is received, because freight invoices
 * arrive after the goods do — the landed cost is not final until someone has
 * the shipping bill in hand. Once received, the figures are frozen: they are
 * what the stock was valued at.
 */
export function PoDetailModal({ open, po, productsById, locations, today, onClose, onReceived }) {
  const { user } = useAuth();
  const { t } = useLocale();
  const toast = useToast();
  const [charges, setCharges] = useState(null);
  const [received, setReceived] = useState({});
  const [locationId, setLocationId] = useState('LOC-MAIN');
  const [saving, setSaving] = useState(false);

  const editable = po && po.status !== 'RECEIVED' && po.status !== 'CLOSED';

  // Local edits sit on top of the stored order until it is received.
  const working = useMemo(() => {
    if (!po) return null;
    return {
      ...po,
      charges: charges ?? po.charges,
      lines: po.lines.map((line) => {
        const key = `${line.productId}-${line.colorCode}`;
        return received[key] == null ? line : { ...line, receivedQty: Number(received[key]) || 0 };
      }),
    };
  }, [po, charges, received]);

  // While receiving, cost on what arrived — that is what the stock will be
  // valued at, and it is what the accountant needs to see before committing.
  const costed = useMemo(
    () =>
      working
        ? computeLandedCost(working, {
            qtyBasis: editable ? QTY_BASIS.RECEIVED : QTY_BASIS.ORDERED,
          })
        : null,
    [working, editable],
  );
  const plan = useMemo(
    () => (working ? receiptPlan(working, { locationId }) : null),
    [working, locationId],
  );

  if (!open || !po || !costed) return null;

  const arrival = poArrivalState(po, today);
  const costCount = (count) => t(count === 1 ? 'purchasing.costOne' : 'purchasing.costMany', { count });

  const close = () => {
    setCharges(null);
    setReceived({});
    onClose();
  };

  const onReceive = async () => {
    setSaving(true);
    const result = await receivePurchaseOrder({ po: working, locationId, actor: user });
    setSaving(false);

    if (!result.ok) {
      toast.push(result.message, { tone: 'error' });
      return;
    }
    toast.push(
      t('purchasing.receivedToast', {
        po: po.poNo,
        pieces: result.plan.movements.reduce((s, m) => s + m.qty, 0),
        costs: costCount(result.plan.costUpdates.length),
      }),
      { tone: 'success' },
    );
    onReceived?.(result);
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      width="max-w-5xl"
      title={po.poNo}
      subtitle={`${po.supplierName} · ${po.currency} @ ${po.fxRate} MMK`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('ui.close')}
          </Button>
          {editable ? (
            <Button variant="primary" icon={PackageCheck} disabled={saving} onClick={onReceive}>
              {saving ? t('purchasing.receiving') : t('purchasing.receiveIntoStock')}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-secondary">
          <StatusPill
            tone={arrival.tone}
            label={t(`purchasing.status.${arrival.key}`)}
            size="sm"
            detail={arrival.overdue ? t('purchasing.daysLate', { n: arrival.daysLate }) : null}
          />
          <span className="flex items-center gap-1">
            <Ship size={12} aria-hidden="true" />
            {t('purchasing.orderedOn', { date: fmtDate(po.orderedAt) })}
          </span>
          <span>
            {po.receivedAt
              ? t('purchasing.receivedOn', { date: fmtDate(po.receivedAt) })
              : t('purchasing.expectedOn', { date: fmtDate(po.expectedAt) })}
          </span>
          {po.note ? <span className="text-ink-muted">{po.note}</span> : null}
        </div>

        <div className="space-y-4">
          <div className="min-w-0">
            <div className="rounded-card border border-line-hair">
              <div className="border-b border-line-hair px-3 py-2">
                <p className="text-xs font-medium text-ink">{t('purchasing.breakdownTitle')}</p>
                <p className="text-2xs text-ink-secondary">
                  {t(editable ? 'purchasing.breakdownSubReceiving' : 'purchasing.breakdownSub')}
                </p>
              </div>
              <LandedCostTable costed={costed} productsById={productsById} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            {editable ? (
              <div className="rounded-card border border-line-hair">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-hair px-3 py-2">
                  <p className="text-xs font-medium text-ink">{t('purchasing.receive')}</p>
                  <label className="flex items-center gap-1.5 text-2xs text-ink-secondary">
                    {t('purchasing.into')}
                    <select
                      aria-label={t('purchasing.receivingLocation')}
                      value={locationId}
                      onChange={(e) => setLocationId(e.target.value)}
                      className="h-7 rounded border border-line-hair bg-surface px-1.5 text-2xs text-ink"
                    >
                      {locations
                        .filter((l) => l.type === 'MAIN')
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                <ul className="divide-y divide-line-hair">
                  {po.lines.map((line) => {
                    const key = `${line.productId}-${line.colorCode}`;
                    const value = received[key] ?? line.receivedQty ?? line.qty;
                    const short = Number(value) < line.qty;
                    return (
                      <li key={key} className="flex items-center justify-between gap-3 px-3 py-1.5">
                        <span className="min-w-0 truncate text-xs text-ink">
                          <span className="font-medium tabular-nums">{line.modelNo}</span>{' '}
                          <span className="text-ink-secondary">{line.colorCode}</span>
                        </span>
                        <span className="flex items-center gap-2 text-2xs text-ink-secondary">
                          {t('purchasing.orderedQty', { n: line.qty })}
                          <input
                            inputMode="numeric"
                            aria-label={t('purchasing.receivedQtyFor', {
                              item: `${line.modelNo} ${line.colorCode}`,
                            })}
                            value={value}
                            onChange={(e) =>
                              setReceived((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            className={`h-7 w-16 rounded border bg-surface px-2 text-center text-xs tabular-nums outline-none ${
                              short ? 'border-status-serious text-ink' : 'border-line-hair text-ink'
                            }`}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {plan.shortfalls.length ? (
                  <p className="flex items-start gap-2 border-t border-line-hair bg-wash-serious px-3 py-2 text-2xs text-ink-secondary">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {t('purchasing.shortBy', {
                      list: plan.shortfalls.map((s) => `${s.modelNo} ${s.colorCode} (${s.short})`).join(', '),
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-3">
            <ChargeSummary
              po={working}
              costed={costed}
              editable={editable}
              onChange={(key, value) =>
                setCharges((prev) => ({
                  ...(prev ?? po.charges),
                  [key]: Math.max(0, Number(String(value).replace(/[^\d]/g, '')) || 0),
                }))
              }
            />

            {editable ? (
              <p className="text-2xs text-ink-muted">{t('purchasing.editableNote')}</p>
            ) : (
              <p className="text-2xs text-ink-muted">
                {t('purchasing.frozenNote', {
                  date: fmtDate(po.receivedAt),
                  costs: costCount(plan.costUpdates.length),
                })}
              </p>
            )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
