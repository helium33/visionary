import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { COL, db, isDemoMode } from '../lib/firebase';
import { planCatalogueSync } from '../domain/webCatalogue';

/** The Plan B web app's catalogue, and its frame → POS product links. */
const FRAMES = 'frames';
const POS_LINKS = 'posLinks';

/** Firestore's cap is 500 writes per batch; stay well under it. */
const WRITES_PER_BATCH = 400;

/**
 * Copies the POS's frames into the web app's catalogue — see
 * `domain/webCatalogue.js`. Needs an ADMIN session: POS products are staff-
 * only, and the rules let only ADMIN (or the web app's catalogue admins)
 * write `frames`. Needs to be online; it is not worth queueing offline.
 */
export async function syncWebCatalogue() {
  if (isDemoMode) return { added: [], updated: [], linked: [], ambiguous: [] };

  const [productSnap, variantSnap, frameSnap, linkSnap] = await Promise.all([
    getDocs(collection(db, COL.products)),
    getDocs(collectionGroup(db, COL.variants)),
    getDocs(collection(db, FRAMES)),
    getDocs(collection(db, POS_LINKS)),
  ]);

  const variantsByProduct = new Map();
  for (const v of variantSnap.docs) {
    const productId = v.ref.parent.parent?.id;
    if (!productId) continue;
    variantsByProduct.set(productId, [
      ...(variantsByProduct.get(productId) ?? []),
      { id: v.id, ...v.data() },
    ]);
  }

  const { writes, report } = planCatalogueSync({
    products: productSnap.docs.map((p) => ({ id: p.id, data: p.data() })),
    variantsByProduct,
    frames: frameSnap.docs.map((f) => ({ id: f.id, data: f.data() })),
    links: new Map(linkSnap.docs.map((l) => [l.id, String(l.get('productId') ?? '')])),
  });

  for (let i = 0; i < writes.length; i += WRITES_PER_BATCH) {
    const batch = writeBatch(db);
    for (const write of writes.slice(i, i + WRITES_PER_BATCH)) {
      if (write.kind === 'frame') {
        batch.set(doc(db, FRAMES, write.id), { ...write.data, updatedAt: serverTimestamp() });
      } else {
        batch.set(doc(db, POS_LINKS, write.frameId), {
          productId: write.productId,
          frameCode: write.frameCode,
          linkedAt: serverTimestamp(),
        });
      }
    }
    await batch.commit();
  }

  return report;
}
