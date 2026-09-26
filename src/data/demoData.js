import { addDays, subDays } from 'date-fns';
import { demoProducts } from './demoProducts';

/**
 * Seeded demo dataset — mirrors the Firestore document shapes exactly, so the
 * same components render against either source. Dates are generated relative
 * to "now" so the ageing buckets always show a realistic mix.
 */

const now = new Date();
const iso = (d) => d.toISOString();

const SHOP_SEED = [
  ['SH-001', 'Shwe Myint Optical', 'ရွှေမြင့်မျက်မှန်ဆိုင်', 'Latha', 'U Myint Soe', '09-501-2233', 'VIP', 4_500_000],
  ['SH-002', 'Golden Eye Centre', 'ရွှေမျက်လုံး', 'Latha', 'Daw Khin Mar', '09-502-7781', 'BULK', 3_000_000],
  ['SH-003', 'Aung Vision House', 'အောင်ဗီရှင်', 'Pabedan', 'U Aung Ko', '09-431-9902', 'STANDARD', 1_500_000],
  ['SH-004', 'City Optic Kamayut', 'စီးတီးမျက်မှန်', 'Kamayut', 'Ko Zaw Lin', '09-795-4412', 'BULK', 2_500_000],
  ['SH-005', 'Hninzi Glasses', 'နှင်းဆီမျက်မှန်', 'Kamayut', 'Daw Hnin Si', '09-254-6630', 'STANDARD', 1_200_000],
  ['SH-006', 'Mingala Eyewear', 'မင်္ဂလာမျက်မှန်', 'Mingala Taung Nyunt', 'U Tin Htay', '09-960-1177', 'VIP', 5_000_000],
  ['SH-007', 'Sein Optical Store', 'စိန်မျက်မှန်', 'Mingala Taung Nyunt', 'Ko Myo Min', '09-772-3391', 'STANDARD', 1_000_000],
  ['SH-008', 'Yadanar Optics', 'ရတနာမျက်မှန်', 'Sanchaung', 'Daw Mya Mya', '09-448-2255', 'BULK', 2_000_000],
  ['SH-009', 'Thiri Vision', 'သီရိဗီရှင်', 'Insein', 'U Thiha', '09-425-8890', 'STANDARD', 1_500_000],
  ['SH-010', 'Bo Bo Eye Shop', 'ဘိုဘိုမျက်မှန်', 'Thingangyun', 'Ko Bo Bo', '09-687-1120', 'STANDARD', 800_000],
  ['SH-011', 'Star Light Optical', 'ကြယ်စင်မျက်မှန်', 'Botataung', 'Daw Nwe Nwe', '09-331-4408', 'BULK', 2_200_000],
  ['SH-012', 'Shwe Pyi Optic', 'ရွှေပြည်မျက်မှန်', 'North Okkalapa', 'U Kyaw Swar', '09-940-6612', 'STANDARD', 1_000_000],
  ['SH-013', 'Diamond Eyewear', 'စိန်ရတနာ', 'Tamwe', 'Daw Ei Ei', '09-512-7734', 'VIP', 3_800_000],
  ['SH-014', 'Padonmar Glasses', 'ပဒုမ္မာမျက်မှန်', 'Hlaing', 'Ko Naing Win', '09-260-3345', 'STANDARD', 900_000],
];

export const demoUsers = [
  { id: 'u-admin', name: 'Ma Thida (Owner)', email: 'admin@visionary.mm', role: 'ADMIN', active: true },
  { id: 'u-sales-1', name: 'Ko Zin Min', email: 'zin@visionary.mm', role: 'SALES', active: true, townships: ['Latha', 'Pabedan', 'Lanmadaw'] },
  { id: 'u-sales-2', name: 'Ko Wai Phyo', email: 'wai@visionary.mm', role: 'SALES', active: true, townships: ['Kamayut', 'Sanchaung', 'Hlaing'] },
  { id: 'u-acct', name: 'Daw Sandar', email: 'sandar@visionary.mm', role: 'ACCOUNTANT', active: true },
  { id: 'u-wh', name: 'Ko Htet', email: 'htet@visionary.mm', role: 'WAREHOUSE', active: true },
];

export const demoShops = SHOP_SEED.map(
  ([code, name, nameMM, township, owner, phone, tier, limit], i) => ({
    id: code,
    code,
    name,
    nameMM,
    township,
    ownerName: owner,
    phone,
    viber: phone,
    priceTier: tier,
    creditLimit: limit,
    creditTermDays: 14,
    salesRepId: i % 2 === 0 ? 'u-sales-1' : 'u-sales-2',
    active: true,
    createdAt: iso(subDays(now, 400 - i * 11)),
    // Cached roll-up written by the Cloud Function. The UI never trusts the
    // status field for gating — it re-derives it — but it is handy for queries.
    credit: { status: 'ACTIVE', outstanding: 0, recalcAt: iso(now) },
    stats: { lifetimeSales: 0, voucherCount: 0, avgDaysToPay: 9 + (i % 7) },
  }),
);

/** [shopCode, daysAgo, grandTotal, paidAmount, type] */
const VOUCHER_SEED = [
  ['SH-001', 3, 1_850_000, 0],
  ['SH-001', 12, 1_240_000, 640_000],
  ['SH-002', 19, 880_000, 0],
  ['SH-002', 5, 1_100_000, 0],
  ['SH-003', 1, 420_000, 0],
  ['SH-004', 13, 2_150_000, 0],
  ['SH-004', 27, 760_000, 260_000],
  ['SH-005', 8, 540_000, 540_000],
  ['SH-006', 2, 3_200_000, 1_000_000],
  ['SH-006', 14, 1_480_000, 0],
  ['SH-007', 31, 690_000, 0],
  ['SH-008', 6, 1_320_000, 0],
  ['SH-008', 12, 980_000, 480_000],
  ['SH-009', 22, 1_150_000, 150_000],
  ['SH-010', 9, 380_000, 0],
  ['SH-010', 41, 520_000, 120_000],
  ['SH-011', 4, 1_640_000, 0],
  ['SH-011', 16, 720_000, 720_000],
  ['SH-012', 13, 610_000, 0],
  ['SH-013', 7, 2_480_000, 0],
  ['SH-013', 21, 1_900_000, 1_900_000],
  ['SH-014', 18, 470_000, 0],
  ['SH-003', 34, 350_000, 0],
  // Sold out of the car — these are what the open and closed trips reconcile.
  ['SH-001', 0, 680_000, 680_000],
  ['SH-009', 0, 540_000, 0],
  ['SH-003', 0, 310_000, 100_000],
  ['SH-004', 1, 890_000, 890_000],
  ['SH-008', 1, 460_000, 0],
  ['SH-005', 2, 890_000, 0, 'CONSIGNMENT'],
  ['SH-013', 5, 1_250_000, 0, 'CONSIGNMENT'],
  ['SH-001', 26, 2_050_000, 2_050_000],
  ['SH-002', 33, 1_320_000, 1_320_000],
  ['SH-004', 45, 1_780_000, 1_780_000],
  ['SH-006', 38, 2_640_000, 2_640_000],
  ['SH-008', 29, 1_060_000, 1_060_000],
  ['SH-011', 36, 940_000, 940_000],
  ['SH-012', 44, 720_000, 720_000],
];

const MODELS = ['PB-2026', 'VS-118', 'TR-9045', 'AC-3320', 'KD-771', 'MT-505'];
const COLORS = ['C1 Black', 'C2 Tortoise', 'C3 Gunmetal', 'C4 Rose Gold', 'C5 Navy'];

/** Landed cost of the case and cloth that ship free with every frame. */
const BUNDLE_COST = ['P-CASE-STD', 'P-CLOTH-STD'].reduce(
  (sum, id) => sum + (demoProducts.find((p) => p.id === id)?.costing.actualCost ?? 0),
  0,
);

function demoItems(total, seed) {
  const lineCount = 2 + (seed % 3);
  const per = Math.round(total / lineCount / 1000) * 1000;
  return Array.from({ length: lineCount }, (_, i) => {
    const qty = 6 + ((seed + i * 3) % 18);
    const modelNo = MODELS[(seed + i) % MODELS.length];
    const product = demoProducts.find((p) => p.id === `P-${modelNo}`);
    return {
      productId: `P-${modelNo}`,
      modelNo,
      colorCode: COLORS[(seed + i * 2) % COLORS.length].split(' ')[0],
      colorName: COLORS[(seed + i * 2) % COLORS.length],
      qty,
      unitPrice: Math.max(4_000, Math.round(per / qty / 500) * 500),
      lineTotal: i === lineCount - 1 ? total - per * (lineCount - 1) : per,
      // Cost frozen at sale time — the profit report reads this, never the
      // product's current cost (see domain/profit.js).
      unitCost: product?.costing.actualCost ?? 0,
      bundleUnitCost: BUNDLE_COST,
      bundled: { case: qty, cloth: qty },
    };
  });
}

export const demoVouchers = VOUCHER_SEED.map(([shopId, daysAgo, total, paid, type = 'SALE'], i) => {
  const issueDate = subDays(now, daysAgo);
  const shop = demoShops.find((s) => s.id === shopId);
  const balanceDue = type === 'CONSIGNMENT' ? 0 : total - paid;
  // Recent vouchers from a rep who is out with a bag were written from the car,
  // not the warehouse — that is what ties them to a trip.
  const locationId =
    daysAgo === 0 && shop.salesRepId === 'u-sales-1'
      ? 'LOC-CAR-ZM'
      : daysAgo <= 1 && shop.salesRepId === 'u-sales-2'
        ? 'LOC-CAR-WP'
        : 'LOC-MAIN';
  return {
    id: `V-${String(i + 1).padStart(4, '0')}`,
    voucherNo: `VN-${String(2600 + i).padStart(5, '0')}`,
    shopId,
    shopName: shop.name,
    township: shop.township,
    salesRepId: shop.salesRepId,
    type,
    status:
      type === 'CONSIGNMENT'
        ? 'CONSIGNED'
        : balanceDue === 0
          ? 'PAID'
          : paid > 0
            ? 'PARTIAL'
            : 'ISSUED',
    issueDate: iso(issueDate),
    dueDate: iso(addDays(issueDate, 14)),
    termDays: 14,
    daysAgo,
    locationId,
    items: demoItems(total, i),
    subtotal: total,
    discount: 0,
    grandTotal: total,
    paidAmount: paid,
    balanceDue,
    createdBy: shop.salesRepId,
    createdAt: iso(issueDate),
  };
});

/** Collection speed varies, so the on-time bonus has something to measure. */
const COLLECTION_DAYS = [3, 6, 11, 18, 9, 22, 5, 13];

export const demoPayments = demoVouchers
  .filter((v) => v.paidAmount > 0)
  .map((v, i) => {
    // Money taken at the counter on a car trip is collected the same day —
    // anything later would fall outside the trip and short the reconciliation.
    const sameDay = v.daysAgo <= 1 && v.locationId !== 'LOC-MAIN';
    const daysToPay = sameDay ? 0 : COLLECTION_DAYS[i % COLLECTION_DAYS.length];
    return {
      id: `PM-${String(i + 1).padStart(4, '0')}`,
      receiptNo: `RC-${String(4100 + i).padStart(5, '0')}`,
      shopId: v.shopId,
      amount: v.paidAmount,
      // Deterministic on a trip so the cash/digital split is visible: only the
      // cash half has to be handed over at the end of the day.
      method: sameDay ? (i % 2 === 0 ? 'CASH' : 'KBZ_PAY') : ['CASH', 'KBZ_PAY', 'WAVE_PAY', 'BANK_TRANSFER'][i % 4],
      receivedAt: iso(addDays(new Date(v.issueDate), daysToPay)),
      receivedBy: v.salesRepId,
      allocations: [{ voucherId: v.id, voucherNo: v.voucherNo, amount: v.paidAmount, daysOverdue: Math.max(0, daysToPay - 14) }],
      unappliedAmount: 0,
      // Collected inside the 14-day term — what the rep's bonus is paid on.
      onTime: daysToPay <= 14,
    };
  });

/** Settings document — master password is stored as a hash, never plaintext. */
export const demoSettings = {
  creditTermDays: 14,
  approachingDay: 12,
  graceDays: 0,
  overrideValidMinutes: 30,
  // Demo master password is "0000" — see services/creditService.js for how the
  // real one is verified (Cloud Function + Firestore rules, never client-side).
  masterPasswordHint: '0000',
};
