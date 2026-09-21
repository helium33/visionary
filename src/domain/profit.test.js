import { describe, expect, it } from 'vitest';
import { subDays } from 'date-fns';
import { computeProfitAndLoss, lineCost, profitBridge, profitByModel } from './profit';
import { computeCommissions } from './commission';

const TODAY = new Date('2026-09-21T10:00:00+06:30');
const FROM = subDays(TODAY, 90);

const productsById = new Map([
  ['P-A', { id: 'P-A', modelNo: 'A', costing: { actualCost: 11_000 } }],
  ['P-B', { id: 'P-B', modelNo: 'B', costing: { actualCost: 6_000 } }],
]);

function voucher(overrides = {}) {
  return {
    id: 'v1',
    type: 'SALE',
    status: 'ISSUED',
    salesRepId: 'rep-1',
    shopId: 'shop-1',
    issueDate: subDays(TODAY, 10).toISOString(),
    subtotal: 200_000,
    discount: 0,
    grandTotal: 200_000,
    items: [
      {
        productId: 'P-A',
        modelNo: 'A',
        qty: 10,
        unitPrice: 20_000,
        lineTotal: 200_000,
        unitCost: 10_000,
        bundleUnitCost: 800,
      },
    ],
    ...overrides,
  };
}

const expenses = [
  { id: 'e1', date: subDays(TODAY, 5).toISOString(), category: 'SALARY', amount: 50_000 },
  { id: 'e2', date: subDays(TODAY, 6).toISOString(), category: 'RENT', amount: 30_000 },
  { id: 'e3', date: subDays(TODAY, 200).toISOString(), category: 'RENT', amount: 999_999 },
];

describe('lineCost — cost is frozen on the voucher', () => {
  it('uses the cost stored on the sold line', () => {
    const result = lineCost({ unitCost: 10_000, bundleUnitCost: 800, productId: 'P-A' }, productsById);
    expect(result).toEqual({ unitCost: 10_800, estimated: false });
  });

  it("does not move when the product's cost is restated later", () => {
    // The product now costs 11,000; the sold line still costs what it cost.
    expect(lineCost({ unitCost: 10_000, productId: 'P-A' }, productsById).unitCost).toBe(10_000);
  });

  it('falls back to the product and says so when a line predates the field', () => {
    const result = lineCost({ productId: 'P-A', qty: 1 }, productsById);
    expect(result).toEqual({ unitCost: 11_000, estimated: true });
  });
});

describe('computeProfitAndLoss', () => {
  const pnl = computeProfitAndLoss({
    vouchers: [voucher()],
    payments: [{ receivedAt: subDays(TODAY, 3).toISOString(), amount: 120_000 }],
    expenses,
    productsById,
    from: FROM,
    to: TODAY,
  });

  it('works down from revenue to net profit', () => {
    expect(pnl.revenue).toBe(200_000);
    expect(pnl.cogs).toBe(108_000); // 10 × (10,000 + 800)
    expect(pnl.grossProfit).toBe(92_000);
    expect(pnl.expenses.total).toBe(80_000);
    expect(pnl.netProfit).toBe(12_000);
  });

  it('reports both margins', () => {
    expect(pnl.grossMarginPct).toBe(46);
    expect(pnl.netMarginPct).toBe(6);
  });

  it('separates cash collected from revenue booked', () => {
    expect(pnl.collected).toBe(120_000);
    expect(pnl.collectionRatePct).toBe(60);
  });

  it('leaves expenses outside the window out', () => {
    expect(pnl.expenses.total).toBe(80_000); // the 200-day-old rent is excluded
  });

  it('excludes consignment from revenue and from cost', () => {
    const withConsignment = computeProfitAndLoss({
      vouchers: [voucher(), voucher({ id: 'v2', type: 'CONSIGNMENT' })],
      expenses: [],
      productsById,
      from: FROM,
      to: TODAY,
    });
    expect(withConsignment.revenue).toBe(200_000);
    expect(withConsignment.cogs).toBe(108_000);
  });

  it('excludes a voided voucher', () => {
    const withVoid = computeProfitAndLoss({
      vouchers: [voucher(), voucher({ id: 'v3', status: 'VOID' })],
      expenses: [],
      productsById,
      from: FROM,
      to: TODAY,
    });
    expect(withVoid.voucherCount).toBe(1);
  });

  it('counts the discount as given, not as revenue', () => {
    const discounted = computeProfitAndLoss({
      vouchers: [voucher({ subtotal: 200_000, discount: 20_000, grandTotal: 180_000 })],
      expenses: [],
      productsById,
      from: FROM,
      to: TODAY,
    });
    expect(discounted.grossSales).toBe(200_000);
    expect(discounted.discounts).toBe(20_000);
    expect(discounted.revenue).toBe(180_000);
    expect(discounted.grossProfit).toBe(72_000);
  });

  it('flags a result that leaned on estimated costs', () => {
    const legacy = computeProfitAndLoss({
      vouchers: [voucher({ items: [{ productId: 'P-A', modelNo: 'A', qty: 10, lineTotal: 200_000 }] })],
      expenses: [],
      productsById,
      from: FROM,
      to: TODAY,
    });
    expect(legacy.costEstimated).toBe(true);
    expect(legacy.estimatedLines).toBe(1);
    expect(legacy.cogs).toBe(110_000);
  });

  it('returns zeros rather than NaN with nothing to report', () => {
    const empty = computeProfitAndLoss({ from: FROM, to: TODAY });
    expect(empty).toMatchObject({ revenue: 0, cogs: 0, netProfit: 0, grossMarginPct: 0 });
  });
});

describe('profitBridge', () => {
  it('walks revenue down to net profit through each expense category', () => {
    const pnl = computeProfitAndLoss({
      vouchers: [voucher()],
      expenses,
      productsById,
      from: FROM,
      to: TODAY,
    });
    const bridge = profitBridge(pnl);
    expect(bridge.map((step) => step.key)).toEqual([
      'REVENUE',
      'COGS',
      'GROSS',
      'SALARY',
      'RENT',
      'NET',
    ]);
    // Every decrease is signed negative so the chart never has to guess.
    expect(bridge.filter((s) => s.type === 'decrease').every((s) => s.value < 0)).toBe(true);
    expect(bridge.at(-1).value).toBe(12_000);
  });
});

describe('profitByModel', () => {
  it('ranks models by profit, not by revenue', () => {
    const rows = profitByModel({
      vouchers: [
        voucher({
          items: [
            // High revenue, thin margin.
            { productId: 'P-A', modelNo: 'A', qty: 10, lineTotal: 200_000, unitCost: 19_000 },
            // Lower revenue, fat margin.
            { productId: 'P-B', modelNo: 'B', qty: 10, lineTotal: 150_000, unitCost: 6_000 },
          ],
        }),
      ],
      productsById,
      from: FROM,
      to: TODAY,
    });
    expect(rows.map((r) => r.key)).toEqual(['B', 'A']);
    expect(rows[0]).toMatchObject({ profit: 90_000, marginPct: 60 });
    expect(rows[1]).toMatchObject({ profit: 10_000, marginPct: 5 });
  });
});

describe('computeCommissions', () => {
  const reps = [
    { id: 'rep-1', name: 'Ko Zin', role: 'SALES', commissionRatePct: 2.5 },
    { id: 'rep-2', name: 'Ko Wai', role: 'SALES', commissionRatePct: 2.5 },
  ];
  const shops = [
    { id: 'shop-1', salesRepId: 'rep-1' },
    { id: 'shop-2', salesRepId: 'rep-2' },
  ];
  const vouchers = [
    voucher({ id: 'v1', salesRepId: 'rep-1', grandTotal: 1_000_000 }),
    voucher({ id: 'v2', salesRepId: 'rep-2', grandTotal: 400_000 }),
  ];
  const payments = [
    { receivedAt: subDays(TODAY, 4).toISOString(), receivedBy: 'rep-1', amount: 600_000, onTime: true },
    { receivedAt: subDays(TODAY, 2).toISOString(), receivedBy: 'rep-1', amount: 400_000, onTime: false },
    { receivedAt: subDays(TODAY, 2).toISOString(), receivedBy: 'rep-2', amount: 300_000, onTime: true },
  ];

  const result = computeCommissions({ vouchers, payments, reps, shops, from: FROM, to: TODAY });

  it('pays base commission on what the rep sold', () => {
    expect(result.rows[0].salesValue).toBe(1_000_000);
    expect(result.rows[0].baseCommission).toBe(25_000);
  });

  it('pays the bonus only on cash collected inside the term', () => {
    const zin = result.rows.find((r) => r.repId === 'rep-1');
    expect(zin.collected).toBe(1_000_000);
    expect(zin.collectedOnTime).toBe(600_000);
    expect(zin.collectionBonus).toBe(6_000); // 1% of the on-time half only
    expect(zin.onTimeRatePct).toBe(60);
  });

  it('shows the bonus a rep gave up by collecting late', () => {
    const zin = result.rows.find((r) => r.repId === 'rep-1');
    expect(zin.bonusForgone).toBe(4_000); // 1% of the 400,000 collected late
  });

  it('ranks reps by total earnings', () => {
    expect(result.rows.map((r) => r.repId)).toEqual(['rep-1', 'rep-2']);
    expect(result.rows[0].total).toBe(31_000);
  });

  it('attributes a voucher with no rep through the shop it was sold to', () => {
    const orphan = computeCommissions({
      vouchers: [voucher({ id: 'v9', salesRepId: undefined, shopId: 'shop-2', grandTotal: 100_000 })],
      payments: [],
      reps,
      shops,
      from: FROM,
      to: TODAY,
    });
    expect(orphan.rows.find((r) => r.repId === 'rep-2').salesValue).toBe(100_000);
  });

  it('totals across the team', () => {
    expect(result.totals.salesValue).toBe(1_400_000);
    expect(result.totals.total).toBe(31_000 + 10_000 + 3_000);
  });
});
