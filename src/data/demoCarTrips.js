import { addHours, subDays, subHours } from 'date-fns';
import { demoVouchers } from './demoData';

/**
 * Car trips, built from the vouchers that were actually written out of each
 * bag — so the demo reconciliation is a real one rather than numbers that
 * happen to agree.
 */

const now = new Date();
const iso = (d) => d.toISOString();

/** Sums the items of the vouchers written from one car inside a window. */
function soldFrom(locationId, openedAt, closedAt) {
  const lines = new Map();
  for (const voucher of demoVouchers) {
    if (voucher.locationId !== locationId) continue;
    const issued = new Date(voucher.issueDate);
    if (issued < openedAt || issued > closedAt) continue;
    for (const item of voucher.items) {
      const key = `${item.productId}::${item.colorCode}`;
      const current = lines.get(key) ?? {
        productId: item.productId,
        modelNo: item.modelNo,
        colorCode: item.colorCode,
        colorName: item.colorName,
        qty: 0,
      };
      current.qty += item.qty;
      lines.set(key, current);
    }
  }
  return [...lines.values()];
}

/** Loaded = what sold, plus what is still meant to be in the bag. */
function loadFor(sold, spare) {
  return sold.map((line, i) => ({ ...line, qty: line.qty + spare[i % spare.length] }));
}

// ---------------------------------------------------------------- open trip
const zinOpened = subHours(now, 9);
const zinSold = soldFrom('LOC-CAR-ZM', zinOpened, now);
const zinLoad = loadFor(zinSold, [6, 3, 5, 2]);

// ---------------------------------------------------------------- closed trip
const waiClosed = subDays(now, 1);
const waiOpened = subHours(waiClosed, 4);
const waiSold = soldFrom('LOC-CAR-WP', waiOpened, addHours(waiClosed, 6));
const waiLoad = loadFor(waiSold, [4, 2, 3]);

export const demoCarTrips = [
  {
    id: 'TRIP-260921-ZM',
    tripNo: 'CAR-260921-ZM',
    repId: 'u-sales-1',
    repName: 'Ko Zin Min',
    locationId: 'LOC-CAR-ZM',
    status: 'OPEN',
    route: ['Latha', 'Pabedan', 'Lanmadaw'],
    openedAt: iso(zinOpened),
    closedAt: null,
    openingLines: [],
    loadLines: zinLoad,
    countedLines: [],
    cash: {},
    note: 'Downtown run — 29th Street cluster.',
  },
  {
    id: 'TRIP-260920-WP',
    tripNo: 'CAR-260920-WP',
    repId: 'u-sales-2',
    repName: 'Ko Wai Phyo',
    locationId: 'LOC-CAR-WP',
    status: 'CLOSED',
    route: ['Kamayut', 'Sanchaung'],
    openedAt: iso(waiOpened),
    closedAt: iso(addHours(waiClosed, 6)),
    openingLines: [],
    loadLines: waiLoad,
    // Came back one piece short — the kind of small shrinkage that only shows
    // up if somebody actually counts.
    countedLines: waiLoad.map((line, i) => {
      const sold = waiSold.find(
        (s) => s.productId === line.productId && s.colorCode === line.colorCode,
      );
      const expected = line.qty - (sold?.qty ?? 0);
      return { ...line, qty: i === 0 ? Math.max(0, expected - 1) : expected };
    }),
    cash: { counted: 890_000, note: 'Handed to Daw Sandar 18:20.' },
    reconciledBy: 'u-acct',
    note: 'Kamayut loop.',
  },
];
