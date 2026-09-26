/**
 * ---------------------------------------------------------------------------
 * LANDED COST — factory price + cargo + transport + labeling = actual cost.
 * ---------------------------------------------------------------------------
 * This is the number every profit figure in the system rests on, so two things
 * matter more than elegance:
 *
 *  1. THE CHARGES MUST BALANCE EXACTLY. Apportioning K 420,000 of cargo across
 *     eleven lines by naive rounding loses or invents a few kyat every time,
 *     and those few kyat compound into a cost base nobody can reconcile with
 *     the shipping invoice. The largest-remainder method below distributes the
 *     rounding difference so the apportioned charges sum to the charge total
 *     to the kyat, always.
 *
 *  2. THE BASIS IS RECORDED, NOT ASSUMED. Spreading cargo by value and by
 *     quantity give materially different unit costs — a titanium frame and a
 *     kids' frame occupy the same carton space but not the same invoice line.
 *     Neither is "correct"; the business has to be able to say which it used,
 *     so `allocationBasis` is stored on the purchase order.
 */

export const ALLOCATION_BASIS = {
  BY_VALUE: 'BY_VALUE', // freight follows what the goods are worth
  BY_QTY: 'BY_QTY', // freight follows how many pieces shipped
};

export const CHARGE_KEYS = ['cargo', 'transport', 'labeling', 'customs'];

/**
 * Which quantity the charges are spread over.
 *
 * ORDERED is right while an order is still on the water — nothing has arrived,
 * so the order is all there is. RECEIVED is right at the moment of receipt:
 * the freight invoice the accountant is typing in covers what actually
 * shipped, so apportioning it over quantities that never turned up would
 * spread real money across phantom pieces and undervalue the stock on the
 * shelf. A short delivery makes each surviving piece MORE expensive, not less.
 */
export const QTY_BASIS = {
  ORDERED: 'ORDERED',
  RECEIVED: 'RECEIVED',
};

// Display names for CHARGE_KEYS live in the dictionary (purchasing.charge.<key>).

/**
 * @param {object}   po
 * @param {object[]} po.lines            [{ productId, modelNo, colorCode, qty, factoryUnitPrice }]
 * @param {object}   po.charges          in MMK
 * @param {number}   po.fxRate           MMK per unit of supplier currency
 * @param {string}   po.allocationBasis
 * @param {object}   [options]
 * @param {string}   [options.qtyBasis]  ORDERED (default) or RECEIVED
 */
export function computeLandedCost(po = {}, { qtyBasis = QTY_BASIS.ORDERED } = {}) {
  const {
    lines = [],
    charges = {},
    fxRate = 1,
    allocationBasis = ALLOCATION_BASIS.BY_VALUE,
  } = po;

  const rate = Number(fxRate) || 1;
  const totalCharges = round0(
    CHARGE_KEYS.reduce((sum, key) => sum + (Number(charges[key]) || 0), 0),
  );

  const priced = lines.map((line) => {
    const orderedQty = Math.max(0, Math.floor(Number(line.qty) || 0));
    const effective =
      qtyBasis === QTY_BASIS.RECEIVED && line.receivedQty != null
        ? Math.max(0, Math.floor(Number(line.receivedQty)))
        : orderedQty;
    const qty = effective;
    const factoryUnitPrice = Number(line.factoryUnitPrice) || 0;
    return {
      ...line,
      orderedQty,
      qty,
      factoryUnitPrice,
      factoryValue: round2(qty * factoryUnitPrice), // supplier currency
      factoryMMK: round0(qty * factoryUnitPrice * rate),
    };
  });

  const totalFactoryMMK = priced.reduce((sum, line) => sum + line.factoryMMK, 0);
  const totalQty = priced.reduce((sum, line) => sum + line.qty, 0);

  // Everything free of charge cannot be weighted by value — fall back to
  // quantity rather than dividing by zero or silently giving one line the lot.
  const basis =
    allocationBasis === ALLOCATION_BASIS.BY_VALUE && totalFactoryMMK === 0
      ? ALLOCATION_BASIS.BY_QTY
      : allocationBasis;

  const weights = priced.map((line) => {
    if (basis === ALLOCATION_BASIS.BY_QTY) return totalQty ? line.qty / totalQty : 0;
    return totalFactoryMMK ? line.factoryMMK / totalFactoryMMK : 0;
  });

  const apportioned = apportion(totalCharges, weights);

  const costed = priced.map((line, index) => {
    const chargeShare = apportioned[index];
    const landedTotal = line.factoryMMK + chargeShare;
    const landedUnitCost = line.qty ? Math.round(landedTotal / line.qty) : 0;
    return {
      ...line,
      chargeShare,
      chargePerUnit: line.qty ? Math.round(chargeShare / line.qty) : 0,
      landedTotal,
      // What gets written to products.costing.actualCost — the per-piece figure
      // every margin and stock valuation in the system uses.
      landedUnitCost,
      // How much of the unit cost is freight rather than goods; the number that
      // tells you whether a cheap frame is actually cheap.
      chargeSharePct: landedTotal ? round1((chargeShare / landedTotal) * 100) : 0,
    };
  });

  return {
    lines: costed,
    basis,
    qtyBasis,
    fxRate: rate,
    totalQty,
    totalFactoryMMK,
    totalCharges,
    totalLanded: totalFactoryMMK + totalCharges,
    averageUnitCost: totalQty ? Math.round((totalFactoryMMK + totalCharges) / totalQty) : 0,
    chargeUpliftPct: totalFactoryMMK ? round1((totalCharges / totalFactoryMMK) * 100) : 0,
  };
}

/**
 * Largest-remainder apportionment: every share is a whole number of kyat and
 * they sum to exactly `total`.
 */
export function apportion(total, weights) {
  const amount = round0(total);
  if (!weights.length || amount === 0) return weights.map(() => 0);

  const exact = weights.map((weight) => amount * weight);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = amount - floors.reduce((sum, value) => sum + value, 0);

  // Hand the leftover kyat to the largest fractional parts, biggest first.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const result = [...floors];
  for (const { index } of order) {
    if (remainder <= 0) break;
    result[index] += 1;
    remainder -= 1;
  }
  return result;
}

/**
 * Gross margin against the current selling price. Answers the only question
 * that matters after a shipment lands: is this model still worth stocking?
 */
export function lineMargin(costedLine, product, tier = 'STANDARD') {
  const price = Number(product?.pricing?.[tier] ?? product?.pricing?.STANDARD) || 0;
  const cost = costedLine.landedUnitCost;
  const margin = price - cost;
  return {
    price,
    cost,
    margin,
    marginPct: price ? round1((margin / price) * 100) : 0,
    markupPct: cost ? round1((margin / cost) * 100) : 0,
  };
}

/**
 * What receiving a purchase order does to the rest of the system: stock goes
 * up at one location, and each product's actual cost is restated.
 *
 * Receiving is by line, because a shipment routinely arrives short and the
 * cost of what actually turned up is what the books need.
 */
export function receiptPlan(po, { locationId = 'LOC-MAIN' } = {}) {
  // Costed on what arrived: the freight bill covers the shipment that actually
  // came, so it belongs to those pieces (see QTY_BASIS).
  const costed = computeLandedCost(po, { qtyBasis: QTY_BASIS.RECEIVED });

  const movements = costed.lines
    .map((line) => ({
      productId: line.productId,
      modelNo: line.modelNo,
      colorCode: line.colorCode,
      // `qty` is already the received figure; a line with no receivedQty
      // recorded is assumed to have arrived in full.
      qty: line.qty,
      landedUnitCost: line.landedUnitCost,
      locationId,
    }))
    .filter((move) => move.qty > 0);

  // One cost per product, not per colour: `products.costing` is a product-level
  // field, and colours of the same model share a factory price.
  const costing = new Map();
  for (const line of costed.lines) {
    const current = costing.get(line.productId) ?? { qty: 0, landed: 0 };
    current.qty += line.qty;
    current.landed += line.landedTotal;
    costing.set(line.productId, current);
  }

  return {
    costed,
    movements,
    costUpdates: [...costing.entries()]
      .filter(([, value]) => value.qty > 0)
      .map(([productId, value]) => ({
        productId,
        actualCost: Math.round(value.landed / value.qty),
      })),
    shortfalls: costed.lines
      .filter((line) => line.qty < line.orderedQty)
      .map((line) => ({
        modelNo: line.modelNo,
        colorCode: line.colorCode,
        ordered: line.orderedQty,
        received: line.qty,
        short: line.orderedQty - line.qty,
      })),
  };
}

function round0(n) {
  return Math.round(Number(n) || 0);
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
