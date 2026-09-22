import { describe, expect, it } from 'vitest';
import { shopPurchaseHistory, shopPurchaseSummary } from './shopPurchaseHistory';

function voucher(overrides = {}) {
  return {
    id: 'v1',
    voucherNo: 'VN-001',
    type: 'SALE',
    status: 'ISSUED',
    issueDate: '2026-09-01T10:00:00+06:30',
    grandTotal: 100_000,
    items: [
      { productId: 'P-A', modelNo: 'PB-100', colorCode: 'C1', colorName: 'Black', qty: 5, unitPrice: 20_000, lineTotal: 100_000 },
    ],
    ...overrides,
  };
}

describe('shopPurchaseHistory', () => {
  it('flattens one row per sold line, not per voucher', () => {
    const v = voucher({
      items: [
        { productId: 'P-A', modelNo: 'PB-100', colorCode: 'C1', colorName: 'Black', qty: 5, unitPrice: 20_000, lineTotal: 100_000 },
        { productId: 'P-B', modelNo: 'PB-200', colorCode: 'C2', colorName: 'Tortoise', qty: 2, unitPrice: 30_000, lineTotal: 60_000 },
      ],
    });
    const rows = shopPurchaseHistory([v]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ modelNo: 'PB-100', colorName: 'Black', qty: 5, amount: 100_000 });
    expect(rows[1]).toMatchObject({ modelNo: 'PB-200', colorName: 'Tortoise', qty: 2, amount: 60_000 });
  });

  it('sorts newest first', () => {
    const rows = shopPurchaseHistory([
      voucher({ id: 'old', issueDate: '2026-01-01T00:00:00+06:30' }),
      voucher({ id: 'new', issueDate: '2026-09-01T00:00:00+06:30' }),
    ]);
    expect(rows.map((r) => r.date)).toEqual(['2026-09-01T00:00:00+06:30', '2026-01-01T00:00:00+06:30']);
  });

  it('excludes voided vouchers — a voided voucher never happened', () => {
    const rows = shopPurchaseHistory([voucher({ status: 'VOID' })]);
    expect(rows).toEqual([]);
  });

  it('includes consignment rows, tagged by type, since stock did leave the warehouse', () => {
    const rows = shopPurchaseHistory([voucher({ type: 'CONSIGNMENT' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('CONSIGNMENT');
  });

  it('falls back to the colour code when no colour name is recorded', () => {
    const v = voucher({ items: [{ productId: 'P-A', modelNo: 'PB-100', colorCode: 'C1', qty: 1, lineTotal: 1000 }] });
    expect(shopPurchaseHistory([v])[0].colorName).toBe('C1');
  });
});

describe('shopPurchaseSummary', () => {
  it('totals pieces and revenue across sale vouchers only', () => {
    const summary = shopPurchaseSummary([
      voucher({ id: 'v1', grandTotal: 100_000, items: [{ qty: 5, lineTotal: 100_000 }] }),
      voucher({ id: 'v2', type: 'CONSIGNMENT', grandTotal: 900_000, items: [{ qty: 9, lineTotal: 900_000 }] }),
      voucher({ id: 'v3', status: 'VOID', grandTotal: 900_000, items: [{ qty: 9, lineTotal: 900_000 }] }),
    ]);
    expect(summary).toMatchObject({ voucherCount: 1, pieces: 5, revenue: 100_000 });
  });

  it('reports the most recent purchase date across sale vouchers', () => {
    const summary = shopPurchaseSummary([
      voucher({ id: 'v1', issueDate: '2026-01-01T00:00:00+06:30' }),
      voucher({ id: 'v2', issueDate: '2026-09-01T00:00:00+06:30' }),
    ]);
    expect(summary.lastPurchaseAt.getTime()).toBe(new Date('2026-09-01T00:00:00+06:30').getTime());
  });

  it('returns zeroed totals for a shop with no purchases', () => {
    expect(shopPurchaseSummary([])).toEqual({ voucherCount: 0, pieces: 0, revenue: 0, lastPurchaseAt: null });
  });
});
