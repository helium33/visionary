import { describe, expect, it } from 'vitest';
import { subDays } from 'date-fns';
import { districtSales, leadingDistrict, topShops, townshipSales } from './townshipAnalytics';

const TODAY = new Date('2026-09-21T10:00:00+06:30');

function voucher(overrides = {}) {
  return {
    id: 'v1',
    type: 'SALE',
    status: 'ISSUED',
    shopId: 'shop-1',
    shopName: 'Shop 1',
    township: 'Latha',
    grandTotal: 100_000,
    items: [{ productId: 'P-A', qty: 5 }],
    ...overrides,
  };
}

describe('districtSales', () => {
  it('rolls vouchers up to their township’s district, in DISTRICT_ORDER', () => {
    const vouchers = [
      voucher({ id: 'v1', township: 'Insein', grandTotal: 100_000, items: [{ qty: 2 }] }), // NORTH
      voucher({ id: 'v2', township: 'Thanlyin', grandTotal: 50_000, items: [{ qty: 1 }] }), // SOUTH
      voucher({ id: 'v3', township: 'Tamwe', grandTotal: 75_000, items: [{ qty: 3 }] }), // EAST
      voucher({ id: 'v4', township: 'Latha', grandTotal: 200_000, items: [{ qty: 4 }] }), // WEST
    ];
    const { rows } = districtSales(vouchers);

    expect(rows.map((r) => r.key)).toEqual(['NORTH', 'SOUTH', 'EAST', 'WEST']);
    expect(rows[0]).toMatchObject({ revenue: 100_000, volume: 2, count: 1 });
    expect(rows[3]).toMatchObject({ revenue: 200_000, volume: 4, count: 1 });
  });

  it('zero-fills a district with no sales rather than omitting it', () => {
    const { rows } = districtSales([voucher({ township: 'Latha' })]);
    const north = rows.find((r) => r.key === 'NORTH');
    expect(north).toEqual({ key: 'NORTH', revenue: 0, volume: 0, count: 0 });
  });

  it('excludes consignment and void vouchers — the same rule computeProfitAndLoss uses', () => {
    const vouchers = [
      voucher({ id: 'v1', type: 'SALE', status: 'ISSUED', grandTotal: 100_000 }),
      voucher({ id: 'v2', type: 'CONSIGNMENT', grandTotal: 900_000 }),
      voucher({ id: 'v3', type: 'SALE', status: 'VOID', grandTotal: 900_000 }),
    ];
    const { rows } = districtSales(vouchers);
    const west = rows.find((r) => r.key === 'WEST'); // Latha
    expect(west.revenue).toBe(100_000);
  });

  it('rolls an unmapped township into `unassigned` instead of dropping or throwing', () => {
    const vouchers = [
      voucher({ township: 'Latha', grandTotal: 100_000 }),
      voucher({ township: 'Kungyangon', grandTotal: 40_000 }), // out-of-scope per districts.js coverage note
    ];
    const { rows, unassigned } = districtSales(vouchers);
    expect(rows.reduce((sum, r) => sum + r.revenue, 0)).toBe(100_000);
    expect(unassigned).toMatchObject({ revenue: 40_000, count: 1 });
  });
});

describe('townshipSales', () => {
  const vouchers = [
    voucher({ id: 'v1', township: 'Insein', grandTotal: 300_000 }),
    voucher({ id: 'v2', township: 'Hlaingthaya', grandTotal: 100_000 }),
    voucher({ id: 'v3', township: 'Latha', grandTotal: 999_999 }), // a different district — must not leak in
  ];

  it('returns every township in the district, sorted by revenue descending', () => {
    const rows = townshipSales(vouchers, 'NORTH');
    expect(rows[0]).toMatchObject({ key: 'Insein', revenue: 300_000 });
    expect(rows[1]).toMatchObject({ key: 'Hlaingthaya', revenue: 100_000 });
    // every NORTH township appears, even ones with zero sales
    expect(rows.find((r) => r.key === 'Mingaladon')).toMatchObject({ revenue: 0, volume: 0, count: 0 });
  });

  it('never lets another district’s township leak into the breakdown', () => {
    const rows = townshipSales(vouchers, 'NORTH');
    expect(rows.find((r) => r.key === 'Latha')).toBeUndefined();
  });

  it('returns an empty array for an unrecognised district key', () => {
    expect(townshipSales(vouchers, 'NOT_A_DISTRICT')).toEqual([]);
  });
});

describe('topShops', () => {
  it('aggregates multiple vouchers per shop and ranks by revenue', () => {
    const vouchers = [
      voucher({ id: 'v1', shopId: 'a', shopName: 'Shop A', grandTotal: 100_000 }),
      voucher({ id: 'v2', shopId: 'a', shopName: 'Shop A', grandTotal: 50_000 }),
      voucher({ id: 'v3', shopId: 'b', shopName: 'Shop B', grandTotal: 900_000 }),
    ];
    const rows = topShops(vouchers);
    expect(rows[0]).toMatchObject({ key: 'b', name: 'Shop B', revenue: 900_000, orders: 1 });
    expect(rows[1]).toMatchObject({ key: 'a', name: 'Shop A', revenue: 150_000, orders: 2 });
  });

  it('respects the limit', () => {
    const vouchers = Array.from({ length: 15 }, (_, i) =>
      voucher({ id: `v${i}`, shopId: `s${i}`, shopName: `Shop ${i}`, grandTotal: i * 1000 }),
    );
    expect(topShops(vouchers, { limit: 10 })).toHaveLength(10);
  });

  it('excludes consignment vouchers from the leaderboard', () => {
    const vouchers = [voucher({ type: 'CONSIGNMENT', shopId: 'a', grandTotal: 900_000 })];
    expect(topShops(vouchers)).toEqual([]);
  });
});

describe('date windowing — the same {from, to} convention profitByModel uses', () => {
  const vouchers = [
    voucher({ id: 'v1', township: 'Insein', grandTotal: 100_000, issueDate: subDays(TODAY, 5).toISOString() }),
    voucher({ id: 'v2', township: 'Insein', grandTotal: 900_000, issueDate: subDays(TODAY, 200).toISOString() }),
  ];
  const from = subDays(TODAY, 30);

  it('districtSales excludes vouchers outside the window', () => {
    const { rows } = districtSales(vouchers, { from, to: TODAY });
    expect(rows.find((r) => r.key === 'NORTH').revenue).toBe(100_000);
  });

  it('townshipSales excludes vouchers outside the window', () => {
    const rows = townshipSales(vouchers, 'NORTH', { from, to: TODAY });
    expect(rows.find((r) => r.key === 'Insein').revenue).toBe(100_000);
  });

  it('topShops excludes vouchers outside the window', () => {
    const rows = topShops(vouchers, { from, to: TODAY });
    expect(rows[0].revenue).toBe(100_000);
  });

  it('with no from/to, every voucher counts — the whole-history default', () => {
    const { rows } = districtSales(vouchers);
    expect(rows.find((r) => r.key === 'NORTH').revenue).toBe(1_000_000);
  });
});

describe('leadingDistrict', () => {
  it('returns the key of the highest-revenue row', () => {
    const { rows } = districtSales([
      voucher({ township: 'Latha', grandTotal: 500_000 }), // WEST
      voucher({ township: 'Insein', grandTotal: 100_000 }), // NORTH
    ]);
    expect(leadingDistrict(rows)).toBe('WEST');
  });
});
