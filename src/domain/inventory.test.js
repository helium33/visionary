import { describe, expect, it } from 'vitest';
import { subDays } from 'date-fns';
import {
  assessInventory,
  assessProduct,
  bandForDays,
  buildLabelRun,
  expandLabels,
  variantUnits,
} from './inventory';

const TODAY = new Date('2026-09-21T10:00:00+06:30');

function product(id, { lastSoldDaysAgo, stock = [10, 10], cost = 10_000, price = 18_000, reorder = 10 } = {}) {
  return {
    id,
    modelNo: id,
    category: 'FRAME',
    costing: { actualCost: cost },
    pricing: { STANDARD: price },
    lastSoldAt: lastSoldDaysAgo == null ? null : subDays(TODAY, lastSoldDaysAgo).toISOString(),
    variants: stock.map((qty, i) => ({
      colorCode: `C${i + 1}`,
      colorName: `Colour ${i + 1}`,
      reorderPoint: reorder,
      stock: { 'LOC-MAIN': qty, 'LOC-CAR-ZM': 0 },
    })),
  };
}

describe('bandForDays — the 3-month dead-stock line', () => {
  it.each([
    [0, 'MOVING'],
    [59, 'MOVING'],
    [60, 'SLOWING'],
    [89, 'SLOWING'],
    [90, 'DEAD'],
    [179, 'DEAD'],
    [180, 'STRANDED'],
  ])('%i days since last sale → %s', (days, band) => {
    expect(bandForDays(days)).toBe(band);
  });

  it('treats an unknown last-sale date as moving, not dead', () => {
    // A newly received model has never sold; calling it dead would send the
    // warehouse chasing stock that only arrived yesterday.
    expect(bandForDays(null)).toBe('MOVING');
  });
});

describe('assessProduct', () => {
  it('values stock at landed cost and at list price', () => {
    const result = assessProduct(product('PB-2026', { lastSoldDaysAgo: 3, stock: [12, 8] }), {
      today: TODAY,
    });
    expect(result.units).toBe(20);
    expect(result.costValue).toBe(200_000);
    expect(result.retailValue).toBe(360_000);
    expect(result.isDead).toBe(false);
  });

  it('separates colours that are low from colours that are out', () => {
    const result = assessProduct(product('VS-118', { lastSoldDaysAgo: 5, stock: [0, 9, 40] }), {
      today: TODAY,
    });
    expect(result.outVariants.map((v) => v.colorCode)).toEqual(['C1']);
    expect(result.lowVariants.map((v) => v.colorCode)).toEqual(['C2']);
  });

  it('counts only the chosen location', () => {
    const result = assessProduct(product('TR-9045', { lastSoldDaysAgo: 1, stock: [30] }), {
      locationId: 'LOC-CAR-ZM',
      today: TODAY,
    });
    expect(result.units).toBe(0);
  });

  it('flags a model unsold for more than three months', () => {
    const result = assessProduct(product('AC-2210', { lastSoldDaysAgo: 118, stock: [5] }), {
      today: TODAY,
    });
    expect(result.band).toBe('DEAD');
    expect(result.isDead).toBe(true);
    expect(result.daysSinceSale).toBe(118);
  });

  it('derives the age from the calendar, so it ages without a write', () => {
    const model = product('TI-880', { lastSoldDaysAgo: 80, stock: [4] });
    expect(assessProduct(model, { today: TODAY }).band).toBe('SLOWING');
    // Same document, eleven days later — nothing was written, it is now dead.
    const later = subDays(TODAY, -11);
    expect(assessProduct(model, { today: later }).band).toBe('DEAD');
  });
});

describe('assessInventory', () => {
  const products = [
    product('A', { lastSoldDaysAgo: 2, stock: [20, 20], cost: 10_000 }),
    product('B', { lastSoldDaysAgo: 95, stock: [5, 5], cost: 20_000 }),
    product('C', { lastSoldDaysAgo: 200, stock: [3], cost: 30_000 }),
    product('D', { lastSoldDaysAgo: 70, stock: [0, 2], cost: 5_000 }),
  ];
  const result = assessInventory(products, { today: TODAY });

  it('totals units and capital at cost', () => {
    expect(result.totals.units).toBe(40 + 10 + 3 + 2);
    expect(result.totals.costValue).toBe(400_000 + 200_000 + 90_000 + 10_000);
  });

  it('isolates the cash sitting in dead stock', () => {
    expect(result.totals.deadUnits).toBe(13);
    expect(result.totals.deadValue).toBe(290_000);
  });

  it('ranks dead stock by how long it has sat, then by value', () => {
    expect(result.deadStock.map((r) => r.product.id)).toEqual(['C', 'B']);
  });

  it('counts low and out-of-stock colours separately', () => {
    expect(result.totals.outVariantCount).toBe(1); // D C1
    expect(result.totals.lowVariantCount).toBe(4); // B C1, B C2, C C1, D C2
  });

  it('buckets capital by ageing band', () => {
    expect(result.totals.bands).toMatchObject({
      MOVING: 400_000,
      SLOWING: 10_000,
      DEAD: 200_000,
      STRANDED: 90_000,
    });
  });

  it('leaves accessories out unless asked for', () => {
    const withCase = [...products, { ...product('CASE'), category: 'CASE' }];
    expect(assessInventory(withCase, { today: TODAY }).rows).toHaveLength(4);
    expect(assessInventory(withCase, { today: TODAY, includeAccessories: true }).rows).toHaveLength(5);
  });
});

describe('label runs', () => {
  const model = product('PB-2026', { lastSoldDaysAgo: 1, stock: [3, 0] });
  const selection = model.variants.map((variant) => ({ product: model, variant }));

  it('defaults to one label per unit on the shelf', () => {
    const run = buildLabelRun(selection);
    expect(run).toHaveLength(1); // the empty colour drops out
    expect(run[0].copies).toBe(3);
  });

  it('accepts a fixed number of copies', () => {
    expect(buildLabelRun(selection, { copies: 2 }).map((r) => r.copies)).toEqual([2, 2]);
  });

  it('expands a run into individual labels with stable keys', () => {
    const labels = expandLabels(buildLabelRun(selection, { copies: 2 }));
    expect(labels).toHaveLength(4);
    expect(new Set(labels.map((l) => l.key)).size).toBe(4);
  });

  it('variantUnits reads one location only', () => {
    expect(variantUnits(model.variants[0], 'LOC-MAIN')).toBe(3);
    expect(variantUnits(model.variants[0], 'LOC-CAR-ZM')).toBe(0);
  });
});
