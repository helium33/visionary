import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { COL, db, isDemoMode } from '../lib/firebase';
import { addDemoProducts } from '../data/demoProductsStore';
import { barcodeAllocator, buildModelDocuments } from '../domain/stockImport';
import { logAudit } from './auditService';
import { tNow } from '../i18n/translate';

/**
 * ---------------------------------------------------------------------------
 * STOCK IMPORT — writes a reviewed import plan.
 * ---------------------------------------------------------------------------
 * Each model is its product document, one document per colour and one
 * stock-journal entry per colour with pieces, so the opening count is
 * reconstructible from `inventoryMoves` like every later movement.
 *
 * A Firestore batch holds at most 500 writes, so models go in batches of
 * about 400 writes, committed one after another. A model never straddles two
 * batches: if the connection drops half way, every model that was written is
 * whole, and running the import again skips exactly those.
 */
const WRITES_PER_BATCH = 400;

export async function importStock({
  models,
  locationId,
  location,
  fileName,
  existingBarcodes = [],
  actor,
  onProgress,
}) {
  if (!models?.length) return { ok: false, message: tNow('inventory.import.err.nothing') };

  const nextBarcode = barcodeAllocator(existingBarcodes);
  const built = models.map((model) => buildModelDocuments(model, { locationId, nextBarcode, fileName }));
  const pieces = models.reduce((sum, model) => sum + model.pieces, 0);
  const colours = built.reduce((sum, entry) => sum + entry.variants.length, 0);
  const summary = { models: built.length, colours, pieces, locationId, file: fileName ?? null };

  if (isDemoMode) {
    addDemoProducts(
      built.map((entry) => ({
        id: entry.id,
        ...entry.product,
        importedAt: new Date().toISOString(),
        variants: entry.variants.map((variant) => ({ id: variant.colorCode, ...variant })),
      })),
    );
    onProgress?.(built.length, built.length);
    await logAudit({ actor, action: 'STOCK_IMPORT', entity: COL.products, entityId: fileName, after: summary });
    return { ok: true, ...summary };
  }

  const clientAt = new Date().toISOString();
  const byUserId = actor?.uid ?? actor?.id ?? null;
  let written = 0;

  try {
    // The receiving location has to exist for the Inventory screen to list it.
    if (location) {
      const first = writeBatch(db);
      first.set(doc(db, COL.stockLocations, locationId), { ...location, active: true }, { merge: true });
      await first.commit();
    }

    let batch = writeBatch(db);
    let pending = 0;
    let inBatch = 0;

    for (const entry of built) {
      const writes = 1 + entry.variants.length + entry.moves.length;
      if (pending && pending + writes > WRITES_PER_BATCH) {
        await batch.commit();
        written += inBatch;
        onProgress?.(written, built.length);
        batch = writeBatch(db);
        pending = 0;
        inBatch = 0;
      }

      const productRef = doc(db, COL.products, entry.id);
      batch.set(productRef, { ...entry.product, importedAt: serverTimestamp(), importedBy: byUserId });
      for (const variant of entry.variants) {
        batch.set(doc(productRef, COL.variants, variant.colorCode), {
          ...variant,
          lastCountedAt: serverTimestamp(),
        });
      }
      for (const move of entry.moves) {
        batch.set(doc(collection(db, COL.inventoryMoves)), {
          ...move,
          at: serverTimestamp(),
          clientAt,
          byUserId,
        });
      }
      pending += writes;
      inBatch += 1;
    }

    if (pending) {
      await batch.commit();
      written += inBatch;
      onProgress?.(written, built.length);
    }
  } catch (error) {
    console.error('[stockImport] batch failed', error);
    const message =
      error?.code === 'permission-denied' && written === 0
        ? tNow('inventory.import.err.denied')
        : tNow('inventory.import.err.partial', { written, total: built.length });
    return { ok: false, written, message };
  }

  await logAudit({ actor, action: 'STOCK_IMPORT', entity: COL.products, entityId: fileName, after: summary });
  return { ok: true, ...summary };
}
