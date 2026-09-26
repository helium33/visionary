import { describe, expect, it } from 'vitest';
import { addHours, subDays } from 'date-fns';
import { reconcileTrip, settlementPlan } from './carStock';

const TODAY = new Date('2026-09-21T18:00:00+06:30');
const OPENED = subDays(TODAY, 1);

const productsById = new Map([
  ['P-A', { id: 'P-A', modelNo: 'PB-2026', costing: { actualCost: 10_000 } }],
  ['P-B', { id: 'P-B', modelNo: 'TR-9045', costing: { actualCost: 8_000 } }],
]);

const line = (productId, colorCode, qty, modelNo) => ({
  productId,
  colorCode,
  qty,
  modelNo: modelNo ?? productsById.get(productId)?.modelNo,
});

function trip(overrides = {}) {
  return {
    id: 'TRIP-1',
    tripNo: 'CAR-260921-ZM',
    repId: 'u-sales-1',
    locationId: 'LOC-CAR-ZM',
    status: 'OPEN',
    openedAt: OPENED.toISOString(),
    closedAt: null,
    openingLines: [],
    loadLines: [line('P-A', 'C1', 12), line('P-B', 'C1', 10)],
    countedLines: [],
    cash: {},
    ...overrides,
  };
}

function voucher(overrides = {}) {
  return {
    id: 'v1',
    type: 'SALE',
    status: 'ISSUED',
    locationId: 'LOC-CAR-ZM',
    issueDate: addHours(OPENED, 4).toISOString(),
    grandTotal: 200_000,
    balanceDue: 200_000,
    items: [{ ...line('P-A', 'C1', 8), unitPrice: 25_000, lineTotal: 200_000 }],
    ...overrides,
  };
}

describe('reconcileTrip — what should be in the bag', () => {
  const result = reconcileTrip({
    trip: trip(),
    vouchers: [voucher()],
    payments: [],
    productsById,
    today: TODAY,
  });

  it('works it out from the trip’s own movements', () => {
    const pb = result.stockLines.find((l) => l.colorCode === 'C1' && l.modelNo === 'PB-2026');
    // Took 12, sold 8, so 4 should be in the bag.
    expect(pb).toMatchObject({ opening: 0, loaded: 12, sold: 8, expected: 4 });
  });

  it('carries leftover stock from the previous trip into the opening figure', () => {
    const withOpening = reconcileTrip({
      trip: trip({ openingLines: [line('P-A', 'C1', 3)] }),
      vouchers: [voucher()],
      productsById,
      today: TODAY,
    });
    expect(withOpening.stockLines.find((l) => l.modelNo === 'PB-2026').expected).toBe(7);
  });

  it('counts consignment out of the bag even though it is not a sale', () => {
    const consigned = reconcileTrip({
      trip: trip(),
      vouchers: [voucher({ id: 'v2', type: 'CONSIGNMENT', balanceDue: 0 })],
      productsById,
      today: TODAY,
    });
    expect(consigned.stockLines.find((l) => l.modelNo === 'PB-2026').sold).toBe(8);
    expect(consigned.creditIssued).toBe(0);
    expect(consigned.consignedValue).toBe(200_000);
  });

  it('ignores a voucher written from the warehouse, not the car', () => {
    const other = reconcileTrip({
      trip: trip(),
      vouchers: [voucher({ locationId: 'LOC-MAIN' })],
      productsById,
      today: TODAY,
    });
    expect(other.stockLines.find((l) => l.modelNo === 'PB-2026').sold).toBe(0);
  });

  it('ignores a voucher written before the rep left', () => {
    const stale = reconcileTrip({
      trip: trip(),
      vouchers: [voucher({ issueDate: subDays(OPENED, 2).toISOString() })],
      productsById,
      today: TODAY,
    });
    expect(stale.piecesSold).toBe(0);
  });

  it('ignores a voided voucher', () => {
    const voided = reconcileTrip({
      trip: trip(),
      vouchers: [voucher({ status: 'VOID' })],
      productsById,
      today: TODAY,
    });
    expect(voided.piecesSold).toBe(0);
  });

  it('leaves variance null until a count is entered', () => {
    expect(result.hasCount).toBe(false);
    expect(result.stockLines.every((l) => l.variance === null)).toBe(true);
    expect(result.balanced).toBe(false);
  });
});

describe('reconcileTrip — the count', () => {
  const counted = (lines) =>
    reconcileTrip({
      trip: trip({ countedLines: lines, cash: { counted: 0 } }),
      vouchers: [voucher()],
      payments: [],
      productsById,
      today: TODAY,
    });

  it('balances when the bag matches', () => {
    const result = counted([line('P-A', 'C1', 4), line('P-B', 'C1', 10)]);
    expect(result.shortPieces).toBe(0);
    expect(result.balanced).toBe(true);
  });

  it('values a shortage at landed cost', () => {
    const result = counted([line('P-A', 'C1', 2), line('P-B', 'C1', 10)]);
    expect(result.shortPieces).toBe(2);
    expect(result.shortValue).toBe(20_000);
    expect(result.balanced).toBe(false);
  });

  it('flags extra stock as a variance too, not as a bonus', () => {
    const result = counted([line('P-A', 'C1', 6), line('P-B', 'C1', 10)]);
    expect(result.overPieces).toBe(2);
    expect(result.balanced).toBe(false);
  });

  it('treats a colour missing from the count as zero, not as uncounted', () => {
    const result = counted([line('P-A', 'C1', 4)]);
    const tr = result.stockLines.find((l) => l.modelNo === 'TR-9045');
    expect(tr.counted).toBe(0);
    expect(tr.variance).toBe(-10);
  });
});

describe('reconcileTrip — cash', () => {
  const payments = [
    { receivedBy: 'u-sales-1', method: 'CASH', amount: 150_000, receivedAt: addHours(OPENED, 5).toISOString() },
    { receivedBy: 'u-sales-1', method: 'KBZ_PAY', amount: 400_000, receivedAt: addHours(OPENED, 6).toISOString() },
    { receivedBy: 'u-sales-2', method: 'CASH', amount: 99_000, receivedAt: addHours(OPENED, 6).toISOString() },
  ];

  it('expects only physical cash to be handed over', () => {
    const result = reconcileTrip({
      trip: trip({ cash: { counted: 150_000 } }),
      vouchers: [],
      payments,
      productsById,
      today: TODAY,
    });
    // The KBZPay collection is real money, but it is already in the bank —
    // counting it as cash owed would short every trip by that amount.
    expect(result.expectedCash).toBe(150_000);
    expect(result.digitalCollected).toBe(400_000);
    expect(result.cashVariance).toBe(0);
  });

  it('ignores another rep’s collections', () => {
    const result = reconcileTrip({ trip: trip(), payments, productsById, today: TODAY });
    expect(result.expectedCash).toBe(150_000);
  });

  it('reports a cash shortfall as a negative variance', () => {
    const result = reconcileTrip({
      trip: trip({ cash: { counted: 120_000 } }),
      payments,
      productsById,
      today: TODAY,
    });
    expect(result.cashVariance).toBe(-30_000);
  });

  it('leaves cash variance null until the money is counted', () => {
    const result = reconcileTrip({ trip: trip(), payments, productsById, today: TODAY });
    expect(result.countedCash).toBeNull();
    expect(result.cashVariance).toBeNull();
  });
});

describe('reconcileTrip — debt', () => {
  it('records new credit as a result, not as a variance', () => {
    const result = reconcileTrip({
      trip: trip({ countedLines: [line('P-A', 'C1', 4), line('P-B', 'C1', 10)], cash: { counted: 0 } }),
      vouchers: [voucher({ grandTotal: 200_000, balanceDue: 200_000 })],
      payments: [],
      productsById,
      today: TODAY,
    });
    expect(result.creditIssued).toBe(200_000);
    expect(result.salesValue).toBe(200_000);
    // Selling on 14-day terms is the job; it must not read as a discrepancy.
    expect(result.balanced).toBe(true);
  });
});

describe('settlementPlan', () => {
  const reconciliation = reconcileTrip({
    trip: trip({ countedLines: [line('P-A', 'C1', 2), line('P-B', 'C1', 10)], cash: { counted: 0 } }),
    vouchers: [voucher()],
    payments: [],
    productsById,
    today: TODAY,
  });

  it('writes the shortage as an explicit signed adjustment', () => {
    const plan = settlementPlan(reconciliation);
    expect(plan.adjustments).toEqual([
      expect.objectContaining({ modelNo: 'PB-2026', qty: -2, reason: 'SHORTAGE', value: -20_000 }),
    ]);
  });

  it('returns what was counted to the warehouse by default', () => {
    const plan = settlementPlan(reconciliation);
    expect(plan.returns).toHaveLength(2);
    expect(plan.returns[0]).toMatchObject({ fromLocationId: 'LOC-CAR-ZM', toLocationId: 'LOC-MAIN' });
  });

  it('leaves the bag loaded when the rep keeps it for tomorrow', () => {
    const plan = settlementPlan(reconciliation, { returnToWarehouse: false });
    expect(plan.returns).toHaveLength(0);
    // The adjustment still happens — a shortage is a loss either way.
    expect(plan.adjustments).toHaveLength(1);
  });

  it('refuses to settle a trip nobody has counted', () => {
    const uncounted = reconcileTrip({ trip: trip(), vouchers: [], productsById, today: TODAY });
    expect(settlementPlan(uncounted)).toBeNull();
  });
});
