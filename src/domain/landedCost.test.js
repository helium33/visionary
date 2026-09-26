import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_BASIS,
  QTY_BASIS,
  apportion,
  computeLandedCost,
  lineMargin,
  receiptPlan,
} from './landedCost';

const po = (overrides = {}) => ({
  lines: [
    { productId: 'P-A', modelNo: 'A', colorCode: 'C1', qty: 100, factoryUnitPrice: 100 },
    { productId: 'P-B', modelNo: 'B', colorCode: 'C1', qty: 100, factoryUnitPrice: 300 },
  ],
  charges: { cargo: 400_000, transport: 0, labeling: 0, customs: 0 },
  fxRate: 1,
  allocationBasis: ALLOCATION_BASIS.BY_VALUE,
  ...overrides,
});

describe('apportion — the charges must balance exactly', () => {
  it('splits evenly when it divides cleanly', () => {
    expect(apportion(300, [1 / 3, 1 / 3, 1 / 3])).toEqual([100, 100, 100]);
  });

  it('never loses or invents a kyat on an awkward split', () => {
    // 100 across three equal shares is 33.33… — naive rounding gives 99 or 102.
    const shares = apportion(100, [1 / 3, 1 / 3, 1 / 3]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(shares).toEqual([34, 33, 33]);
  });

  it('balances across many lines with messy weights', () => {
    const weights = [0.137, 0.291, 0.044, 0.318, 0.21];
    const shares = apportion(420_001, weights);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(420_001);
  });

  it('gives the leftover to the largest fractional parts first', () => {
    // 10 across weights 0.55 / 0.45 → 5.5 and 4.5; the extra kyat goes to 0.55.
    expect(apportion(10, [0.55, 0.45])).toEqual([6, 4]);
  });

  it('handles a zero charge and an empty order', () => {
    expect(apportion(0, [0.5, 0.5])).toEqual([0, 0]);
    expect(apportion(1000, [])).toEqual([]);
  });
});

describe('computeLandedCost — by value', () => {
  const result = computeLandedCost(po());

  it('weights freight by what the goods are worth', () => {
    // Factory value 10,000 vs 30,000 → cargo splits 25% / 75%.
    expect(result.lines[0].chargeShare).toBe(100_000);
    expect(result.lines[1].chargeShare).toBe(300_000);
  });

  it('produces a per-piece cost that is factory plus freight', () => {
    expect(result.lines[0].landedUnitCost).toBe(100 + 1000);
    expect(result.lines[1].landedUnitCost).toBe(300 + 3000);
  });

  it('reports how much of the cost is freight rather than goods', () => {
    expect(result.lines[0].chargeSharePct).toBe(90.9);
    expect(result.chargeUpliftPct).toBe(1000); // K 400k of freight on K 40k of goods
  });

  it('totals reconcile with the shipping invoice', () => {
    const shareSum = result.lines.reduce((sum, line) => sum + line.chargeShare, 0);
    expect(shareSum).toBe(result.totalCharges);
    expect(result.totalLanded).toBe(result.totalFactoryMMK + result.totalCharges);
  });
});

describe('computeLandedCost — by quantity', () => {
  it('splits freight per piece regardless of value', () => {
    const result = computeLandedCost(po({ allocationBasis: ALLOCATION_BASIS.BY_QTY }));
    expect(result.lines[0].chargeShare).toBe(200_000);
    expect(result.lines[1].chargeShare).toBe(200_000);
    // The cheap frame now carries the same freight as the expensive one — this
    // is the choice the business records on the PO.
    expect(result.lines[0].landedUnitCost).toBe(2100);
    expect(result.lines[1].landedUnitCost).toBe(2300);
  });

  it('falls back to quantity when nothing has a value', () => {
    const free = computeLandedCost(
      po({
        lines: [
          { productId: 'P-A', qty: 10, factoryUnitPrice: 0 },
          { productId: 'P-B', qty: 30, factoryUnitPrice: 0 },
        ],
        charges: { cargo: 40_000 },
      }),
    );
    expect(free.basis).toBe(ALLOCATION_BASIS.BY_QTY);
    expect(free.lines.map((l) => l.chargeShare)).toEqual([10_000, 30_000]);
  });
});

describe('computeLandedCost — foreign currency', () => {
  it('converts the factory price before apportioning', () => {
    const result = computeLandedCost(
      po({
        lines: [{ productId: 'P-A', qty: 100, factoryUnitPrice: 9.2 }],
        charges: { cargo: 80_000, transport: 30_000, labeling: 15_000 },
        fxRate: 62.5,
      }),
    );
    expect(result.totalFactoryMMK).toBe(57_500); // 100 × 9.2 CNY × 62.5
    expect(result.totalCharges).toBe(125_000);
    expect(result.lines[0].landedUnitCost).toBe(1825);
    expect(result.averageUnitCost).toBe(1825);
  });
});

describe('computeLandedCost — edges', () => {
  it('returns zeros for an empty order rather than NaN', () => {
    const empty = computeLandedCost({ lines: [], charges: {}, fxRate: 62.5 });
    expect(empty.totalQty).toBe(0);
    expect(empty.averageUnitCost).toBe(0);
    expect(empty.totalLanded).toBe(0);
  });

  it('gives a zero-quantity line no freight and no unit cost', () => {
    const result = computeLandedCost(
      po({
        lines: [
          { productId: 'P-A', qty: 0, factoryUnitPrice: 500 },
          { productId: 'P-B', qty: 10, factoryUnitPrice: 500 },
        ],
      }),
    );
    expect(result.lines[0].chargeShare).toBe(0);
    expect(result.lines[0].landedUnitCost).toBe(0);
    expect(result.lines[1].chargeShare).toBe(400_000);
  });
});

describe('lineMargin', () => {
  const product = { pricing: { STANDARD: 18_000, VIP: 15_800 } };

  it('measures margin against the selling price', () => {
    const result = lineMargin({ landedUnitCost: 10_450 }, product);
    expect(result).toMatchObject({ price: 18_000, cost: 10_450, margin: 7_550 });
    expect(result.marginPct).toBe(41.9);
    expect(result.markupPct).toBe(72.2);
  });

  it('measures against a tier when one is given', () => {
    expect(lineMargin({ landedUnitCost: 10_450 }, product, 'VIP').margin).toBe(5_350);
  });

  it('reports a loss rather than hiding it', () => {
    expect(lineMargin({ landedUnitCost: 20_000 }, product).margin).toBe(-2_000);
  });
});

describe('computeLandedCost — which quantity carries the freight', () => {
  const shortShipment = po({
    lines: [
      { productId: 'P-A', modelNo: 'A', colorCode: 'C1', qty: 100, factoryUnitPrice: 100, receivedQty: 50 },
      { productId: 'P-B', modelNo: 'B', colorCode: 'C1', qty: 100, factoryUnitPrice: 300, receivedQty: 100 },
    ],
  });

  it('spreads freight over the order while it is still on the water', () => {
    const onOrder = computeLandedCost(shortShipment);
    expect(onOrder.totalQty).toBe(200);
    expect(onOrder.lines[0].landedUnitCost).toBe(1100);
  });

  it('spreads it over what arrived once the goods are being received', () => {
    const arrived = computeLandedCost(shortShipment, { qtyBasis: QTY_BASIS.RECEIVED });
    expect(arrived.totalQty).toBe(150);
    // Half the line never shipped, so the freight that WAS paid now sits on 50
    // pieces instead of 100 — each surviving piece costs more, not less.
    expect(arrived.lines[0].qty).toBe(50);
    expect(arrived.lines[0].orderedQty).toBe(100);
    expect(arrived.lines[0].landedUnitCost).toBeGreaterThan(1100);
  });

  it('still balances the charges exactly on the received basis', () => {
    const arrived = computeLandedCost(shortShipment, { qtyBasis: QTY_BASIS.RECEIVED });
    const shareSum = arrived.lines.reduce((sum, line) => sum + line.chargeShare, 0);
    expect(shareSum).toBe(arrived.totalCharges);
  });
});

describe('receiptPlan', () => {
  it('moves stock and restates each product cost', () => {
    const plan = receiptPlan(po(), { locationId: 'LOC-MAIN' });
    expect(plan.movements).toHaveLength(2);
    expect(plan.movements[0]).toMatchObject({ productId: 'P-A', qty: 100, locationId: 'LOC-MAIN' });
    expect(plan.costUpdates).toEqual([
      { productId: 'P-A', actualCost: 1100 },
      { productId: 'P-B', actualCost: 3300 },
    ]);
  });

  it('averages colours of one model into a single product cost', () => {
    const plan = receiptPlan(
      po({
        lines: [
          { productId: 'P-A', modelNo: 'A', colorCode: 'C1', qty: 60, factoryUnitPrice: 100 },
          { productId: 'P-A', modelNo: 'A', colorCode: 'C2', qty: 40, factoryUnitPrice: 100 },
        ],
        charges: { cargo: 100_000 },
      }),
    );
    expect(plan.costUpdates).toEqual([{ productId: 'P-A', actualCost: 1100 }]);
  });

  it('receives what actually arrived, and names the shortfall', () => {
    const plan = receiptPlan(
      po({
        lines: [
          { productId: 'P-A', modelNo: 'A', colorCode: 'C1', qty: 100, factoryUnitPrice: 100, receivedQty: 80 },
          { productId: 'P-B', modelNo: 'B', colorCode: 'C1', qty: 100, factoryUnitPrice: 300, receivedQty: 100 },
        ],
      }),
    );
    expect(plan.movements[0].qty).toBe(80);
    expect(plan.shortfalls).toEqual([
      { modelNo: 'A', colorCode: 'C1', ordered: 100, received: 80, short: 20 },
    ]);
  });

  it('values the short line on what arrived, not on what was ordered', () => {
    const plan = receiptPlan(
      po({
        lines: [
          { productId: 'P-A', modelNo: 'A', colorCode: 'C1', qty: 100, factoryUnitPrice: 100, receivedQty: 80 },
          { productId: 'P-B', modelNo: 'B', colorCode: 'C1', qty: 100, factoryUnitPrice: 300, receivedQty: 100 },
        ],
      }),
    );
    // Freight paid is unchanged, so 80 pieces each carry more of it.
    const costA = plan.costUpdates.find((u) => u.productId === 'P-A');
    expect(costA.actualCost).toBeGreaterThan(1100);
  });

  it('leaves out a line that arrived not at all', () => {
    const plan = receiptPlan(
      po({
        lines: [
          { productId: 'P-A', modelNo: 'A', colorCode: 'C1', qty: 50, factoryUnitPrice: 100, receivedQty: 0 },
        ],
      }),
    );
    expect(plan.movements).toHaveLength(0);
  });
});
