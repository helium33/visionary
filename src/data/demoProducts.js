import { subDays } from 'date-fns';
import { toEan13 } from '../domain/barcode';

/**
 * Matrix product catalogue — mirrors `products/{id}` + `products/{id}/variants/{colorCode}`
 * exactly (see docs/FIRESTORE_SCHEMA.md §3), flattened here so demo mode can serve it
 * from memory.
 */

const now = new Date();
const iso = (d) => d.toISOString();

const COLOURS = {
  C1: { name: 'Black', hex: '#101010' },
  C2: { name: 'Tortoise', hex: '#7a4a21' },
  C3: { name: 'Gunmetal', hex: '#4d5358' },
  C4: { name: 'Rose Gold', hex: '#b76e79' },
  C5: { name: 'Navy', hex: '#1e2a52' },
  C6: { name: 'Clear', hex: '#d8d8d2' },
};

// [modelNo, brand, material, shape, gender, standardPrice, factoryPrice, colours, stock[], lastSoldDaysAgo]
const FRAME_SEED = [
  ['PB-2026', 'Polar Brite', 'TR90', 'RECTANGLE', 'UNISEX', 18000, 9200, ['C1', 'C2', 'C3', 'C4', 'C5'], [42, 18, 26, 9, 31], 2],
  ['VS-118', 'Vision Star', 'ACETATE', 'ROUND', 'WOMEN', 24000, 12800, ['C1', 'C2', 'C4', 'C6'], [15, 22, 7, 12], 5],
  ['TR-9045', 'TR Line', 'TR90', 'SQUARE', 'MEN', 16500, 8100, ['C1', 'C2', 'C3', 'C5', 'C6'], [58, 34, 41, 19, 6], 1],
  ['AC-3320', 'Acetate Co', 'ACETATE', 'CAT_EYE', 'WOMEN', 28000, 15400, ['C1', 'C2', 'C4'], [11, 14, 8], 9],
  ['KD-771', 'Kiddo', 'TR90', 'ROUND', 'KIDS', 12000, 5600, ['C1', 'C4', 'C5', 'C6'], [37, 25, 29, 16], 3],
  ['MT-505', 'Metro', 'METAL', 'AVIATOR', 'MEN', 21000, 10900, ['C1', 'C3', 'C4'], [24, 17, 4], 7],
  ['TI-880', 'Titan', 'TITANIUM', 'RECTANGLE', 'MEN', 46000, 26500, ['C1', 'C3', 'C5'], [8, 5, 3], 42],
  ['AC-2210', 'Acetate Co', 'ACETATE', 'SQUARE', 'UNISEX', 26000, 14200, ['C1', 'C2', 'C5', 'C6'], [2, 5, 0, 1], 118],
];

/**
 * Tier pricing is stored per product rather than derived at read time: a model
 * can carry a hand-set VIP price that is not a clean percentage off, and the
 * printed voucher must be reproducible years later from the document alone.
 */
function tierPricing(standard) {
  return {
    STANDARD: standard,
    BULK: round100(standard * 0.95),
    BULK_PLUS: round100(standard * 0.92),
    VIP: round100(standard * 0.88),
  };
}

const round100 = (n) => Math.round(n / 100) * 100;

export const demoProducts = [
  ...FRAME_SEED.map(
    ([modelNo, brand, material, shape, gender, price, factory, colours, stock, lastSold]) => ({
      id: `P-${modelNo}`,
      modelNo,
      brand,
      category: 'FRAME',
      material,
      shape,
      gender,
      size: { lens: 50 + (modelNo.length % 5), bridge: 18, temple: 140 },
      pricing: tierPricing(price),
      costing: {
        factoryPrice: factory,
        cargo: Math.round(factory * 0.08),
        transport: 300,
        labeling: 150,
        actualCost: factory + Math.round(factory * 0.08) + 450,
      },
      bundle: { caseProductId: 'P-CASE-STD', clothProductId: 'P-CLOTH-STD' },
      colorCount: colours.length,
      totalStock: stock.reduce((a, b) => a + b, 0),
      lastSoldAt: iso(subDays(now, lastSold)),
      active: true,
      variants: colours.map((code, i) => ({
        id: code,
        colorCode: code,
        colorName: COLOURS[code].name,
        hex: COLOURS[code].hex,
        // 885 = Myanmar's GS1 country prefix, 1234 = company code, then a
        // five-digit item reference. The check digit is computed, never typed.
        barcode: toEan13(
          `8851234${String(FRAME_SEED.findIndex((f) => f[0] === modelNo)).padStart(2, '0')}${String(i).padStart(3, '0')}`,
        ),
        stock: { 'LOC-MAIN': stock[i], 'LOC-CAR-ZM': i === 0 ? 4 : 0, 'LOC-DAMAGED': 0 },
        reserved: 0,
        reorderPoint: 10,
      })),
    }),
  ),
  // Bundled accessories. They are ordinary products with their own stock — a
  // frame sale deducts them automatically, and the warehouse still counts them.
  {
    id: 'P-CASE-STD',
    modelNo: 'CASE-STD',
    brand: 'Visionary',
    category: 'CASE',
    material: 'PU',
    shape: null,
    gender: 'UNISEX',
    pricing: tierPricing(1500),
    costing: { factoryPrice: 600, cargo: 50, transport: 20, labeling: 0, actualCost: 670 },
    bundle: null,
    colorCount: 1,
    totalStock: 412,
    lastSoldAt: iso(subDays(now, 1)),
    active: true,
    variants: [
      {
        id: 'C0',
        colorCode: 'C0',
        colorName: 'Standard',
        hex: '#2a2a28',
        barcode: toEan13('885123499001'),
        stock: { 'LOC-MAIN': 412, 'LOC-CAR-ZM': 20, 'LOC-DAMAGED': 0 },
        reserved: 0,
        reorderPoint: 100,
      },
    ],
  },
  {
    id: 'P-CLOTH-STD',
    modelNo: 'CLOTH-STD',
    brand: 'Visionary',
    category: 'CLOTH',
    material: 'MICROFIBRE',
    shape: null,
    gender: 'UNISEX',
    pricing: tierPricing(400),
    costing: { factoryPrice: 140, cargo: 12, transport: 5, labeling: 0, actualCost: 157 },
    bundle: null,
    colorCount: 1,
    totalStock: 380,
    lastSoldAt: iso(subDays(now, 1)),
    active: true,
    variants: [
      {
        id: 'C0',
        colorCode: 'C0',
        colorName: 'Standard',
        hex: '#5d6b74',
        barcode: toEan13('885123499002'),
        stock: { 'LOC-MAIN': 380, 'LOC-CAR-ZM': 20, 'LOC-DAMAGED': 0 },
        reserved: 0,
        reorderPoint: 100,
      },
    ],
  },
];

export const demoStockLocations = [
  { id: 'LOC-MAIN', code: 'LOC-MAIN', name: 'Main warehouse — Pabedan', type: 'MAIN', active: true },
  { id: 'LOC-CAR-ZM', code: 'LOC-CAR-ZM', name: 'Ko Zin — car stock', type: 'CAR', assignedUserId: 'u-sales-1', active: true },
  { id: 'LOC-CAR-WP', code: 'LOC-CAR-WP', name: 'Ko Wai — car stock', type: 'CAR', assignedUserId: 'u-sales-2', active: true },
  { id: 'LOC-DAMAGED', code: 'LOC-DAMAGED', name: 'Damaged goods', type: 'DAMAGED', active: true },
];
