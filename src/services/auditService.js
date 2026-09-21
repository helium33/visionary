import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { COL, db, isDemoMode } from '../lib/firebase';

/**
 * Append-only audit trail. Firestore rules allow create but never update or
 * delete, so a voucher edit cannot be quietly rewritten later.
 *
 * Writes are fire-and-forget: they queue in the offline cache like any other
 * mutation and land when the device reconnects.
 */
export async function logAudit({ actor, action, entity, entityId, before, after, reason }) {
  const entry = {
    actorId: actor?.uid ?? actor?.id ?? 'unknown',
    actorName: actor?.name ?? actor?.email ?? 'unknown',
    actorRole: actor?.role ?? 'unknown',
    action, // VOUCHER_EDIT | VOUCHER_VOID | CREDIT_OVERRIDE | PAYMENT_RECORD | ...
    entity, // vouchers | shops | payments
    entityId,
    before: before ?? null,
    after: after ?? null,
    reason: reason ?? null,
    at: isDemoMode ? new Date().toISOString() : serverTimestamp(),
    clientAt: new Date().toISOString(), // survives an offline write with no server clock
  };

  if (isDemoMode) {
    console.info('[audit]', entry);
    return { id: `demo-${Date.now()}`, ...entry };
  }
  const ref = await addDoc(collection(db, COL.auditLogs), entry);
  return { id: ref.id, ...entry };
}
