import { addDays, subDays } from 'date-fns';
import { demoProducts } from './demoProducts';

const now = new Date();
const iso = (d) => d.toISOString();

export const demoSuppliers = [
  { id: 'SUP-WZ', name: 'Wenzhou Ruiyi Optical', country: 'CN', currency: 'CNY', contact: 'Ms. Chen · WeChat ruiyi_optical' },
  { id: 'SUP-SZ', name: 'Shenzhen Clearview Frames', country: 'CN', currency: 'CNY', contact: 'Mr. Liu · +86 755 8823 1140' },
  { id: 'SUP-BKK', name: 'Bangkok Optic Supply', country: 'TH', currency: 'THB', contact: 'Khun Nok · +66 2 231 7788' },
];

const frames = demoProducts.filter((p) => p.category === 'FRAME');

/** Builds PO lines from the real catalogue so costs write back to real products. */
function linesFor(modelNos, { qtyBase = 60, receivedShort = null } = {}) {
  return modelNos.flatMap((modelNo, modelIndex) => {
    const product = frames.find((p) => p.modelNo === modelNo);
    if (!product) return [];
    return product.variants.slice(0, 3).map((variant, colourIndex) => {
      const qty = qtyBase - colourIndex * 10 + modelIndex * 5;
      const line = {
        productId: product.id,
        modelNo: product.modelNo,
        colorCode: variant.colorCode,
        colorName: variant.colorName,
        qty,
        // Factory prices are quoted in the supplier's currency.
        factoryUnitPrice: Math.round((product.costing.factoryPrice / 62.5) * 100) / 100,
      };
      if (receivedShort && receivedShort.modelNo === modelNo && receivedShort.colorCode === variant.colorCode) {
        line.receivedQty = qty - receivedShort.short;
      }
      return line;
    });
  });
}

export const demoPurchaseOrders = [
  {
    id: 'PO-2026-011',
    poNo: 'PO-2026-011',
    supplierId: 'SUP-WZ',
    supplierName: 'Wenzhou Ruiyi Optical',
    currency: 'CNY',
    fxRate: 61.8,
    status: 'RECEIVED',
    allocationBasis: 'BY_VALUE',
    orderedAt: iso(subDays(now, 96)),
    expectedAt: iso(subDays(now, 66)),
    receivedAt: iso(subDays(now, 62)),
    lines: linesFor(['PB-2026', 'TR-9045'], { qtyBase: 80 }),
    charges: { cargo: 1_120_000, transport: 180_000, labeling: 96_000, customs: 340_000 },
    note: 'Sea freight, Yangon port.',
  },
  {
    id: 'PO-2026-012',
    poNo: 'PO-2026-012',
    supplierId: 'SUP-SZ',
    supplierName: 'Shenzhen Clearview Frames',
    currency: 'CNY',
    fxRate: 62.4,
    status: 'RECEIVED',
    allocationBasis: 'BY_QTY',
    orderedAt: iso(subDays(now, 58)),
    expectedAt: iso(subDays(now, 30)),
    receivedAt: iso(subDays(now, 27)),
    lines: linesFor(['VS-118', 'AC-3320'], { qtyBase: 50 }),
    charges: { cargo: 640_000, transport: 120_000, labeling: 54_000, customs: 210_000 },
    note: 'Air freight — rush order for the festival season.',
  },
  {
    id: 'PO-2026-013',
    poNo: 'PO-2026-013',
    supplierId: 'SUP-WZ',
    supplierName: 'Wenzhou Ruiyi Optical',
    currency: 'CNY',
    fxRate: 62.5,
    status: 'IN_TRANSIT',
    allocationBasis: 'BY_VALUE',
    orderedAt: iso(subDays(now, 24)),
    expectedAt: iso(addDays(now, 6)),
    receivedAt: null,
    lines: linesFor(['KD-771', 'MT-505'], { qtyBase: 70 }),
    charges: { cargo: 890_000, transport: 150_000, labeling: 72_000, customs: 280_000 },
    note: 'Vessel departed Ningbo 12 Sep.',
  },
  {
    id: 'PO-2026-014',
    poNo: 'PO-2026-014',
    supplierId: 'SUP-BKK',
    supplierName: 'Bangkok Optic Supply',
    currency: 'THB',
    fxRate: 58.2,
    status: 'ORDERED',
    allocationBasis: 'BY_VALUE',
    orderedAt: iso(subDays(now, 9)),
    expectedAt: iso(addDays(now, 21)),
    receivedAt: null,
    lines: linesFor(['TI-880', 'AC-2210'], { qtyBase: 40 }),
    charges: { cargo: 420_000, transport: 85_000, labeling: 60_000, customs: 0 },
    note: 'Deposit 30% paid.',
  },
  {
    id: 'PO-2026-015',
    poNo: 'PO-2026-015',
    supplierId: 'SUP-SZ',
    supplierName: 'Shenzhen Clearview Frames',
    currency: 'CNY',
    fxRate: 62.5,
    status: 'DRAFT',
    allocationBasis: 'BY_VALUE',
    orderedAt: null,
    expectedAt: null,
    receivedAt: null,
    lines: linesFor(['PB-2026'], { qtyBase: 90 }),
    charges: { cargo: 0, transport: 0, labeling: 0, customs: 0 },
    note: 'Quotation pending.',
  },
];

/** General expenses — the second half of the net-profit calculation. */
const EXPENSE_SEED = [
  ['SALARY', 'Staff salaries — 5 people', 2_850_000, 4],
  ['SALARY', 'Sales rep commissions', 640_000, 6],
  ['RENT', 'Shop & warehouse rent, 29th Street', 1_200_000, 5],
  ['OFFICE', 'Electricity, water, internet', 185_000, 7],
  ['TRANSPORT', 'Delivery fuel & vehicle maintenance', 320_000, 11],
  ['FEES', 'Bank charges & mobile money fees', 96_000, 14],
  ['SALARY', 'Staff salaries — 5 people', 2_850_000, 34],
  ['RENT', 'Shop & warehouse rent, 29th Street', 1_200_000, 35],
  ['OFFICE', 'Electricity, water, internet', 172_000, 37],
  ['TRANSPORT', 'Delivery fuel', 295_000, 40],
  ['FEES', 'Bank charges & mobile money fees', 88_000, 44],
  ['OTHER', 'Barcode label rolls & printer ribbon', 145_000, 48],
  ['SALARY', 'Staff salaries — 5 people', 2_780_000, 64],
  ['RENT', 'Shop & warehouse rent, 29th Street', 1_200_000, 65],
  ['OFFICE', 'Electricity, water, internet', 168_000, 67],
  ['FEES', 'Bank charges & mobile money fees', 91_000, 74],
];

export const demoExpenses = EXPENSE_SEED.map(([category, description, amount, daysAgo], i) => ({
  id: `EXP-${String(i + 1).padStart(4, '0')}`,
  date: iso(subDays(now, daysAgo)),
  category,
  description,
  amount,
  paidBy: 'u-acct',
}));
