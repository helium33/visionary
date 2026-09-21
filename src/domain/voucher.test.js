import { describe, expect, it } from 'vitest';
import { qtyTierFor, resolveLinePrice } from './pricing';
import {
  DISCOUNT_MODES,
  bundleRequirements,
  buildVoucherDoc,
  checkStock,
  priceCart,
  summariseVoucher,
} from './voucher';

const frame = {
  id: 'P-PB-2026',
  modelNo: 'PB-2026',
  category: 'FRAME',
  pricing: { STANDARD: 18000, BULK: 17100, BULK_PLUS: 16600, VIP: 15800 },
  costing: { actualCost: 10450 },
  bundle: { caseProductId: 'P-CASE', clothProductId: 'P-CLOTH' },
  variants: [
    { colorCode: 'C1', colorName: 'Black', stock: { 'LOC-MAIN': 42 } },
    { colorCode: 'C2', colorName: 'Tortoise', stock: { 'LOC-MAIN': 4 } },
  ],
};
const caseProduct = {
  id: 'P-CASE',
  modelNo: 'CASE-STD',
  category: 'CASE',
  pricing: { STANDARD: 1500 },
  costing: { actualCost: 670 },
  bundle: null,
  variants: [{ colorCode: 'C0', colorName: 'Standard', stock: { 'LOC-MAIN': 400 } }],
};
const clothProduct = {
  ...caseProduct,
  id: 'P-CLOTH',
  modelNo: 'CLOTH-STD',
  category: 'CLOTH',
  variants: [{ colorCode: 'C0', colorName: 'Standard', stock: { 'LOC-MAIN': 3 } }],
};
const products = [frame, caseProduct, clothProduct];

describe('quantity tiers', () => {
  it.each([
    [1, 'STANDARD'],
    [9, 'STANDARD'],
    [10, 'BULK'],
    [49, 'BULK'],
    [50, 'BULK_PLUS'],
  ])('%i pcs → %s', (qty, tier) => {
    expect(qtyTierFor(qty)).toBe(tier);
  });
});

describe('resolveLinePrice — best single tier, never stacked', () => {
  it('uses the list price below the bulk threshold', () => {
    expect(resolveLinePrice(frame, 'STANDARD', 5)).toMatchObject({ tier: 'STANDARD', unitPrice: 18000 });
  });

  it('applies the quantity tier at 10 pieces', () => {
    expect(resolveLinePrice(frame, 'STANDARD', 10)).toMatchObject({ tier: 'BULK', unitPrice: 17100 });
  });

  it('gives a VIP shop its rate even on a small order', () => {
    const result = resolveLinePrice(frame, 'VIP', 2);
    expect(result).toMatchObject({ tier: 'VIP', unitPrice: 15800, tierLabel: 'VIP shop' });
    // Attributed to the shop's standing, not to this order's quantity.
    expect(result.reason).toBe("Shop's standing rate");
  });

  it('never stacks VIP with a bulk discount — the cheaper tier alone wins', () => {
    const result = resolveLinePrice(frame, 'VIP', 60);
    expect(result.unitPrice).toBe(15800); // VIP, not 15800 * 0.92
    expect(result.unitPrice).toBeLessThan(16600);
  });

  it('is total — an unloaded or priceless product yields a zero-price standard line', () => {
    // The grid renders before a product's variants arrive, so this is called
    // with undefined on the first frame.
    expect(resolveLinePrice(undefined, 'VIP', 10)).toMatchObject({ tier: 'STANDARD', unitPrice: 0 });
    expect(resolveLinePrice({ pricing: {} }, 'VIP', 10)).toMatchObject({ unitPrice: 0 });
  });

  it('lets bulk beat a weaker shop tier', () => {
    const result = resolveLinePrice(frame, 'BULK', 60);
    expect(result).toMatchObject({ tier: 'BULK_PLUS', unitPrice: 16600 });
  });
});

describe('priceCart — quantity counts per model, not per colour', () => {
  it('combines colours of one model to reach the bulk threshold', () => {
    const lines = priceCart(
      [
        { productId: 'P-PB-2026', colorCode: 'C1', qty: 6 },
        { productId: 'P-PB-2026', colorCode: 'C2', qty: 6 },
      ],
      { products, shopTier: 'STANDARD' },
    );
    // 6 + 6 = 12 pieces of PB-2026 → both lines get the bulk rate.
    expect(lines.map((l) => l.tierApplied)).toEqual(['BULK', 'BULK']);
    expect(lines.every((l) => l.unitPrice === 17100)).toBe(true);
  });

  it('drops zero-quantity rows from the grid', () => {
    const lines = priceCart(
      [
        { productId: 'P-PB-2026', colorCode: 'C1', qty: 3 },
        { productId: 'P-PB-2026', colorCode: 'C2', qty: 0 },
      ],
      { products },
    );
    expect(lines).toHaveLength(1);
  });
});

describe('auto-bundling', () => {
  const lines = priceCart(
    [
      { productId: 'P-PB-2026', colorCode: 'C1', qty: 10 },
      { productId: 'P-PB-2026', colorCode: 'C2', qty: 4 },
    ],
    { products },
  );

  it('pulls one case and one cloth per frame', () => {
    const bundles = bundleRequirements(lines, products);
    expect(bundles).toHaveLength(2);
    expect(bundles.every((b) => b.qty === 14)).toBe(true);
  });

  it('adds nothing to the invoice total', () => {
    const totals = summariseVoucher({ lines });
    expect(totals.subtotal).toBe(14 * 17100);
  });

  it('does not bundle accessories recursively', () => {
    const accessoryOnly = priceCart([{ productId: 'P-CASE', colorCode: 'C0', qty: 5 }], { products });
    expect(bundleRequirements(accessoryOnly, products)).toHaveLength(0);
  });
});

describe('checkStock', () => {
  it('blocks a line that exceeds stock at the selected location', () => {
    const lines = priceCart([{ productId: 'P-PB-2026', colorCode: 'C2', qty: 9 }], { products });
    const result = checkStock(lines, [], { products, locationId: 'LOC-MAIN' });
    expect(result.ok).toBe(false);
    expect(result.shortages[0]).toMatchObject({ requested: 9, available: 4, short: 5 });
  });

  it('treats a bundled shortage as a warning, not a blocker', () => {
    const lines = priceCart([{ productId: 'P-PB-2026', colorCode: 'C1', qty: 10 }], { products });
    const bundles = bundleRequirements(lines, products);
    const result = checkStock(lines, bundles, { products, locationId: 'LOC-MAIN' });
    expect(result.ok).toBe(true); // cloth is short, the frames still ship
    expect(result.warnings[0]).toMatchObject({ label: 'CLOTH-STD', short: 7 });
  });

  it('stays silent about a bundled product whose variants have not loaded', () => {
    const notLoaded = [frame, { ...caseProduct, variants: [] }, { ...clothProduct, variants: [] }];
    const lines = priceCart([{ productId: 'P-PB-2026', colorCode: 'C1', qty: 10 }], { products: notLoaded });
    const result = checkStock(lines, bundleRequirements(lines, notLoaded), {
      products: notLoaded,
      locationId: 'LOC-MAIN',
    });
    expect(result.warnings).toHaveLength(0); // unknown is not zero
    expect(result.ok).toBe(true);
  });

  it('counts stock only at the chosen location', () => {
    const lines = priceCart([{ productId: 'P-PB-2026', colorCode: 'C1', qty: 1 }], { products });
    const result = checkStock(lines, [], { products, locationId: 'LOC-CAR-ZM' });
    expect(result.ok).toBe(false); // nothing in the car
  });
});

describe('summariseVoucher — the invoice arithmetic', () => {
  const lines = priceCart([{ productId: 'P-PB-2026', colorCode: 'C1', qty: 10 }], { products });

  it('carries previous balance through to the new balance', () => {
    const totals = summariseVoucher({ lines, previousBalance: 500_000, payment: 200_000 });
    expect(totals.subtotal).toBe(171_000);
    expect(totals.grandTotal).toBe(171_000);
    expect(totals.newBalance).toBe(500_000 + 171_000 - 200_000);
  });

  it('applies a percentage discount to the subtotal', () => {
    const totals = summariseVoucher({ lines, discount: 10, discountMode: DISCOUNT_MODES.PERCENT });
    expect(totals.discountAmount).toBe(17_100);
    expect(totals.grandTotal).toBe(153_900);
  });

  it('never discounts below zero or pays more than is owed', () => {
    expect(summariseVoucher({ lines, discount: 999_999 }).grandTotal).toBe(0);
    expect(summariseVoucher({ lines, previousBalance: 0, payment: 999_999 }).newBalance).toBe(0);
  });

  it('reports the tier saving against list price', () => {
    const totals = summariseVoucher({ lines });
    expect(totals.listSubtotal).toBe(180_000);
    expect(totals.tierSavings).toBe(9_000);
  });

  it('dates the voucher 14 days out', () => {
    const issueDate = new Date('2026-09-21T10:00:00Z');
    const totals = summariseVoucher({ lines, issueDate });
    expect(totals.dueDate.toISOString().slice(0, 10)).toBe('2026-10-05');
  });
});

describe('buildVoucherDoc', () => {
  const lines = priceCart([{ productId: 'P-PB-2026', colorCode: 'C1', qty: 10 }], { products });
  const bundles = bundleRequirements(lines, products);
  const shop = { id: 'SH-001', name: 'Shwe Myint', township: 'Latha', salesRepId: 'u-1' };
  const actor = { uid: 'u-1', name: 'Ko Zin', repCode: 'ZM' };

  it('is ISSUED with a balance and PAID when settled at issue', () => {
    const open = summariseVoucher({ lines, payment: 0 });
    expect(buildVoucherDoc({ shop, lines, bundles, totals: open, actor })).toMatchObject({
      status: 'ISSUED',
      balanceDue: 171_000,
    });

    const settled = summariseVoucher({ lines, payment: 171_000 });
    expect(buildVoucherDoc({ shop, lines, bundles, totals: settled, actor })).toMatchObject({
      status: 'PAID',
      balanceDue: 0,
    });
  });

  it('gives consignment no debt at all', () => {
    const totals = summariseVoucher({ lines });
    const doc = buildVoucherDoc({ shop, lines, bundles, totals, actor, type: 'CONSIGNMENT' });
    expect(doc).toMatchObject({ status: 'CONSIGNED', balanceDue: 0, paidAmount: 0 });
    expect(doc.grandTotal).toBe(171_000); // value is still recorded
  });

  it('stamps a collision-free voucher number carrying the rep code', () => {
    const totals = summariseVoucher({ lines });
    const a = buildVoucherDoc({ shop, lines, bundles, totals, actor });
    const b = buildVoucherDoc({ shop, lines, bundles, totals, actor });
    expect(a.voucherNo).toMatch(/^VN-ZM\d{6}-[A-Z0-9]{4}$/);
    expect(a.voucherNo).not.toBe(b.voucherNo);
  });

  it('records the bundled case and cloth on each frame line', () => {
    const totals = summariseVoucher({ lines });
    const doc = buildVoucherDoc({ shop, lines, bundles, totals, actor });
    expect(doc.items[0].bundled).toEqual({ case: 10, cloth: 10 });
  });
});
