import { describe, expect, it } from 'vitest';
import { planCatalogueSync, posFrameId } from './webCatalogue';

const product = (id, data) => ({ id, data: { category: 'FRAME', active: true, ...data } });

function plan({ products, variants = {}, frames = [], links = {} }) {
  return planCatalogueSync({
    products,
    variantsByProduct: new Map(Object.entries(variants)),
    frames,
    links: new Map(Object.entries(links)),
    now: 1000,
  });
}

describe('planCatalogueSync', () => {
  it('adds a POS frame without cost, keyed by product id', () => {
    const { writes, report } = plan({
      products: [
        product('P-9908-abc', {
          modelNo: '9908 S-51',
          brand: 'UNIQLO',
          pricing: { STANDARD: 18000 },
          costing: { actualCost: 9000 },
        }),
      ],
      variants: {
        'P-9908-abc': [
          { id: 'C2', colorCode: 'C2', stock: { 'LOC-MAIN': 0 } },
          { id: 'C1', colorCode: 'C1', stock: { 'LOC-MAIN': 4 } },
        ],
      },
    });

    expect(report.added).toEqual(['9908 S-51']);
    const frame = writes.find((w) => w.kind === 'frame');
    expect(frame.id).toBe('pos-p-9908-abc');
    expect(frame.data).toMatchObject({
      source: 'POS',
      posProductId: 'P-9908-abc',
      brand: 'UNIQLO',
      wholesalePrice: 18000,
      stockStatus: 'low-stock',
      published: true,
    });
    expect(frame.data.costing).toBeUndefined();
    expect(frame.data.variants.map((v) => [v.cNumber, v.inStock])).toEqual([
      ['C1', true],
      ['C2', false],
    ]);
    expect(writes).toContainEqual({
      kind: 'link',
      frameId: 'pos-p-9908-abc',
      productId: 'P-9908-abc',
      frameCode: '9908 S-51',
    });
  });

  it('keeps two names that differ only at the end as two frames', () => {
    const { writes } = plan({
      products: [
        product('PA', { modelNo: 'SM-1', brand: 'Soulmate' }),
        product('PB', { modelNo: 'SM-1', brand: 'Soulmate သံ' }),
      ],
    });
    const frames = writes.filter((w) => w.kind === 'frame');
    expect(frames.map((f) => [f.id, f.data.brand])).toEqual([
      [posFrameId('PA'), 'Soulmate'],
      [posFrameId('PB'), 'Soulmate သံ'],
    ]);
  });

  it('keeps photos and wording added on the web app, and is idempotent', () => {
    const products = [product('PX', { modelNo: 'NEW-1', pricing: { STANDARD: 5000 } })];
    const variants = { PX: [{ id: 'C1', colorCode: 'C1', stock: { 'LOC-MAIN': 30 } }] };
    const first = plan({ products, variants }).writes.find((w) => w.kind === 'frame');

    const edited = {
      ...first.data,
      name: 'Yangon Round',
      variants: [{ ...first.data.variants[0], images: ['https://x/1.jpg'] }],
    };
    const frames = [{ id: first.id, data: edited }];
    const links = { [first.id]: 'PX' };

    expect(plan({ products, variants, frames, links }).writes).toEqual([]);

    const repriced = [product('PX', { modelNo: 'NEW-1', pricing: { STANDARD: 5500 } })];
    const { writes, report } = plan({ products: repriced, variants, frames, links });
    expect(report.updated).toEqual(['NEW-1']);
    const next = writes.find((w) => w.kind === 'frame').data;
    expect(next).toMatchObject({ wholesalePrice: 5500, name: 'Yangon Round' });
    expect(next.variants[0].images).toEqual(['https://x/1.jpg']);
  });

  it('only links a frame uploaded on the web app, and skips accessories', () => {
    const { writes, report } = plan({
      products: [
        product('PU', { modelNo: 'UP-200' }),
        product('PC', { modelNo: 'CASE-STD', category: 'CASE' }),
      ],
      frames: [{ id: 'plan-b-up-200', data: { frameCode: 'up 200', brand: 'Plan B' } }],
    });
    expect(report).toEqual({ added: [], updated: [], linked: ['UP-200'], ambiguous: [] });
    expect(writes).toEqual([
      { kind: 'link', frameId: 'plan-b-up-200', productId: 'PU', frameCode: 'UP-200' },
    ]);
  });
});
