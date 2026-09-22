import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CornerDownLeft, Minus, Package, Plus } from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { QTY_TIERS, qtyTierFor, resolveLinePrice } from '../../domain/pricing';
import { fmtMMK } from '../../lib/format';
import { productAttributes } from '../../lib/productAttributes';
import { Button } from '../ui/Button';

/**
 * ---------------------------------------------------------------------------
 * GRID FAST ENTRY
 * ---------------------------------------------------------------------------
 * Pick a model, see its whole colour row, type quantities straight down it.
 *
 * The speed comes from three things, in order of how much they matter to a rep
 * standing in a shop:
 *
 *  1. ONE SCREEN PER MODEL. Every colour of PB-2026 is visible at once, so the
 *     rep reads the shop's order out ("C1 ten, C2 five") without navigating.
 *  2. THE KEYBOARD NEVER LEAVES THE COLUMN. Enter and ArrowDown move to the
 *     next colour, ArrowUp goes back, and Enter on the last row commits the
 *     model to the voucher. On a laptop the whole order is typed without a
 *     mouse; on a phone the steppers do the same job under a thumb.
 *  3. THE TIER IS LIVE. The running model quantity decides the price band, so
 *     the grid shows the rate the shop is about to get and how many more
 *     pieces would earn the next one — the rep can upsell mid-sentence.
 */
export function GridFastEntry({
  product,
  shopTier = 'STANDARD',
  locationId,
  onAdd,
  existingQty = 0,
  // TRANSFER drops everything about price: loading a rep's bag moves stock
  // between our own locations, so a selling price on the row is noise.
  purpose = 'SELL',
  addLabel,
}) {
  const { t } = useLocale();
  const isTransfer = purpose === 'TRANSFER';
  const [quantities, setQuantities] = useState({});
  const inputRefs = useRef([]);

  // Switching model clears the pad — the previous model's numbers have already
  // been committed to the voucher and must never bleed into the next one.
  useEffect(() => {
    setQuantities({});
    inputRefs.current = [];
  }, [product?.id]);

  const variants = product?.variants ?? [];

  const totalQty = useMemo(
    () => Object.values(quantities).reduce((sum, q) => sum + (Number(q) || 0), 0),
    [quantities],
  );

  // Quantity tiers are earned per model across the voucher, so anything already
  // added for this model counts toward the band.
  const effectiveQty = totalQty + existingQty;
  const pricing = resolveLinePrice(product, shopTier, effectiveQty);
  const nextTier = QTY_TIERS.slice()
    .reverse()
    .find((tier) => effectiveQty < tier.minQty);

  const lineTotal = useMemo(
    () =>
      variants.reduce(
        (sum, variant) => sum + (Number(quantities[variant.colorCode]) || 0) * pricing.unitPrice,
        0,
      ),
    [variants, quantities, pricing.unitPrice],
  );

  const setQty = (colorCode, value) => {
    const qty = Math.max(0, Math.floor(Number(value) || 0));
    setQuantities((prev) => ({ ...prev, [colorCode]: qty === 0 ? '' : qty }));
  };

  const bump = (colorCode, delta) => {
    setQuantities((prev) => {
      const next = Math.max(0, (Number(prev[colorCode]) || 0) + delta);
      return { ...prev, [colorCode]: next === 0 ? '' : next };
    });
  };

  const focusRow = (index) => {
    const target = inputRefs.current[index];
    if (target) {
      target.focus();
      target.select();
    }
  };

  const onKeyDown = (event, index) => {
    if (event.key === 'ArrowDown' || (event.key === 'Enter' && index < variants.length - 1)) {
      event.preventDefault();
      focusRow(index + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRow(index - 1);
    } else if (event.key === 'Enter' && index === variants.length - 1) {
      event.preventDefault();
      commit();
    }
  };

  const commit = () => {
    const lines = variants
      .map((variant) => ({
        productId: product.id,
        colorCode: variant.colorCode,
        qty: Number(quantities[variant.colorCode]) || 0,
      }))
      .filter((line) => line.qty > 0);
    if (!lines.length) return;
    onAdd(lines);
    setQuantities({});
    focusRow(0);
  };

  if (!product) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
        <Package size={20} className="text-ink-muted" aria-hidden="true" />
        <p className="text-sm text-ink">{t('vouchers.pickModel')}</p>
        <p className="text-xs text-ink-secondary">{t('vouchers.pickModelHint')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-hair px-4 py-2.5">
        <div>
          <h3 className="text-sm font-semibold tabular-nums text-ink">{product.modelNo}</h3>
          <p className="text-2xs text-ink-secondary">{productAttributes(product, t, { brand: true })}</p>
        </div>
        {isTransfer ? (
          <p className="text-2xs text-ink-secondary">
            {t('vouchers.inStockAll', { count: product.totalStock })}
          </p>
        ) : (
          <div className="text-right">
            <p className="text-sm font-medium tabular-nums text-ink">
              K {fmtMMK(pricing.unitPrice)}
            </p>
            <p className="text-2xs text-ink-secondary">
              {t(`labels.priceTier.${pricing.tier}`)}
              {pricing.discountPct > 0 ? ` · −${pricing.discountPct}%` : ''}
            </p>
          </div>
        )}
      </div>

      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-left text-2xs text-ink-secondary">
            <th className="px-2 py-2 font-medium sm:px-4">{t('vouchers.colColour')}</th>
            <th className="w-14 px-1 py-2 text-right font-medium sm:w-20 sm:px-3">{t('vouchers.colStock')}</th>
            <th className="w-[7.5rem] px-1 py-2 text-center font-medium sm:w-36 sm:px-3">{t('vouchers.colQty')}</th>
            <th className="w-20 px-2 py-2 text-right font-medium sm:w-28 sm:px-4">
              {t(isTransfer ? 'vouchers.colLeft' : 'vouchers.colTotal')}
            </th>
          </tr>
        </thead>
        <tbody>
          {variants.map((variant, index) => {
            const qty = Number(quantities[variant.colorCode]) || 0;
            const available = Number(variant.stock?.[locationId]) || 0;
            const over = qty > available;

            return (
              <tr key={variant.colorCode} className="border-t border-line-hair">
                <td className="px-2 py-2 sm:px-4">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-line-hair"
                      style={{ background: variant.hex }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-ink">
                        <span className="font-medium tabular-nums">{variant.colorCode}</span>
                        <span className="ml-1 hidden text-ink-secondary sm:inline">
                          {variant.colorName}
                        </span>
                      </p>
                    </div>
                  </div>
                </td>

                <td className="px-1 py-2 text-right sm:px-3">
                  <span
                    className={`tabular-nums ${
                      available === 0
                        ? 'text-status-critical'
                        : available <= (variant.reorderPoint ?? 10)
                          ? 'text-ink'
                          : 'text-ink-secondary'
                    }`}
                  >
                    {available}
                  </span>
                  {available > 0 && available <= (variant.reorderPoint ?? 10) ? (
                    // The word does not fit a phone, but the warning must still
                    // be there — the icon carries it, with a name for screen
                    // readers so the state is never colour alone.
                    <span className="ml-1 inline-flex items-center gap-0.5 align-middle">
                      <AlertTriangle
                        size={10}
                        className="text-status-warning"
                        aria-hidden="true"
                      />
                      <span className="sr-only">{t('vouchers.lowStock')}</span>
                      <span className="hidden text-2xs text-ink sm:inline">{t('vouchers.low')}</span>
                    </span>
                  ) : null}
                </td>

                <td className="px-1 py-2 sm:px-3">
                  <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                    <button
                      type="button"
                      onClick={() => bump(variant.colorCode, -1)}
                      disabled={qty === 0}
                      aria-label={t('vouchers.decrease', { code: variant.colorCode })}
                      className="h-7 w-6 shrink-0 rounded border border-line-hair text-ink-secondary
                        hover:bg-raised hover:text-ink disabled:opacity-40 sm:w-7"
                    >
                      <Minus size={12} className="mx-auto" aria-hidden="true" />
                    </button>
                    <input
                      ref={(el) => {
                        inputRefs.current[index] = el;
                      }}
                      inputMode="numeric"
                      value={quantities[variant.colorCode] ?? ''}
                      onChange={(e) => setQty(variant.colorCode, e.target.value)}
                      onKeyDown={(e) => onKeyDown(e, index)}
                      onFocus={(e) => e.target.select()}
                      placeholder="0"
                      aria-label={t('vouchers.qtyFor', { item: `${product.modelNo} ${variant.colorCode} ${variant.colorName}` })}
                      aria-invalid={over}
                      className={`h-8 w-11 min-w-0 rounded border bg-surface text-center text-sm
                        font-medium tabular-nums outline-none sm:w-14 ${
                          over
                            ? 'border-status-critical text-status-critical'
                            : 'border-line-hair text-ink'
                        }`}
                    />
                    <button
                      type="button"
                      onClick={() => bump(variant.colorCode, 1)}
                      aria-label={t('vouchers.increase', { code: variant.colorCode })}
                      className="h-7 w-6 shrink-0 rounded border border-line-hair text-ink-secondary hover:bg-raised hover:text-ink sm:w-7"
                    >
                      <Plus size={12} className="mx-auto" aria-hidden="true" />
                    </button>
                  </div>
                </td>

                <td className="px-2 py-2 text-right sm:px-4">
                  {qty > 0 ? (
                    <span className="font-medium tabular-nums text-ink">
                      {isTransfer ? available - qty : fmtMMK(qty * pricing.unitPrice)}
                    </span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                  {over ? (
                    <p className="flex items-center justify-end gap-1 whitespace-nowrap text-2xs text-status-critical">
                      <AlertTriangle size={10} aria-hidden="true" />
                      {t('vouchers.overBy', { n: qty - available })}
                    </p>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-hair px-4 py-3">
        <div className="text-xs text-ink-secondary">
          <p className="text-sm font-medium text-ink">
            {t('common.pcs', { n: totalQty })}
            {isTransfer ? '' : ` · K ${fmtMMK(lineTotal)}`}
          </p>
          {isTransfer ? (
            <p className="flex items-center gap-1">
              <CornerDownLeft size={11} aria-hidden="true" />
              {t('vouchers.enterHintLoad')}
            </p>
          ) : nextTier && totalQty > 0 ? (
            <p>
              {t('vouchers.nextTier', {
                more: nextTier.minQty - effectiveQty,
                tier: t(`labels.priceTier.${nextTier.key}`),
                price: fmtMMK(product.pricing?.[nextTier.key] ?? pricing.unitPrice),
              })}
            </p>
          ) : (
            <p className="flex items-center gap-1">
              <CornerDownLeft size={11} aria-hidden="true" />
              {t('vouchers.enterHintAdd')}
            </p>
          )}
        </div>

        <Button variant="primary" icon={Plus} onClick={commit} disabled={totalQty === 0}>
          {totalQty > 0
            ? t('vouchers.addPieces', { label: addLabel ?? t('vouchers.add'), pieces: totalQty })
            : isTransfer
              ? (addLabel ?? t('vouchers.add'))
              : t('vouchers.addToVoucher')}
        </Button>
      </div>
    </div>
  );
}

export { qtyTierFor };
