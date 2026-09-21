import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  PackageCheck,
  Smartphone,
} from 'lucide-react';
import { closeTrip } from '../../services/carStockService';
import { fmtMMK } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ui/Toast';
import { Button } from '../ui/Button';

/**
 * The count-in. Three things have to tie out together — stock, cash, debt —
 * and each is shown with its expected figure beside the counted one, because a
 * rep who is told only "you are short" has no way to check the claim.
 *
 * Debt is deliberately NOT a variance: selling on 14-day terms is the job, and
 * showing new credit in the same column as missing stock would train everyone
 * to ignore the column.
 */
export function ReconcilePanel({ reconciliation, onCounted, onClosed }) {
  const { user } = useAuth();
  const toast = useToast();
  const [counts, setCounts] = useState({});
  const [cash, setCash] = useState('');
  const [returnToWarehouse, setReturnToWarehouse] = useState(true);
  const [saving, setSaving] = useState(false);

  // Local counts sit on top of the trip until it is settled.
  const working = useMemo(() => {
    const countedLines = reconciliation.stockLines.map((line) => ({
      productId: line.productId,
      modelNo: line.modelNo,
      colorCode: line.colorCode,
      qty: counts[line.key] == null ? line.expected : Number(counts[line.key]) || 0,
    }));
    return {
      ...reconciliation.trip,
      countedLines,
      cash: { counted: cash === '' ? null : Number(String(cash).replace(/[^\d]/g, '')) || 0 },
    };
  }, [reconciliation, counts, cash]);

  const live = onCounted(working);
  const cashCounted = live.countedCash;
  const cashShort = live.cashVariance != null && live.cashVariance < 0;

  const onSettle = async () => {
    setSaving(true);
    const result = await closeTrip({
      trip: reconciliation.trip,
      reconciliation: live,
      returnToWarehouse,
      actor: user,
    });
    setSaving(false);

    if (!result.ok) {
      toast.push(result.message, { tone: 'error' });
      return;
    }
    toast.push(
      `${reconciliation.trip.tripNo} settled` +
        (live.shortPieces ? ` · ${live.shortPieces} pcs short (K ${fmtMMK(live.shortValue)})` : '') +
        (live.cashVariance ? ` · cash off by K ${fmtMMK(Math.abs(live.cashVariance))}` : ''),
      { tone: live.balanced ? 'success' : 'info' },
    );
    onClosed?.(result);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line-hair">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-hair px-3 py-2">
          <p className="text-xs font-medium text-ink">Count the bag</p>
          <p className="text-2xs text-ink-secondary">
            Took {live.piecesOut} · sold {live.piecesSold} · should have{' '}
            <span className="font-medium text-ink">{live.piecesExpected}</span>
          </p>
        </div>

        {/* Phone: the counted input is the whole point of this screen, so it
            gets a row of its own rather than being scrolled off the right. */}
        <ul className="divide-y divide-line-hair lg:hidden">
          {live.stockLines.map((line) => {
            const off = line.variance !== 0;
            return (
              <li key={line.key} className="px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">
                      <span className="font-medium tabular-nums">{line.modelNo}</span>{' '}
                      <span className="text-ink-secondary">{line.colorCode}</span>
                    </p>
                    <p className="text-2xs text-ink-secondary">
                      took {line.opening + line.loaded} · sold {line.sold} · should have{' '}
                      <span className="font-medium text-ink">{line.expected}</span>
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {off ? (
                      <span
                        className={`text-right text-xs font-medium tabular-nums ${
                          line.variance < 0 ? 'text-status-critical' : 'text-status-serious'
                        }`}
                      >
                        {line.variance > 0 ? '+' : ''}
                        {line.variance}
                        {line.variance < 0 ? (
                          <span className="block text-2xs font-normal text-ink-muted">
                            K {fmtMMK(Math.abs(line.varianceValue))}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    <input
                      inputMode="numeric"
                      aria-label={`Counted ${line.modelNo} ${line.colorCode}`}
                      value={counts[line.key] ?? line.expected}
                      onChange={(e) => setCounts((prev) => ({ ...prev, [line.key]: e.target.value }))}
                      className={`h-9 w-14 rounded border bg-surface text-center text-sm
                        font-medium tabular-nums outline-none ${
                          off ? 'border-status-serious text-ink' : 'border-line-hair text-ink'
                        }`}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[520px] text-sm">            <thead>
              <tr className="border-b border-line-hair text-left text-2xs text-ink-secondary">
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-2 py-2 text-right font-medium">Took</th>
                <th className="px-2 py-2 text-right font-medium">Sold</th>
                <th className="px-2 py-2 text-right font-medium">Should have</th>
                <th className="px-2 py-2 text-center font-medium">Counted</th>
                <th className="px-3 py-2 text-right font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {live.stockLines.map((line) => {
                const short = line.variance < 0;
                const over = line.variance > 0;
                return (
                  <tr key={line.key} className="border-b border-line-hair last:border-0">
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="font-medium tabular-nums text-ink">{line.modelNo}</span>
                      <span className="ml-1.5 text-ink-secondary">{line.colorCode}</span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-secondary">
                      {line.opening + line.loaded}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-secondary">
                      {line.sold}
                    </td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums text-ink">
                      {line.expected}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        inputMode="numeric"
                        aria-label={`Counted ${line.modelNo} ${line.colorCode}`}
                        value={counts[line.key] ?? line.expected}
                        onChange={(e) =>
                          setCounts((prev) => ({ ...prev, [line.key]: e.target.value }))
                        }
                        className={`h-8 w-14 rounded border bg-surface text-center text-sm
                          tabular-nums outline-none ${
                            short || over
                              ? 'border-status-serious text-ink'
                              : 'border-line-hair text-ink'
                          }`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {line.variance === 0 ? (
                        <span className="text-ink-muted">—</span>
                      ) : (
                        <>
                          <span
                            className={`font-medium tabular-nums ${
                              short ? 'text-status-critical' : 'text-status-serious'
                            }`}
                          >
                            {line.variance > 0 ? '+' : ''}
                            {line.variance}
                          </span>
                          {short ? (
                            <span className="block text-2xs tabular-nums text-ink-muted">
                              K {fmtMMK(Math.abs(line.varianceValue))}
                            </span>
                          ) : null}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-line-hair p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink">
            <Banknote size={13} aria-hidden="true" />
            Cash to hand over
          </p>

          <dl className="space-y-1.5 text-sm">
            <Row label="Cash collected today" value={live.expectedCash} strong />
            <Row
              label="Collected by phone"
              value={live.digitalCollected}
              note="already in the bank"
              icon={Smartphone}
            />
          </dl>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium text-ink">Cash counted</span>
            <input
              inputMode="numeric"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              placeholder={String(live.expectedCash)}
              className="h-9 w-full rounded-md border border-line-hair bg-surface px-3 text-sm tabular-nums text-ink outline-none"
            />
          </label>

          {cashCounted != null ? (
            <p
              className={`mt-2 flex items-center gap-1.5 text-xs ${
                live.cashVariance === 0
                  ? 'text-status-good'
                  : cashShort
                    ? 'text-status-critical'
                    : 'text-status-serious'
              }`}
            >
              {live.cashVariance === 0 ? (
                <CheckCircle2 size={13} aria-hidden="true" />
              ) : (
                <AlertTriangle size={13} aria-hidden="true" />
              )}
              {live.cashVariance === 0
                ? 'Cash agrees'
                : `${cashShort ? 'Short' : 'Over'} by K ${fmtMMK(Math.abs(live.cashVariance))}`}
            </p>
          ) : (
            <p className="mt-2 text-2xs text-ink-muted">
              Leave blank to accept the expected figure.
            </p>
          )}
        </div>

        <div className="rounded-card border border-line-hair p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink">
            <CreditCard size={13} aria-hidden="true" />
            Left on the shops&rsquo; accounts
          </p>
          <dl className="space-y-1.5 text-sm">
            <Row label="Sold on credit today" value={live.creditIssued} strong />
            <Row label="Sales written" value={live.salesValue} />
            {live.consignedValue > 0 ? (
              <Row label="Consignment placed" value={live.consignedValue} note="not revenue yet" />
            ) : null}
          </dl>
          <p className="mt-2 text-2xs text-ink-muted">
            New credit is the expected result of selling on 14-day terms, not a discrepancy — it
            moves to credit control, where the clock is already running.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line-hair px-3 py-2.5">
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={returnToWarehouse}
            onChange={(e) => setReturnToWarehouse(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Return remaining stock to the warehouse
          <span className="text-ink-muted">
            ({live.piecesCounted ?? live.piecesExpected} pcs)
          </span>
        </label>

        <Button variant="primary" icon={PackageCheck} disabled={saving} onClick={onSettle}>
          {saving ? 'Settling…' : 'Settle trip'}
        </Button>
      </div>

      {!live.balanced ? (
        <p className="flex items-start gap-2 rounded-card border border-status-serious/40 bg-wash-serious px-3 py-2.5 text-xs text-ink-secondary">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Settling now records the difference as an adjustment against{' '}
            {reconciliation.trip.repName} — {live.shortPieces > 0 ? `${live.shortPieces} pcs ` : ''}
            {live.shortValue > 0 ? `(K ${fmtMMK(live.shortValue)}) ` : ''}
            {live.cashVariance ? `and K ${fmtMMK(Math.abs(live.cashVariance))} of cash ` : ''}
            will be written to the stock journal, not absorbed quietly.
          </span>
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, value, strong, note, icon: Icon }) {
  return (
    // Wraps rather than squeezing: on a phone the amount drops to its own line
    // instead of breaking "K 830,000" across two.
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-ink-secondary">
        {Icon ? <Icon size={12} className="shrink-0" aria-hidden="true" /> : null}
        {label}
        {note ? <span className="text-ink-muted">· {note}</span> : null}
      </dt>
      <dd
        className={`whitespace-nowrap tabular-nums ${
          strong ? 'font-semibold text-ink' : 'text-ink'
        }`}
      >
        K {fmtMMK(value)}
      </dd>
    </div>
  );
}
