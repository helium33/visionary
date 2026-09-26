/**
 * The POS's frames, on the Plan B web app's catalogue.
 *
 * The web app's catalogue (`frames`) is public; POS `products` carry landed
 * cost and are staff-only. So an admin's session copies what a buyer may see —
 * model, name, colours, sizes, the standard price, whether it is in stock —
 * into `frames`, never the cost. This file decides *what* to write, as plain
 * data; `services/webCatalogueService.js` reads and writes.
 *
 * It is the same sync as plan-b `src/lib/pos/catalog-sync.ts`, which runs when
 * the owner opens the web app. Running it here too means the catalogue fills
 * the moment the owner opens the POS, which they do every day. The two must
 * write the same shape — change them together.
 *
 *   - A POS frame with no catalogue entry gets one, id `pos-<productId>`,
 *     marked `source: 'POS'`, plus a `posLinks` entry so it can be ordered on
 *     credit.
 *   - An entry the sync made earlier is refreshed (price, colours, stock),
 *     keeping the photos, name and wording added on the web app.
 *   - An entry uploaded on the web app with the same model number is only
 *     linked; its photos and wording are the shop's.
 *   - Accessories (cases, cloths) are not frames and are skipped.
 */

export const POS_SOURCE = 'POS';
const MAIN_LOCATION = 'LOC-MAIN';
const LOW_STOCK_AT = 10;

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const str = (value) => (typeof value === 'string' ? value : '');

export function normalizeModelNo(value) {
  return str(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * From the product id, not brand + model: two products can share a model
 * number (another name, another lens size), and a slug drops Burmese letters,
 * so "Soulmate" and "Soulmate သံ" would collide.
 */
export function posFrameId(productId) {
  return `pos-${String(productId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;
}

function category(gender) {
  switch (String(gender ?? '').toUpperCase()) {
    case 'MEN':
    case 'MALE':
      return 'Male';
    case 'WOMEN':
    case 'FEMALE':
      return 'Female';
    case 'KIDS':
      return 'Kids';
    default:
      return 'Unisex';
  }
}

function material(value, line) {
  const text = `${value ?? ''} ${line ?? ''}`.toUpperCase();
  if (text.includes('COMBO')) return 'Combo';
  if (text.includes('TITAN') || text.includes('TIT')) return 'Titanium';
  if (text.includes('TR90') || text.includes('TR-90')) return 'TR90';
  if (text.includes('ACETATE') || text.includes('ကော်')) return 'Acetate';
  return 'Metal';
}

function shape(value) {
  switch (String(value ?? '').toUpperCase()) {
    case 'ROUND':
      return 'Round';
    case 'SQUARE':
      return 'Square';
    case 'AVIATOR':
      return 'Aviator';
    case 'CAT_EYE':
    case 'CAT-EYE':
      return 'Cat-Eye';
    case 'GEOMETRIC':
      return 'Geometric';
    default:
      return 'Rectangle';
  }
}

function stockStatus(pieces) {
  if (pieces <= 0) return 'pre-order';
  return pieces <= LOW_STOCK_AT ? 'low-stock' : 'in-stock';
}

/** One catalogue entry from one POS product, keeping photos by C-number. */
export function frameFromProduct(product, variants, previous, now = Date.now()) {
  const previousMedia = new Map();
  for (const v of previous?.variants ?? []) {
    previousMedia.set(str(v.cNumber).toUpperCase(), {
      images: Array.isArray(v.images) ? v.images : [],
      videos: Array.isArray(v.videos) ? v.videos : [],
    });
  }

  const colours = variants
    .map((v) => {
      const code = str(v.colorCode) || str(v.id);
      const onHand = num(v.stock?.[MAIN_LOCATION]);
      const media = previousMedia.get(code.toUpperCase());
      return {
        cNumber: code,
        colorName: str(v.colorName) || code,
        swatch: str(v.hex) || '#9ca3af',
        images: media?.images ?? [],
        videos: media?.videos ?? [],
        inStock: onHand > 0,
        onHand,
      };
    })
    .sort((a, b) => a.cNumber.localeCompare(b.cNumber, undefined, { numeric: true }));

  const pieces = colours.reduce((sum, c) => sum + c.onHand, 0);
  const size = product.size ?? {};

  return {
    brand: str(product.brand) || 'Plan B',
    frameCode: str(product.modelNo),
    name: str(previous?.name),
    wholesalePrice: num(product.pricing?.STANDARD),
    category: category(product.gender),
    material: material(product.material, product.line),
    shape: shape(product.shape),
    stockStatus: stockStatus(pieces),
    dimensions: {
      lensWidth: num(size.lens),
      bridge: num(size.bridge),
      templeLength: num(size.temple),
    },
    weightGrams: null,
    variants: colours.map(({ onHand: _onHand, ...colour }) => colour),
    description: str(previous?.description),
    includesCase: Boolean(product.bundle?.caseProductId),
    bestSeller: previous?.bestSeller === true,
    createdAtMs: num(previous?.createdAtMs) || now,
    published: previous ? previous.published !== false : true,
    source: POS_SOURCE,
    posProductId: String(product.id ?? ''),
  };
}

/** Enough of an entry to tell whether a refresh would change anything. */
function signature(frame) {
  return JSON.stringify([
    frame.brand,
    frame.frameCode,
    frame.wholesalePrice,
    frame.stockStatus,
    frame.material,
    frame.shape,
    frame.category,
    frame.includesCase,
    frame.dimensions,
    (frame.variants ?? []).map((v) => [
      v.cNumber,
      v.colorName,
      v.swatch,
      v.inStock,
      v.images?.length ?? 0,
    ]),
  ]);
}

/**
 * What a sync writes.
 *
 * @param {{
 *   products: { id: string, data: object }[],
 *   variantsByProduct: Map<string, object[]>,
 *   frames: { id: string, data: object }[],
 *   links: Map<string, string>,
 *   now?: number,
 * }} input
 * @returns {{ writes: Array<
 *   { kind: 'frame', id: string, data: object } |
 *   { kind: 'link', frameId: string, productId: string, frameCode: string }
 * >, report: { added: string[], updated: string[], linked: string[], ambiguous: string[] } }}
 */
export function planCatalogueSync({ products, variantsByProduct, frames, links, now }) {
  const posMadeByProduct = new Map();
  const uploadedByModel = new Map();
  for (const frame of frames) {
    if (frame.data.source === POS_SOURCE) {
      const productId = str(frame.data.posProductId) || links.get(frame.id) || '';
      if (productId && !posMadeByProduct.has(productId)) posMadeByProduct.set(productId, frame);
      continue;
    }
    const key = normalizeModelNo(frame.data.frameCode);
    if (key) uploadedByModel.set(key, [...(uploadedByModel.get(key) ?? []), frame]);
  }

  const report = { added: [], updated: [], linked: [], ambiguous: [] };
  const writes = [];

  for (const product of products) {
    const data = product.data;
    if (data.active === false) continue;
    const kind = str(data.category).toUpperCase();
    if (kind && kind !== 'FRAME') continue;

    const modelNo = str(data.modelNo);
    const key = normalizeModelNo(modelNo);
    if (!key) continue;

    const link = (frameId) => ({ kind: 'link', frameId, productId: product.id, frameCode: modelNo });

    const posMade = posMadeByProduct.get(product.id) ?? null;
    if (!posMade) {
      const uploaded = uploadedByModel.get(key) ?? [];
      if (uploaded.length > 1) {
        report.ambiguous.push(modelNo);
        continue;
      }
      if (uploaded.length === 1) {
        if (links.get(uploaded[0].id) !== product.id) {
          writes.push(link(uploaded[0].id));
          report.linked.push(modelNo);
        }
        continue;
      }
    }

    const next = frameFromProduct(
      { ...data, id: product.id },
      variantsByProduct.get(product.id) ?? [],
      posMade?.data ?? null,
      now,
    );
    if (posMade && signature(posMade.data) === signature(next)) {
      if (links.get(posMade.id) !== product.id) writes.push(link(posMade.id));
      continue;
    }

    const frameId = posMade?.id ?? posFrameId(product.id);
    writes.push({ kind: 'frame', id: frameId, data: next });
    writes.push(link(frameId));
    (posMade ? report.updated : report.added).push(modelNo);
  }

  return { writes, report };
}
