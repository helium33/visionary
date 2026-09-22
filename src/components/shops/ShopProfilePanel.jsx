import { useMemo } from 'react';
import { Edit3, MapPin, Package, Phone } from 'lucide-react';
import { districtLabel, getDistrictForTownship } from '../../constants/districts';
import { shopPurchaseHistory, shopPurchaseSummary } from '../../domain/shopPurchaseHistory';
import { PRICE_TIERS } from '../../lib/constants';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/**
 * Who this shop is, and everything they have ever bought — the two things
 * Credit Management's own shop panel deliberately doesn't carry (it's built
 * for the collection workflow: open vouchers, payments, overrides). This one
 * answers "what does this shop's relationship with us look like", not
 * "what do they currently owe".
 */
export function ShopProfilePanel({ open, shop, vouchers = [], canEdit, onClose, onEdit }) {
  const rows = useMemo(() => shopPurchaseHistory(vouchers), [vouchers]);
  const summary = useMemo(() => shopPurchaseSummary(vouchers), [vouchers]);

  if (!open || !shop) return null;

  const tier = PRICE_TIERS[shop.priceTier] ?? PRICE_TIERS.STANDARD;
  const district = getDistrictForTownship(shop.township);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title={shop.name}
      subtitle={shop.nameMM}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {canEdit ? (
            <Button variant="primary" icon={Edit3} onClick={() => onEdit(shop)}>
              Edit shop
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-secondary">
          <span className="flex items-center gap-1">
            <MapPin size={13} aria-hidden="true" />
            {shop.township}
            {district ? ` · ${districtLabel(district)}` : ''}
          </span>
          {shop.phone ? (
            <span className="flex items-center gap-1">
              <Phone size={13} aria-hidden="true" /> {shop.phone}
            </span>
          ) : null}
          {shop.ownerName ? <span>{shop.ownerName}</span> : null}
          <span className="rounded bg-raised px-1.5 py-0.5">{tier.label}</span>
          <span className="rounded bg-raised px-1.5 py-0.5">{shop.code}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Lifetime revenue" value={`K ${fmtMMK(summary.revenue, { compact: true })}`} />
          <MiniStat label="Vouchers" value={summary.voucherCount} />
          <MiniStat label="Pieces bought" value={summary.pieces} />
          <MiniStat
            label="Credit limit"
            value={shop.creditLimit ? `K ${fmtMMK(shop.creditLimit, { compact: true })}` : 'No limit'}
          />
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
            <Package size={13} aria-hidden="true" /> Full purchase history
          </h3>
          <div className="max-h-80 overflow-y-auto overflow-x-auto rounded-card border border-line-hair">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line-hair text-left text-2xs text-ink-secondary">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">Colour</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b border-line-hair last:border-0">
                    <td className="px-3 py-2 text-ink-secondary">{fmtDate(row.date, 'dd MMM yyyy')}</td>
                    <td className="px-3 py-2 tabular-nums text-ink">
                      {row.modelNo}
                      {row.type === 'CONSIGNMENT' ? (
                        <span className="ml-1.5 rounded bg-wash-accent px-1 py-0.5 text-2xs text-ink-secondary">
                          consignment
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">{row.colorName}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{row.qty}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">
                      {fmtMMK(row.amount)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-xs text-ink-secondary">
                      No purchases on record for this shop yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-card border border-line-hair px-3 py-2">
      <p className="text-2xs text-ink-secondary">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
