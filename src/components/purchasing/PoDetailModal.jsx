import { useMemo, useState } from 'react';
import { AlertTriangle, PackageCheck, Ship } from 'lucide-react';
import { QTY_BASIS, computeLandedCost, receiptPlan } from '../../domain/landedCost';
import { poArrivalState } from '../../domain/purchasing';
import { receivePurchaseOrder } from '../../services/purchasingService';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
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
      `${po.poNo} received · ${result.plan.movements.reduce((s, m) => s + m.qty, 0)} pcs into stock · ` +
        `${result.plan.costUpdates.length} product cost${result.plan.costUpdates.length === 1 ? '' : 's'} restated`,
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
            Close
          </Button>
          {editable ? (
            <Button variant="primary" icon={PackageCheck} disabled={saving} onClick={onReceive}>
              {saving ? 'Receiving…' : 'Receive into stock'}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-secondary">
          <StatusPill
            tone={arrival.tone}
            label={arrival.label}
            size="sm"
            detail={arrival.overdue ? `${arrival.daysLate}d late` : null}
          />
          <span className="flex items-center gap-1">
            <Ship size={12} aria-hidden="true" />
            Ordered {fmtDate(po.orderedAt)}
          </span>
          <span>
            {po.receivedAt ? `Received ${fmtDate(po.receivedAt)}` : `Expected ${fmtDate(po.expectedAt)}`}
          </span>
          {po.note ? <span className="text-ink-muted">{po.note}</span> : null}
        </div>

        <div className="space-y-4">
          <div className="min-w-0">
            <div className="rounded-card border border-line-hair">
              <div className="border-b border-line-hair px-3 py-2">
                <p className="text-xs font-medium text-ink">Landed cost breakdown</p>
                <p className="text-2xs text-ink-secondary">
                  Factory price plus its share of charges, per piece
                  {editable ? ' — costed on what arrives' : ''}
                </p>
              </div>
              <LandedCostTable costed={costed} productsById={productsById} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            {editable ? (
              <div className="rounded-card border border-line-hair">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-hair px-3 py-2">
                  <p className="text-xs font-medium text-ink">Receive</p>
                  <label className="flex items-center gap-1.5 text-2xs text-ink-secondary">
                    Into
                    <select
                      aria-label="Receiving location"
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
                          ordered {line.qty}
                          <input
                            inputMode="numeric"
                            aria-label={`Received quantity for ${line.modelNo} ${line.colorCode}`}
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
                    Short by{' '}
                    {plan.shortfalls.map((s) => `${s.modelNo} ${s.colorCode} (${s.short})`).join(', ')}
                    . Only what arrived goes into stock, and the cost is spread across that.
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
              <p className="text-2xs text-ink-muted">
                Freight invoices arrive after the goods do, so charges stay editable until the order
                is received. After that the figures are frozen — they are what the stock was valued
                at.
              </p>
            ) : (
              <p className="text-2xs text-ink-muted">
                Received {fmtDate(po.receivedAt)}. These figures are what{' '}
                {plan.costUpdates.length} product cost
                {plan.costUpdates.length === 1 ? '' : 's'} were set to.
              </p>
            )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
