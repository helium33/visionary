import { describe, expect, it } from 'vitest';
import { isValidEan13 } from './barcode';
import {
  barcodeAllocator,
  buildModelDocuments,
  cleanText,
  colourId,
  inferMaterial,
  modelKey,
  parseAmount,
  parseColours,
  parseCsv,
  parseStockImport,
  planStockImport,
  productLine,
  splitSize,
  tierPricing,
} from './stockImport';

const HEADER =
  '"No","Frame Code","Item Name","Category","C Numbers","Transfer In (From Store)","Transfer Out (To Store)","Total Qty","Sold Qty","Remaining Qty","Price (MMK)"';

const csv = (...rows) => [HEADER, ...rows].join('\r\n');

describe('parseCsv', () => {
  it('reads quoted fields, doubled quotes, embedded commas and line breaks', () => {
    const rows = parseCsv('﻿a,"b, c","say ""hi""","two\nlines"\r\n1,2,3,4\n\n');
    expect(rows).toEqual([
      ['a', 'b, c', 'say "hi"', 'two\nlines'],
      ['1', '2', '3', '4'],
    ]);
  });

  it('keeps a last row that has no trailing newline', () => {
    expect(parseCsv('x,y\n1,2')).toEqual([
      ['x', 'y'],
      ['1', '2'],
    ]);
  });
});

describe('text helpers', () => {
  it('strips zero-width characters and folds full-width punctuation', () => {
    expect(cleanText('Korea  ​ကော်')).toBe('Korea ကော်');
    expect(cleanText('PRADA（HK)')).toBe('PRADA(HK)');
  });

  it('reads amounts with thousands separators and rejects junk', () => {
    expect(parseAmount('230,000')).toBe(230000);
    expect(parseAmount(' 74,999 ')).toBe(74999);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });

  it('pulls the lens size from the code or from a brand typed with it', () => {
    expect(splitSize('9908 S-51', 'TOMHENRY')).toEqual({ modelNo: '9908 S-51', brand: 'TOMHENRY', lens: 51 });
    expect(splitSize('2802', 'UNIQLO S-51')).toEqual({ modelNo: '2802', brand: 'UNIQLO', lens: 51 });
    expect(splitSize('WL 8510', 'UNIQLO S51').lens).toBe(51);
    expect(splitSize('T10083', 'Wassup').lens).toBeNull();
  });

  it('only names a material the file states outright', () => {
    expect(inferMaterial('Soulmate သံ', 'SOULMATE')).toBe('METAL');
    expect(inferMaterial('Soulmate tit', 'SOULMATE')).toBe('TITANIUM');
    expect(inferMaterial('Eyeglasses', 'Hangazz(Tit)')).toBe('TITANIUM');
    expect(inferMaterial('Korea ကော်', 'KOREA (MS)')).toBe('ACETATE');
    expect(inferMaterial('Soulmate ကော် + tit', 'SOULMATE')).toBeNull();
    expect(inferMaterial('Eyeglasses', 'TITANIC')).toBeNull();
  });

  it('keeps a category only when it says more than "eyeglasses"', () => {
    expect(productLine('Eyeglasses')).toBeNull();
    expect(productLine('Setup')).toBeNull();
    expect(productLine('Sunglasses')).toBe('Sunglasses');
    expect(productLine('Soulmate သံ')).toBe('Soulmate သံ');
  });

  it('matches models whatever the spacing, case or punctuation', () => {
    expect(modelKey('Y 9841', 'Gurcaci', null)).toBe(modelKey('Y9841', 'GURCACI', null));
    expect(modelKey('1059', 'Hangazz(Tit)', null)).toBe(modelKey('1059', 'Hangazz Tit', null));
    expect(modelKey('9908 S-51', 'X', 51)).not.toBe(modelKey('9908 S-52', 'X', 52));
  });
});

describe('parseColours', () => {
  it('reads code:qty lists, including names in Burmese and codes with no number', () => {
    const { colours, unreadable } = parseColours('C3:2, C4:0, Cအမဲ:2, C:79, C(GOLD):4');
    expect(colours.map((c) => [c.id, c.qty])).toEqual([
      ['C3', 2],
      ['C4', 0],
      ['Cအမဲ', 2],
      ['C', 79],
      ['C(GOLD)', 4],
    ]);
    expect(unreadable).toEqual([]);
  });

  it('makes slashes safe for a document id but keeps the label as written', () => {
    const { colours } = parseColours('C1/127:4, GR/BK:1');
    expect(colours).toEqual([
      { id: 'C1-127', label: 'C1/127', qty: 4 },
      { id: 'GR-BK', label: 'GR/BK', qty: 1 },
    ]);
    expect(colourId('')).toBe('-');
    expect(colourId('__x__')).toBe('C__x__');
  });

  it('adds a colour listed twice and reports entries it cannot read', () => {
    const { colours, unreadable } = parseColours('C1:3, c1:2, C2, C3:x');
    expect(colours).toEqual([{ id: 'C1', label: 'C1', qty: 5 }]);
    expect(unreadable).toEqual(['C2', 'C3:x']);
  });
});

describe('parseStockImport', () => {
  it('refuses a file without the columns it needs', () => {
    expect(parseStockImport('')).toEqual({ ok: false, error: 'EMPTY' });
    expect(parseStockImport('a,b\n1,2')).toEqual({ ok: false, error: 'COLUMNS' });
  });

  it('merges repeated rows of one model and adds their colours', () => {
    const parsed = parseStockImport(
      csv(
        '"1","23112 S-51","SOULMATE","Soulmate သံ","C6:10","0","0","10","0","10","145,000"',
        '"2","23112 S-51","Soulmate","Soulmate သံ","C1:10, C6:5","0","0","15","0","15","145,000"',
      ),
    );
    expect(parsed.models).toHaveLength(1);
    const [model] = parsed.models;
    expect(model.rows).toEqual([2, 3]);
    expect(model.colours).toEqual([
      { id: 'C6', label: 'C6', qty: 15 },
      { id: 'C1', label: 'C1', qty: 10 },
    ]);
    expect(model.remaining).toBe(25);
    expect(model.material).toBe('METAL');
    expect(model.issues).toEqual([]);
  });

  it('keeps one code under two brands as two models', () => {
    const parsed = parseStockImport(
      csv(
        '"1","78605","Alifo Raldo","Eyeglasses","C3:1","0","0","1","0","1","55,000"',
        '"2","78605","Blessedone S-52","Eyeglasses","C8:3","0","0","3","0","3","55,000"',
      ),
    );
    expect(parsed.models.map((m) => [m.brand, m.lens])).toEqual([
      ['Alifo Raldo', null],
      ['Blessedone', 52],
    ]);
    expect(new Set(parsed.models.map((m) => m.id)).size).toBe(2);
  });

  it('skips set-up rows and flags slips in price and quantity', () => {
    const parsed = parseStockImport(
      csv(
        '"1","YANGONOFFICE-INIT-FRAMES","Initial frames Document","Setup","","0","0","0","0","0","0"',
        '"2","18160 S-53","URBAN HERO","Eyeglasses","C1:1, C3:3","0","21","4","0","4","1"',
        '"3","Y 9841","Guarcaci","Eyeglasses","C5:74994","0","6","74994","0","74994","75,000"',
        '"4","YGNHQ-FRAME-001","HQ Premium Frame Model A","Eyeglasses","","0","0","25","0","25","45,000"',
        '"5","5638","Korea","Eyeglasses","C6:5","0","0","7","0","7","55,000"',
      ),
    );
    expect(parsed.skippedRows).toEqual([{ row: 2, modelNo: 'YANGONOFFICE-INIT-FRAMES', reason: 'EMPTY' }]);
    const codes = Object.fromEntries(parsed.models.map((m) => [m.modelNo, m.issues.map((i) => i.code)]));
    expect(codes).toEqual({
      '18160 S-53': ['BAD_PRICE'],
      'Y 9841': ['HUGE_QTY'],
      'YGNHQ-FRAME-001': ['NO_COLOURS'],
      5638: ['COUNT_MISMATCH'],
    });
    const noColours = parsed.models.find((m) => m.modelNo === 'YGNHQ-FRAME-001');
    expect(noColours.colours).toEqual([{ id: '-', label: '-', qty: 25 }]);
  });
});

describe('planStockImport', () => {
  const parsed = parseStockImport(
    csv(
      '"1","9908 S-51","TOMHENRY","Tom Henry","C1:10, C2:0","0","0","10","0","10","250,000"',
      '"2","18160 S-53","URBAN HERO","Eyeglasses","C1:1, C3:3","0","0","4","0","4","1"',
      '"3","Y 9841","Guarcaci","Eyeglasses","C5:74994","0","0","74994","0","74994","75,000"',
      '"4","YGNHQ-FRAME-001","HQ Premium Frame Model A","Eyeglasses","","0","0","25","0","25","45,000"',
      '"5","90137","Wassup","Eyeglasses","C2:0","0","20","0","0","0","200,000"',
    ),
  );
  const byNo = (list, no) => list.find((m) => m.modelNo === no);

  it('imports clean models, holds back slips and skips sold-out ones', () => {
    const plan = planStockImport(parsed);
    expect(plan.ready.map((m) => m.modelNo)).toEqual(['9908 S-51']);
    expect(byNo(plan.ready, '9908 S-51').colours.map((c) => c.id)).toEqual(['C1']); // C2 has 0
    expect(plan.needsAttention.map((m) => m.modelNo)).toEqual(['18160 S-53', 'Y 9841', 'YGNHQ-FRAME-001']);
    expect(plan.skipped.empty.map((m) => m.modelNo)).toEqual(['90137']);
    expect(plan.totals).toEqual({ models: 1, colours: 1, pieces: 10, listValue: 2500000 });
  });

  it('lets a corrected figure or a yes bring a held-back model in', () => {
    const key = (no) => byNo(parsed.models, no).key;
    const plan = planStockImport(parsed, {
      overrides: {
        [key('18160 S-53')]: { price: '100,000' },
        [key('Y 9841')]: { qty: { C5: '5' } },
        [key('YGNHQ-FRAME-001')]: { include: true },
      },
    });
    expect(plan.ready.map((m) => m.modelNo)).toEqual([
      '9908 S-51',
      '18160 S-53',
      'Y 9841',
      'YGNHQ-FRAME-001',
    ]);
    expect(byNo(plan.ready, '18160 S-53').price).toBe(100000);
    expect(byNo(plan.ready, 'Y 9841').pieces).toBe(5);
    // A fixed model no longer needs attention; the one that needed a yes still shows.
    expect(plan.needsAttention.map((m) => [m.modelNo, m.included])).toEqual([['YGNHQ-FRAME-001', true]]);
  });

  it('never imports a model with an error, even when ticked', () => {
    const key = byNo(parsed.models, '18160 S-53').key;
    const plan = planStockImport(parsed, { overrides: { [key]: { include: true } } });
    expect(byNo(plan.ready, '18160 S-53')).toBeUndefined();
  });

  it('leaves models already in the app alone', () => {
    const existing = byNo(parsed.models, '9908 S-51');
    const byKey = planStockImport(parsed, { existingKeys: new Set([existing.key]) });
    const byId = planStockImport(parsed, { existingIds: new Set([existing.id]) });
    expect(byKey.skipped.existing.map((m) => m.modelNo)).toEqual(['9908 S-51']);
    expect(byId.skipped.existing.map((m) => m.modelNo)).toEqual(['9908 S-51']);
    expect(byKey.ready).toEqual([]);
  });

  it('can include empty colours and sold-out models when asked', () => {
    const plan = planStockImport(parsed, { includeEmpty: true });
    expect(byNo(plan.ready, '9908 S-51').colours.map((c) => c.id)).toEqual(['C1', 'C2']);
    expect(byNo(plan.ready, '90137').pieces).toBe(0);
  });

  it('lets a clean model be unticked', () => {
    const key = byNo(parsed.models, '9908 S-51').key;
    const plan = planStockImport(parsed, { overrides: { [key]: { include: false } } });
    expect(plan.ready).toEqual([]);
    expect(plan.skipped.excluded.map((m) => m.modelNo)).toEqual(['9908 S-51']);
  });
});

describe('documents', () => {
  it('prices every tier from the standing discount table', () => {
    expect(tierPricing(250000)).toEqual({ STANDARD: 250000, BULK: 237500, BULK_PLUS: 230000, VIP: 220000 });
  });

  it('issues valid, unused internal barcodes after the highest one on file', () => {
    const next = barcodeAllocator(['2000000000047', '8851234000014', null]);
    const first = next();
    const second = next();
    expect(first.startsWith('200000000005')).toBe(true);
    expect(second.startsWith('200000000006')).toBe(true);
    expect(isValidEan13(first) && isValidEan13(second)).toBe(true);
    expect(barcodeAllocator([])().startsWith('200000000000')).toBe(true);
  });

  it('builds the product, its colours and the opening stock journal', () => {
    const parsed = parseStockImport(
      csv('"1","C1/127 test","PULANI","Sunglasses","C1/127:4, C2:0","0","0","4","0","4","100,000"'),
    );
    const plan = planStockImport(parsed, { includeEmpty: true });
    const docs = buildModelDocuments(plan.ready[0], {
      locationId: 'LOC-MAIN',
      nextBarcode: barcodeAllocator([]),
      fileName: 'frames.csv',
    });
    expect(docs.id).toBe(plan.ready[0].id);
    expect(docs.product).toMatchObject({
      modelNo: 'C1/127 test',
      brand: 'PULANI',
      category: 'FRAME',
      line: 'Sunglasses',
      pricing: { STANDARD: 100000 },
      costing: { actualCost: null },
      colorCount: 2,
      totalStock: 4,
      active: true,
      source: { type: 'IMPORT', file: 'frames.csv', rows: [2] },
    });
    expect(docs.variants.map((v) => [v.colorCode, v.colorName, v.stock])).toEqual([
      ['C1-127', 'C1/127', { 'LOC-MAIN': 4 }],
      ['C2', '', { 'LOC-MAIN': 0 }],
    ]);
    // Only colours with pieces get a journal entry.
    expect(docs.moves).toEqual([
      expect.objectContaining({ type: 'OPENING', colorCode: 'C1-127', qty: 4, toLocationId: 'LOC-MAIN' }),
    ]);
  });
});
