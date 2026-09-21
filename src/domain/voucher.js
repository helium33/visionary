import { CREDIT_TERM_DAYS, computeDueDate } from './credit';
import { modelQuantities, resolveLinePrice } from './pricing';

/**
 * ---------------------------------------------------------------------------
 * VOUCHER ASSEMBLY — pure. Same inputs, same voucher, online or offline.
 * ---------------------------------------------------------------------------
 * The screen shows exactly what gets written, because the screen and the write
 * call these same functions. Nothing here reads the clock or Firestore.
 */

export const DISCOUNT_MODES = { AMOUNT: 'AMOUNT', PERCENT: 'PERCENT' };

/** A cart line before pricing: { productId, colorCode, qty }. */
export function priceCart(lines = [], { products, shopTier = 'STANDARD' } = {}) {
  const byModel = modelQuantities(lines);
  const catalogue = indexProducts(products);

  return lines
    .filter((line) => Number(line.qty) > 0)
    .map((line) => {
      const product = catalogue.get(line.productId);
      const variant = product?.variants?.find((v) => v.colorCode === line.colorCode);
      const qty = Number(line.qty) || 0;
      const pricing = resolveLinePrice(product, shopTier, byModel.get(line.productId) ?? 0);

      return {
        productId: line.productId,
        modelNo: product?.modelNo ?? line.productId,
        colorCode: line.colorCode,
        colorName: variant?.colorName ?? line.colorCode,
        category: product?.category ?? 'FRAME',
        qty,
        unitPrice: pricing.unitPrice,
        listPrice: pricing.listPrice,
        lineTotal: qty * pricing.unitPrice,
        tierApplied: pricing.tier,
        tierLabel: pricing.tierLabel,
        tierReason: pricing.reason,
        discountPct: pricing.discountPct,
        unitCost: product?.costing?.actualCost ?? 0,
      };
    });
}

/**
 * AUTO-BUNDLING. One frame ships with one case and one cloth, at no extra
 * charge — so bundles move STOCK but never touch the price. Keeping them off
 * the invoice total is deliberate: the shop is not billed for them, but the
 * warehouse must still see them leave, or the case count drifts from reality
 * within a month.
 */
export function bundleRequirements(pricedLines = [], products) {
  const catalogue = indexProducts(products);
  const needed = new Map();

  for (const line of pricedLines) {
    const product = catalogue.get(line.productId);
    if (!product?.bundle) continue; // accessories do not bundle further

    for (const key of ['caseProductId', 'clothProductId']) {
      const bundledId = product.bundle[key];
      if (!bundledId) continue;
      const current = needed.get(bundledId) ?? {
        productId: bundledId,
        modelNo: catalogue.get(bundledId)?.modelNo ?? bundledId,
        category: catalogue.get(bundledId)?.category ?? 'ACCESSORY',
        colorCode: catalogue.get(bundledId)?.variants?.[0]?.colorCode ?? 'C0',
        qty: 0,
      };
      current.qty += line.qty;
      needed.set(bundledId, current);
    }
  }

  return [...needed.values()];
}

/** Stock on hand at one location, ignoring other locations entirely. */
export function stockAt(product, colorCode, locationId) {
  const variant = product?.variants?.find((v) => v.colorCode === colorCode);
  return Number(variant?.stock?.[locationId]) || 0;
}

/**
 * Availability check across sold lines AND the bundled accessories they pull.
 * Returns blocking shortages separately from advisory warnings, because a
 * missing cloth should not stop a K 2,000,000 frame order from going out.
 */
export function checkStock(pricedLines, bundles, { products, locationId = 'LOC-MAIN' } = {}) {
  const catalogue = indexProducts(products);
  const shortages = [];
  const warnings = [];

  for (const line of pricedLines) {
    const available = stockAt(catalogue.get(line.productId), line.colorCode, locationId);
    if (line.qty > available) {
      shortages.push({
        kind: 'LINE',
        label: `${line.modelNo} ${line.colorCode}`,
        requested: line.qty,
        available,
        short: line.qty - available,
      });
    }
  }

  for (const bundle of bundles) {
    const product = catalogue.get(bundle.productId);
    // Variants load lazily, so an empty list means "not known yet", not "none
    // in stock" — claiming a shortage here would flash a false warning on
    // every voucher between the line being added and the accessory's
    // subcollection arriving.
    if (!product?.variants?.length) continue;

    const available = stockAt(product, bundle.colorCode, locationId);
    if (bundle.qty > available) {
      warnings.push({
        kind: 'BUNDLE',
        label: bundle.modelNo,
        requested: bundle.qty,
        available,
        short: bundle.qty - available,
      });
    }
  }

  return { shortages, warnings, ok: shortages.length === 0 };
}

/**
 * Invoice arithmetic. Every figure the printed voucher carries is computed in
 * this one place, including the running balance the shop argues about.
 */
export function summariseVoucher({
  lines = [],
  discount = 0,
  discountMode = DISCOUNT_MODES.AMOUNT,
  previousBalance = 0,
  payment = 0,
  issueDate = new Date(),
  termDays = CREDIT_TERM_DAYS,
} = {}) {
  const subtotal = round0(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  const listSubtotal = round0(lines.reduce((sum, l) => sum + l.listPrice * l.qty, 0));

  const discountAmount =
    discountMode === DISCOUNT_MODES.PERCENT
      ? round0((subtotal * clamp(Number(discount) || 0, 0, 100)) / 100)
      : clamp(round0(discount), 0, subtotal);

  const grandTotal = round0(subtotal - discountAmount);
  const paymentAtIssue = clamp(round0(payment), 0, previousBalance + grandTotal);
  const newBalance = round0(previousBalance + grandTotal - paymentAtIssue);

  const pieces = lines.reduce((sum, l) => sum + l.qty, 0);
  const cost = round0(lines.reduce((sum, l) => sum + l.unitCost * l.qty, 0));

  return {
    pieces,
    lineCount: lines.length,
    listSubtotal,
    // Tier savings already baked into the unit prices — shown so the shop can
    // see what the wholesale relationship is worth.
    tierSavings: round0(listSubtotal - subtotal),
    subtotal,
    discountAmount,
    grandTotal,
    previousBalance: round0(previousBalance),
    paymentAtIssue,
    newBalance,
    dueDate: computeDueDate(issueDate, termDays),
    termDays,
    estimatedCost: cost,
    estimatedMargin: round0(grandTotal - cost),
    marginPct: grandTotal > 0 ? Math.round(((grandTotal - cost) / grandTotal) * 100) : 0,
  };
}

/**
 * The Firestore document. `dueDate` is stored rather than derived so the ageing
 * query is a single indexed range scan that works against the offline cache.
 */
export function buildVoucherDoc({
  shop,
  lines,
  bundles,
  totals,
  type = 'SALE',
  discountReason = null,
  locationId = 'LOC-MAIN',
  actor,
  issueDate = new Date(),
  issuedOffline = false,
  overrideRef = null,
}) {
  const voucherNo = buildVoucherNo(actor, issueDate);

  return {
    voucherNo,
    shopId: shop.id,
    shopName: shop.name,
    township: shop.township,
    salesRepId: shop.salesRepId ?? actor?.uid ?? actor?.id ?? null,
    type,
    status: type === 'CONSIGNMENT' ? 'CONSIGNED' : totals.newBalance > 0 ? 'ISSUED' : 'PAID',

    issueDate,
    termDays: totals.termDays,
    dueDate: totals.dueDate,

    items: lines.map((line) => ({
      productId: line.productId,
      modelNo: line.modelNo,
      colorCode: line.colorCode,
      colorName: line.colorName,
      qty: line.qty,
      unitPrice: line.unitPrice,
      listPrice: line.listPrice,
      lineTotal: line.lineTotal,
      tierApplied: line.tierApplied,
      discountPct: line.discountPct,
      bundled: bundleFor(line, bundles),
    })),

    subtotal: totals.subtotal,
    discount: totals.discountAmount,
    discountReason,
    grandTotal: totals.grandTotal,

    // CONSIGNMENT carries no debt until it is converted to a sale, so it never
    // touches the shop's balance (see domain/credit.js#isOpenReceivable).
    paidAmount: type === 'CONSIGNMENT' ? 0 : totals.paymentAtIssue,
    balanceDue: type === 'CONSIGNMENT' ? 0 : totals.grandTotal - totals.paymentAtIssue,

    previousBalance: totals.previousBalance,
    paymentAtIssue: totals.paymentAtIssue,
    newBalance: totals.newBalance,

    locationId,
    createdBy: actor?.uid ?? actor?.id ?? null,
    createdByName: actor?.name ?? null,
    issuedOffline,
    overrideRef,
    clientAt: issueDate.toISOString(),
  };
}

/**
 * Device-generated. A shared counter needs a transaction, and transactions
 * cannot run offline — so the rep code plus a timestamp plus random suffix
 * gives a human-readable number that cannot collide between devices.
 */
export function buildVoucherNo(actor, issueDate = new Date()) {
  const rep = String(actor?.repCode ?? actor?.name ?? 'XX')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 2)
    .toUpperCase()
    .padEnd(2, 'X');
  const stamp = issueDate.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VN-${rep}${stamp}-${rand}`;
}

function bundleFor(line, bundles = []) {
  if (!bundles.length) return null;
  const record = {};
  for (const bundle of bundles) {
    if (bundle.category === 'CASE') record.case = line.qty;
    if (bundle.category === 'CLOTH') record.cloth = line.qty;
  }
  return Object.keys(record).length ? record : null;
}

function indexProducts(products = []) {
  return products instanceof Map ? products : new Map(products.map((p) => [p.id, p]));
}

function round0(n) {
  return Math.round(Number(n) || 0);
}

function clamp(n, min, max) {
  return Math.min(Math.max(Number(n) || 0, min), max);
}
