import { toDate } from '../lib/dates';

/**
 * ---------------------------------------------------------------------------
 * CAR STOCK RECONCILIATION — stock, cash and debt, when the rep comes back.
 * ---------------------------------------------------------------------------
 * A rep leaves with a bag of frames and comes back with some frames, some
 * cash, and some new debt on shops' accounts. The three have to tie out
 * together or the business has no idea what it owns.
 *
 * The expected figure is built from the trip's own movements —
 *
 *     opening + loaded − sold = should be in the bag
 *
 * — rather than read off the product's stock field. Two reasons:
 *
 *  1. IT EXPLAINS ITSELF. "You took 12, sold 8, so you should have 4" is an
 *     argument a rep can check standing at the counter. "The system says 4" is
 *     not, and a reconciliation nobody trusts gets signed without counting.
 *  2. IT WORKS OFFLINE. The movements are on documents the device already has;
 *     the live stock figure may be mid-sync.
 */

export const TRIP_STATUS = {
  OPEN: { key: 'OPEN', label: 'Out on the road', tone: 'neutral' },
  RECONCILING: { key: 'RECONCILING', label: 'Counting in', tone: 'warning' },
  CLOSED: { key: 'CLOSED', label: 'Reconciled', tone: 'good' },
};

/** Only physical cash has to be handed over — see `reconcileTrip`. */
export const CASH_METHODS = new Set(['CASH']);

function keyOf(line) {
  return `${line.productId}::${line.colorCode}`;
}

function accumulate(map, line, field, qty) {
  const key = keyOf(line);
  const current = map.get(key) ?? {
    key,
    productId: line.productId,
    modelNo: line.modelNo ?? line.productId,
    colorCode: line.colorCode,
    colorName: line.colorName ?? '',
    opening: 0,
    loaded: 0,
    sold: 0,
    counted: null,
  };
  current[field] += qty;
  if (line.modelNo && !current.modelNo) current.modelNo = line.modelNo;
  if (line.colorName && !current.colorName) current.colorName = line.colorName;
  map.set(key, current);
  return current;
}

/**
 * @param {object}   trip       carTrips document
 * @param {object[]} vouchers   every voucher (filtered here to this trip)
 * @param {object[]} payments   every payment (filtered here to this rep/window)
 * @param {Map}      productsById  for costing the shortfall
 */
export function reconcileTrip({
  trip,
  vouchers = [],
  payments = [],
  productsById,
  today = new Date(),
} = {}) {
  if (!trip) return null;

  const openedAt = toDate(trip.openedAt);
  const closedAt = toDate(trip.closedAt) ?? today;
  const inTrip = (value) => {
    const date = toDate(value);
    if (!date || !openedAt) return false;
    return date >= openedAt && date <= closedAt;
  };

  // ---- Stock ------------------------------------------------------------
  const lines = new Map();

  for (const line of trip.openingLines ?? []) {
    accumulate(lines, line, 'opening', Number(line.qty) || 0);
  }
  for (const line of trip.loadLines ?? []) {
    accumulate(lines, line, 'loaded', Number(line.qty) || 0);
  }

  // Vouchers written from this car during the trip. Consignment moves stock
  // too — it leaves the bag even though it is not a sale.
  const tripVouchers = vouchers.filter(
    (voucher) =>
      voucher.locationId === trip.locationId &&
      voucher.status !== 'VOID' &&
      inTrip(voucher.issueDate),
  );

  for (const voucher of tripVouchers) {
    for (const item of voucher.items ?? []) {
      accumulate(lines, item, 'sold', Number(item.qty) || 0);
    }
  }

  const counted = new Map(
    (trip.countedLines ?? []).map((line) => [keyOf(line), Number(line.qty) || 0]),
  );
  const hasCount = (trip.countedLines ?? []).length > 0;

  const stockLines = [...lines.values()]
    .map((line) => {
      const expected = line.opening + line.loaded - line.sold;
      const countedQty = counted.has(line.key) ? counted.get(line.key) : hasCount ? 0 : null;
      const variance = countedQty == null ? null : countedQty - expected;
      const unitCost = Number(productsById?.get?.(line.productId)?.costing?.actualCost) || 0;
      return {
        ...line,
        expected,
        counted: countedQty,
        variance,
        unitCost,
        varianceValue: variance == null ? 0 : variance * unitCost,
      };
    })
    .sort((a, b) => a.modelNo.localeCompare(b.modelNo) || a.colorCode.localeCompare(b.colorCode));

  const shortLines = stockLines.filter((line) => line.variance != null && line.variance < 0);
  const overLines = stockLines.filter((line) => line.variance != null && line.variance > 0);

  // ---- Cash -------------------------------------------------------------
  const tripPayments = payments.filter(
    (payment) => payment.receivedBy === trip.repId && inTrip(payment.receivedAt),
  );

  // Only physical cash has to be handed over. A shop that paid by KBZPay has
  // already moved the money — counting it as cash the rep owes would create a
  // shortfall every single trip.
  const cashPayments = tripPayments.filter((payment) => CASH_METHODS.has(payment.method));
  const digitalPayments = tripPayments.filter((payment) => !CASH_METHODS.has(payment.method));

  const expectedCash = sum(cashPayments, 'amount');
  const digitalCollected = sum(digitalPayments, 'amount');
  const countedCash = trip.cash?.counted == null ? null : Number(trip.cash.counted) || 0;
  const cashVariance = countedCash == null ? null : countedCash - expectedCash;

  // ---- Debt -------------------------------------------------------------
  const creditIssued = tripVouchers
    .filter((voucher) => voucher.type !== 'CONSIGNMENT')
    .reduce((total, voucher) => total + (Number(voucher.balanceDue) || 0), 0);

  const consignedValue = tripVouchers
    .filter((voucher) => voucher.type === 'CONSIGNMENT')
    .reduce((total, voucher) => total + (Number(voucher.grandTotal) || 0), 0);

  const salesValue = tripVouchers
    .filter((voucher) => voucher.type !== 'CONSIGNMENT')
    .reduce((total, voucher) => total + (Number(voucher.grandTotal) || 0), 0);

  const piecesOut = stockLines.reduce((total, line) => total + line.opening + line.loaded, 0);
  const piecesSold = stockLines.reduce((total, line) => total + line.sold, 0);
  const piecesExpected = stockLines.reduce((total, line) => total + line.expected, 0);
  const piecesCounted = hasCount
    ? stockLines.reduce((total, line) => total + (line.counted ?? 0), 0)
    : null;

  const shortPieces = shortLines.reduce((total, line) => total + Math.abs(line.variance), 0);
  const shortValue = shortLines.reduce((total, line) => total + Math.abs(line.varianceValue), 0);

  return {
    trip,
    stockLines,
    shortLines,
    overLines,
    hasCount,
    piecesOut,
    piecesSold,
    piecesExpected,
    piecesCounted,
    shortPieces,
    shortValue,
    overPieces: overLines.reduce((total, line) => total + line.variance, 0),

    vouchers: tripVouchers,
    voucherCount: tripVouchers.length,
    salesValue,
    creditIssued,
    consignedValue,

    payments: tripPayments,
    expectedCash,
    digitalCollected,
    countedCash,
    cashVariance,

    // The trip ties out when the bag and the cash bag both agree. Debt is not
    // a variance — it is the expected result of selling on 14-day terms.
    balanced: hasCount && shortPieces === 0 && overLines.length === 0 && cashVariance === 0,
  };
}

/**
 * What closing the trip writes: the counted figure becomes the truth, and the
 * difference is an explicit adjustment rather than a silent overwrite — a
 * shortage is a loss someone has to account for, so it leaves a record.
 */
export function settlementPlan(reconciliation, { returnToWarehouse = true } = {}) {
  if (!reconciliation?.hasCount) return null;
  const { trip, stockLines } = reconciliation;

  const adjustments = stockLines
    .filter((line) => line.variance !== 0 && line.variance != null)
    .map((line) => ({
      productId: line.productId,
      modelNo: line.modelNo,
      colorCode: line.colorCode,
      qty: line.variance, // signed: negative is missing stock
      locationId: trip.locationId,
      reason: line.variance < 0 ? 'SHORTAGE' : 'OVERAGE',
      value: line.varianceValue,
    }));

  // Everything counted goes back to the warehouse unless the rep keeps the bag
  // loaded for tomorrow.
  const returns = returnToWarehouse
    ? stockLines
        .filter((line) => (line.counted ?? 0) > 0)
        .map((line) => ({
          productId: line.productId,
          modelNo: line.modelNo,
          colorCode: line.colorCode,
          qty: line.counted,
          fromLocationId: trip.locationId,
          toLocationId: 'LOC-MAIN',
        }))
    : [];

  return {
    adjustments,
    returns,
    returnToWarehouse,
    cash: {
      expected: reconciliation.expectedCash,
      counted: reconciliation.countedCash,
      variance: reconciliation.cashVariance,
    },
  };
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}
