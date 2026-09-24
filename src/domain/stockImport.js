import { toEan13 } from './barcode';
import { PRICE_TIERS } from '../lib/constants';

/**
 * ---------------------------------------------------------------------------
 * STOCK IMPORT — opening stock from another system's CSV export.
 * ---------------------------------------------------------------------------
 * The office's frames already live in a spreadsheet: one row per model, its
 * colours packed into one cell ("C1:3, C2:9, C6:4"), a single list price. This
 * module turns that into the app's matrix — `products/{id}` plus one
 * `variants/{colorCode}` per colour — without inventing anything the file does
 * not say.
 *
 * Exports like this are hand-kept, so the parser is suspicious by design:
 *
 *   • The same model can appear on several rows (a second delivery typed in
 *     later). Rows are merged and their colours added together.
 *   • A price of "1" or a colour with 74,994 pieces is a typing slip, not a
 *     fact. Such a model is held back until someone types the right figure —
 *     importing it would put a K1 frame on the next voucher.
 *   • A model already in the app is left alone, so importing the same file
 *     twice cannot double the stock.
 *
 * Everything here is pure; `services/stockImportService.js` does the writing.
 */

export const IMPORT_LIMITS = {
  /** Below this a "price" is a slip (the file has 1, 2, 4 and 5 kyat frames). */
  minPrice: 1000,
  /** Above this a colour count is a slip (the file has one of 74,994). */
  maxColourQty: 1000,
};

/** Internal-use barcodes: GS1 prefix 20–29 is reserved for in-store numbering. */
export const IMPORT_BARCODE_PREFIX = '20';

const COLUMN_ALIASES = {
  modelNo: ['frame code', 'model no', 'model number', 'model', 'code'],
  brand: ['item name', 'brand', 'name'],
  category: ['category', 'type'],
  colours: ['c numbers', 'colours', 'colors', 'colour', 'color'],
  remaining: ['remaining qty', 'remaining', 'quantity', 'qty', 'stock'],
  price: ['price mmk', 'price', 'selling price', 'list price'],
  cost: ['cost mmk', 'cost', 'unit cost', 'cost price'],
};

/** Category cells that say nothing beyond "it is a frame". */
const PLAIN_LINES = new Set(['eyeglasses', 'eyeglass', 'frame', 'frames', 'brand', 'setup', '']);

// ---------------------------------------------------------------- text

const INVISIBLE = /[​-‍⁠﻿]/g;

/**
 * Tidies a cell for display: zero-width characters out (the export has them
 * inside "Korea ​ကော်"), full-width punctuation folded ("（HK)"), runs of
 * spaces collapsed.
 */
export function cleanText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The same text reduced for comparison: case, spaces and punctuation ignored. */
export function matchKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '');
}

/** "230,000" → 230000; anything unreadable → null. */
export function parseAmount(value) {
  const digits = cleanText(value).replace(/[,\s]/g, '').replace(/^K/i, '');
  if (!digits) return null;
  const number = Number(digits);
  return Number.isFinite(number) ? Math.round(number) : null;
}

// ---------------------------------------------------------------- CSV

/**
 * RFC 4180 CSV: quoted fields, doubled quotes inside them, commas and line
 * breaks inside quotes, CRLF or LF, an optional byte-order mark. Returns rows
 * of raw strings; blank lines are dropped.
 */
export function parseCsv(text) {
  const source = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function headerKey(header) {
  return cleanText(header).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Which column holds what, by header name. Missing optional columns map to -1. */
export function mapColumns(headers = []) {
  const keys = headers.map(headerKey);
  const columns = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    columns[field] = -1;
    for (const alias of aliases) {
      const index = keys.indexOf(alias);
      if (index >= 0) {
        columns[field] = index;
        break;
      }
    }
  }
  return columns;
}

// ---------------------------------------------------------------- colours

/**
 * A Firestore-safe document id for a colour: ids cannot contain "/", and the
 * export has "C1/127" and "GR/BK". The label as written is kept separately.
 */
export function colourId(label) {
  const id = cleanText(label).replace(/\//g, '-').slice(0, 60);
  if (!id || id === '.' || id === '..') return '-';
  return /^__.*__$/.test(id) ? `C${id}` : id;
}

/**
 * "C3:2, C4:0, C5:5" → [{ id, label, qty }]. The colour name is everything
 * before the last colon, so "C(GOLD):4" and "Cအမဲ:2" read as written; an entry
 * with no colour at all (":3", "C:79") still counts.
 */
export function parseColours(text) {
  const colours = [];
  const unreadable = [];
  const seen = new Map();

  for (const part of cleanText(text).split(',')) {
    const entry = part.trim();
    if (!entry) continue;
    const colon = entry.lastIndexOf(':');
    const qty = colon >= 0 ? parseAmount(entry.slice(colon + 1)) : null;
    if (colon < 0 || qty == null || qty < 0) {
      unreadable.push(entry);
      continue;
    }
    const label = cleanText(entry.slice(0, colon)) || '-';
    const id = colourId(label);
    const key = id.toUpperCase();
    if (seen.has(key)) {
      seen.get(key).qty += qty;
    } else {
      const colour = { id, label, qty };
      seen.set(key, colour);
      colours.push(colour);
    }
  }
  return { colours, unreadable };
}

// ---------------------------------------------------------------- models

const SIZE_IN_TEXT = /\bS\s*-?\s*(\d{2})\b/i;
const SIZE_AT_END = /\s+S\s*-?\s*(\d{2})$/i;

/** Lens width from "9908 S-51", or from a brand typed as "UNIQLO S-51". */
export function splitSize(modelNo, brand) {
  const code = cleanText(modelNo);
  let name = cleanText(brand);
  let lens = Number(code.match(SIZE_IN_TEXT)?.[1]) || null;
  const inBrand = name.match(SIZE_AT_END);
  if (inBrand) {
    name = name.replace(SIZE_AT_END, '').trim();
    lens ??= Number(inBrand[1]);
  }
  return { modelNo: code, brand: name, lens };
}

/**
 * Material, only where the file says it outright: "tit" is titanium, သံ is
 * metal, ကော် is plastic. "ကော် + tit" names two materials, so it is left to
 * the product line text rather than guessed.
 */
export function inferMaterial(...texts) {
  const text = texts.map((value) => cleanText(value).toLowerCase()).join(' ');
  const titanium = /(^|[^a-z])(tit|titanium)([^a-z]|$)/.test(text);
  const metal = text.includes('သံ');
  const plastic = text.includes('ကော်');
  const found = [titanium && 'TITANIUM', metal && 'METAL', plastic && 'ACETATE'].filter(Boolean);
  return found.length === 1 ? found[0] : null;
}

/** The old system's category when it says more than "eyeglasses". */
export function productLine(category) {
  const line = cleanText(category);
  return PLAIN_LINES.has(line.toLowerCase()) ? null : line;
}

/** Two rows are the same model when code, brand and lens size all match. */
export function modelKey(modelNo, brand, lens) {
  return `${matchKey(modelNo)}|${matchKey(brand)}|${lens ?? ''}`;
}

/** Stable 32-bit FNV-1a, base 36 — the same model always gets the same id. */
function shortHash(text) {
  let hash = 0x811c9dc5;
  for (const ch of text) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, '0');
}

export function importedProductId(key, modelNo) {
  const slug = cleanText(modelNo)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `P-${slug || 'MODEL'}-${shortHash(key)}`;
}

function finaliseIssues(model) {
  const issues = [];
  if (model.unreadable.length) {
    issues.push({ code: 'UNREADABLE', severity: 'error', entries: model.unreadable });
  }
  if (model.price == null || model.price < IMPORT_LIMITS.minPrice) {
    issues.push({ code: 'BAD_PRICE', severity: 'error', price: model.price });
  }
  const huge = model.colours.filter((colour) => colour.qty > IMPORT_LIMITS.maxColourQty);
  if (huge.length) {
    issues.push({ code: 'HUGE_QTY', severity: 'error', colours: huge.map((c) => c.id) });
  }
  if (model.noBreakdown) {
    issues.push({ code: 'NO_COLOURS', severity: 'review', qty: model.remaining });
  }
  if (model.prices.length > 1) {
    issues.push({ code: 'PRICE_CONFLICT', severity: 'warning', prices: model.prices });
  }
  const counted = model.colours.reduce((sum, colour) => sum + colour.qty, 0);
  if (!model.noBreakdown && model.remaining != null && counted !== model.remaining) {
    issues.push({ code: 'COUNT_MISMATCH', severity: 'warning', counted, remaining: model.remaining });
  }
  return issues;
}

/**
 * Reads the whole export. Returns `{ ok: false, error }` when the file is not
 * a stock list at all; otherwise every model found, merged, with its issues.
 */
export function parseStockImport(text) {
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false, error: 'EMPTY' };

  const columns = mapColumns(table[0]);
  if (columns.modelNo < 0 || columns.colours < 0) {
    return { ok: false, error: 'COLUMNS' };
  }

  const byKey = new Map();
  const skippedRows = [];
  const cell = (cells, field) => (columns[field] >= 0 ? cells[columns[field]] ?? '' : '');

  table.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2; // spreadsheet numbering: header is row 1
    const { modelNo, brand, lens } = splitSize(cell(cells, 'modelNo'), cell(cells, 'brand'));
    const { colours, unreadable } = parseColours(cell(cells, 'colours'));
    const remaining = columns.remaining >= 0 ? parseAmount(cell(cells, 'remaining')) : null;

    if (!modelNo || (!colours.length && !unreadable.length && !remaining)) {
      skippedRows.push({ row: rowNumber, modelNo, reason: 'EMPTY' });
      return;
    }

    const key = modelKey(modelNo, brand, lens);
    const price = parseAmount(cell(cells, 'price'));
    const cost = parseAmount(cell(cells, 'cost'));
    const category = cell(cells, 'category');

    let model = byKey.get(key);
    if (!model) {
      model = {
        key,
        id: importedProductId(key, modelNo),
        modelNo,
        brand,
        lens,
        line: productLine(category),
        material: inferMaterial(category, brand),
        price,
        prices: [],
        cost,
        colours: [],
        unreadable: [],
        remaining: null,
        noBreakdown: false,
        rows: [],
      };
      byKey.set(key, model);
    }

    model.rows.push(rowNumber);
    if (price != null && !model.prices.includes(price)) model.prices.push(price);
    if (model.price == null || model.price < IMPORT_LIMITS.minPrice) model.price = price ?? model.price;
    if (model.cost == null) model.cost = cost;
    model.unreadable.push(...unreadable);
    if (remaining != null) model.remaining = (model.remaining ?? 0) + remaining;

    if (!colours.length && !unreadable.length && remaining) {
      // A count with no colour breakdown: one unnamed colour carries it.
      colours.push({ id: '-', label: '-', qty: remaining });
      model.noBreakdown = true;
    }
    for (const colour of colours) {
      const existing = model.colours.find((c) => c.id.toUpperCase() === colour.id.toUpperCase());
      if (existing) existing.qty += colour.qty;
      else model.colours.push({ ...colour });
    }
  });

  const models = [...byKey.values()].map((model) => ({ ...model, issues: finaliseIssues(model) }));
  return { ok: true, models, skippedRows, rowCount: table.length - 1, hasCost: columns.cost >= 0 };
}

// ---------------------------------------------------------------- plan

/**
 * Applies the user's review to the parsed file and decides what gets written.
 *
 * @param {object} parsed     parseStockImport() result
 * @param {object} options
 *   existingKeys     Set of modelKey() for products already in the app
 *   existingIds      Set of product ids already in the app
 *   includeEmpty     also add colours and models with 0 pieces
 *   overrides        { [modelKey]: { include?, price?, qty?: { [colourId]: n } } }
 */
export function planStockImport(parsed, options = {}) {
  const {
    existingKeys = new Set(),
    existingIds = new Set(),
    includeEmpty = false,
    overrides = {},
  } = options;

  const ready = [];
  const needsAttention = [];
  const skipped = { existing: [], empty: [], excluded: [] };

  for (const model of parsed?.models ?? []) {
    if (existingKeys.has(model.key) || existingIds.has(model.id)) {
      skipped.existing.push(model);
      continue;
    }

    const override = overrides[model.key] ?? {};
    const price = override.price != null ? parseAmount(override.price) : model.price;
    const colours = model.colours.map((colour) => ({
      ...colour,
      qty:
        override.qty?.[colour.id] != null
          ? Math.max(0, parseAmount(override.qty[colour.id]) ?? 0)
          : colour.qty,
    }));
    const edited = { ...model, price, colours };
    const issues = finaliseIssues({
      ...edited,
      prices: override.price != null ? [] : model.prices,
      remaining: override.qty ? null : model.remaining,
    });
    const errors = issues.filter((issue) => issue.severity === 'error');
    const review = issues.filter((issue) => issue.severity === 'review');

    const kept = includeEmpty ? colours : colours.filter((colour) => colour.qty > 0);
    const pieces = kept.reduce((sum, colour) => sum + colour.qty, 0);
    if (!kept.length || (!includeEmpty && pieces === 0)) {
      skipped.empty.push(edited);
      continue;
    }

    // An error has to be fixed before the model can go in; a review item only
    // needs a yes; a clean model goes in unless someone unticks it.
    const included = errors.length
      ? false
      : review.length
        ? override.include === true
        : override.include !== false;
    const entry = { ...edited, colours: kept, pieces, issues, errors, review, included };

    if (errors.length || review.length) needsAttention.push(entry);
    if (included) ready.push(entry);
    else if (!errors.length && !review.length) skipped.excluded.push(entry);
  }

  const totals = ready.reduce(
    (sum, model) => ({
      models: sum.models + 1,
      colours: sum.colours + model.colours.length,
      pieces: sum.pieces + model.pieces,
      listValue: sum.listValue + model.pieces * (model.price ?? 0),
    }),
    { models: 0, colours: 0, pieces: 0, listValue: 0 },
  );

  return { ready, needsAttention, skipped, totals };
}

// ---------------------------------------------------------------- documents

/** Tier prices follow the app's standing discount table. */
export function tierPricing(standard) {
  const round100 = (n) => Math.round(n / 100) * 100;
  return Object.fromEntries(
    Object.values(PRICE_TIERS).map(({ key, discountPct }) => [
      key,
      key === 'STANDARD' ? standard : round100(standard * (1 - discountPct / 100)),
    ]),
  );
}

/**
 * Hands out internal barcodes after the highest one already issued, so a
 * second import never reuses a number printed on a label in the drawer.
 */
export function barcodeAllocator(existingBarcodes = []) {
  let next = 0;
  for (const barcode of existingBarcodes) {
    const code = String(barcode ?? '');
    if (code.length === 13 && code.startsWith(IMPORT_BARCODE_PREFIX)) {
      next = Math.max(next, Number(code.slice(2, 12)) + 1);
    }
  }
  return () => {
    const code = toEan13(`${IMPORT_BARCODE_PREFIX}${String(next).padStart(10, '0')}`);
    next += 1;
    return code;
  };
}

/**
 * The documents for one model: the product, its variants, and the opening
 * stock-journal entries. Timestamps are left to the service.
 */
export function buildModelDocuments(model, { locationId, nextBarcode, fileName }) {
  const cost = model.cost != null && model.cost > 0 ? model.cost : null;
  const product = {
    modelNo: model.modelNo,
    brand: model.brand || null,
    category: 'FRAME',
    line: model.line,
    material: model.material,
    shape: null,
    gender: null,
    size: model.lens ? { lens: model.lens } : null,
    pricing: tierPricing(model.price),
    // The export carries no cost. Left empty rather than guessed: receiving a
    // purchase order restates it, and until then stock value reads as unknown.
    costing: cost ? { factoryPrice: cost, actualCost: cost } : { actualCost: null },
    bundle: null,
    colorCount: model.colours.length,
    totalStock: model.pieces,
    lastSoldAt: null,
    active: true,
    source: { type: 'IMPORT', file: fileName ?? null, rows: model.rows },
  };

  const variants = model.colours.map((colour) => ({
    colorCode: colour.id,
    colorName: colour.label !== colour.id ? colour.label : '',
    hex: null,
    barcode: nextBarcode(),
    stock: { [locationId]: colour.qty },
    reserved: 0,
    reorderPoint: 0,
  }));

  const moves = model.colours
    .filter((colour) => colour.qty > 0)
    .map((colour) => ({
      type: 'OPENING',
      productId: model.id,
      modelNo: model.modelNo,
      colorCode: colour.id,
      qty: colour.qty,
      unitCost: cost,
      fromLocationId: null,
      toLocationId: locationId,
      refType: 'IMPORT',
      refId: null,
      refNo: fileName ?? null,
    }));

  return { id: model.id, product, variants, moves };
}
