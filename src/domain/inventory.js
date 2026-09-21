import { daysBetween } from '../lib/dates';

/**
 * ---------------------------------------------------------------------------
 * INVENTORY HEALTH — dead stock, low stock, and what it is all worth.
 * ---------------------------------------------------------------------------
 * Dead stock is the quiet killer in wholesale eyewear: a model that stopped
 * selling does not announce itself, it just sits in the warehouse holding cash
 * that could be buying what does sell. So "days since last sale" is a
 * first-class figure here, derived from `products.lastSoldAt` the same way
 * credit status is derived from `vouchers.dueDate` — from the calendar, not
 * from a flag someone has to remember to set.
 */

export const DEAD_STOCK_DAYS = 90; // the brief's "not sold in > 3 months"
export const MAIN_LOCATION = 'LOC-MAIN';

export const STOCK_BANDS = [
  { key: 'MOVING', label: 'Moving', range: 'sold < 60 days', tone: 'good', minDays: 0 },
  { key: 'SLOWING', label: 'Slowing', range: '60–89 days', tone: 'warning', minDays: 60 },
  { key: 'DEAD', label: 'Dead', range: '90–179 days', tone: 'serious', minDays: DEAD_STOCK_DAYS },
  { key: 'STRANDED', label: 'Stranded', range: '180+ days', tone: 'critical', minDays: 180 },
];

export function bandForDays(days) {
  if (days == null) return 'MOVING'; // never sold and never counted — treat as new
  return (
    [...STOCK_BANDS].reverse().find((band) => days >= band.minDays)?.key ?? 'MOVING'
  );
}

export function bandMeta(key) {
  return STOCK_BANDS.find((band) => band.key === key) ?? STOCK_BANDS[0];
}

/** Units of one variant at one location. Other locations are not netted in. */
export function variantUnits(variant, locationId = MAIN_LOCATION) {
  return Number(variant?.stock?.[locationId]) || 0;
}

/**
 * One product's position: what is on the shelf, what it cost, and how long it
 * has been since anyone bought it.
 */
export function assessProduct(product, { locationId = MAIN_LOCATION, today = new Date() } = {}) {
  const variants = product?.variants ?? [];
  const unitCost = Number(product?.costing?.actualCost) || 0;
  const unitPrice = Number(product?.pricing?.STANDARD) || 0;

  let units = 0;
  const low = [];
  const out = [];

  for (const variant of variants) {
    const onHand = variantUnits(variant, locationId);
    units += onHand;
    const reorderPoint = Number(variant.reorderPoint) || 0;
    if (onHand === 0) out.push(variant);
    else if (reorderPoint > 0 && onHand <= reorderPoint) low.push(variant);
  }

  // `lastSoldAt` can be missing on a product that has never sold; that reads as
  // "unknown", not "sold today", so the age is null and the caller decides.
  const daysSinceSale = product?.lastSoldAt ? daysBetween(product.lastSoldAt, today) : null;
  const band = bandForDays(daysSinceSale);

  return {
    product,
    variants,
    units,
    variantCount: variants.length,
    lowVariants: low,
    outVariants: out,
    daysSinceSale,
    band,
    costValue: units * unitCost,
    retailValue: units * unitPrice,
    unitCost,
    unitPrice,
    // Cash locked in something that is not selling.
    isDead: band === 'DEAD' || band === 'STRANDED',
  };
}

/**
 * Portfolio view. One pass, same shape as the credit portfolio so the pages
 * read alike.
 */
export function assessInventory(products = [], options = {}) {
  const rows = products
    .filter((product) => product.category === 'FRAME' || options.includeAccessories)
    .map((product) => assessProduct(product, options));

  const totals = {
    units: 0,
    costValue: 0,
    retailValue: 0,
    deadUnits: 0,
    deadValue: 0,
    lowVariantCount: 0,
    outVariantCount: 0,
    modelCount: rows.length,
    bands: { MOVING: 0, SLOWING: 0, DEAD: 0, STRANDED: 0 },
  };

  for (const row of rows) {
    totals.units += row.units;
    totals.costValue += row.costValue;
    totals.retailValue += row.retailValue;
    totals.lowVariantCount += row.lowVariants.length;
    totals.outVariantCount += row.outVariants.length;
    totals.bands[row.band] += row.costValue;
    if (row.isDead) {
      totals.deadUnits += row.units;
      totals.deadValue += row.costValue;
    }
  }

  // Worst first: longest unsold, then most cash tied up.
  const bandRank = { STRANDED: 3, DEAD: 2, SLOWING: 1, MOVING: 0 };
  const deadStock = rows
    .filter((row) => row.isDead && row.units > 0)
    .sort((a, b) => bandRank[b.band] - bandRank[a.band] || b.costValue - a.costValue);

  const lowStock = rows
    .filter((row) => row.lowVariants.length || row.outVariants.length)
    .sort(
      (a, b) =>
        b.outVariants.length - a.outVariants.length || b.lowVariants.length - a.lowVariants.length,
    );

  return { rows, totals, deadStock, lowStock };
}

/**
 * Label print run: one entry per variant, with how many copies to print.
 * Defaults to one label per unit on the shelf, which is what a stock-take or a
 * new delivery actually needs.
 */
export function buildLabelRun(selection = [], { locationId = MAIN_LOCATION, copies } = {}) {
  return selection
    .map(({ product, variant }) => ({
      product,
      variant,
      onHand: variantUnits(variant, locationId),
      copies: copies ?? variantUnits(variant, locationId),
    }))
    // A colour with nothing on the shelf prints nothing, unless copies was set
    // explicitly — labelling stock you do not have just wastes label roll.
    .filter((entry) => entry.copies > 0);
}

export function expandLabels(run = []) {
  return run.flatMap((entry) =>
    Array.from({ length: entry.copies }, (_, index) => ({
      key: `${entry.product.id}-${entry.variant.colorCode}-${index}`,
      product: entry.product,
      variant: entry.variant,
    })),
  );
}
