import { PRICE_TIERS } from '../lib/constants';

/**
 * ---------------------------------------------------------------------------
 * TIERED WHOLESALE PRICING
 * ---------------------------------------------------------------------------
 * Two independent discount sources exist in this business:
 *
 *   1. QUANTITY on the line   — >10 pcs, >50 pcs
 *   2. The SHOP's standing tier — a negotiated "VIP shop" rate
 *
 * They are not additive. A VIP shop buying 60 pieces does not get 12% + 8%;
 * it gets whichever single tier is cheaper for them. Stacking them is the
 * classic way a wholesale system quietly sells below cost, so the rule here is
 * explicit: **take the best single tier, never the sum.**
 *
 * Quantity is counted per MODEL across the whole voucher, not per colour line.
 * A shop ordering 6× C1 and 6× C2 of PB-2026 has bought 12 pieces of PB-2026
 * and has earned the bulk rate — pricing each colour separately would deny a
 * discount the shop plainly qualifies for, and reps would work around it by
 * splitting vouchers.
 */

export const QTY_TIERS = [
  { key: 'BULK_PLUS', minQty: 50 },
  { key: 'BULK', minQty: 10 },
];

/** The quantity tier a given model-total qualifies for, or STANDARD. */
export function qtyTierFor(modelQty) {
  return QTY_TIERS.find((tier) => modelQty >= tier.minQty)?.key ?? 'STANDARD';
}

/**
 * Resolves the unit price for one line.
 *
 * @param {object} product   product document (its `pricing` map)
 * @param {string} shopTier  the shop's standing tier
 * @param {number} modelQty  total pieces of THIS model on the voucher
 */
export function resolveLinePrice(product, shopTier = 'STANDARD', modelQty = 0) {
  const pricing = product?.pricing ?? {};
  const standard = Number(pricing.STANDARD) || 0;

  const candidates = [
    { tier: 'STANDARD', price: standard },
    { tier: shopTier, price: Number(pricing[shopTier]) || standard },
    { tier: qtyTierFor(modelQty), price: Number(pricing[qtyTierFor(modelQty)]) || standard },
  ].filter((c) => c.price > 0);

  // Best single tier — the cheapest one the shop qualifies for. The fallback
  // keeps this function total: it is called during render before a product's
  // variants (or the product itself) have loaded, and must never throw.
  const best = candidates.length
    ? candidates.reduce((lowest, c) => (c.price < lowest.price ? c : lowest))
    : { tier: 'STANDARD', price: standard };

  // Why this tier won — shown in the UI so a rep can explain the price. The
  // two sources read differently on purpose: a standing rate is about the
  // shop, a quantity rate is about this order. The UI translates the code;
  // `reason` is the English form.
  const reasonCode =
    best.tier === 'STANDARD'
      ? 'LIST'
      : best.tier === shopTier && best.tier !== qtyTierFor(modelQty)
        ? 'STANDING'
        : 'QUANTITY';

  return {
    tier: best.tier,
    tierLabel: PRICE_TIERS[best.tier]?.label ?? best.tier,
    unitPrice: best.price,
    listPrice: standard,
    discountPct: standard > 0 ? round1(((standard - best.price) / standard) * 100) : 0,
    reasonCode,
    modelQty,
    reason:
      reasonCode === 'LIST'
        ? 'List price'
        : reasonCode === 'STANDING'
          ? "Shop's standing rate"
          : `${modelQty} pcs of this model`,
  };
}

/** Pieces of each model across the whole cart — the input to the qty tier. */
export function modelQuantities(lines = []) {
  const totals = new Map();
  for (const line of lines) {
    totals.set(line.productId, (totals.get(line.productId) ?? 0) + (Number(line.qty) || 0));
  }
  return totals;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
