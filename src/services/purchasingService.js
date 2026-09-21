import { addDoc, collection, doc, increment, serverTimestamp, writeBatch } from 'firebase/firestore';
import { COL, db, isDemoMode } from '../lib/firebase';
import { computeLandedCost, receiptPlan } from '../domain/landedCost';
import { logAudit } from './auditService';

/**
 * ---------------------------------------------------------------------------
 * PURCHASING — and the moment a shipment becomes real cost.
 * ---------------------------------------------------------------------------
 * Receiving a purchase order is the single point where estimated cost becomes
 * actual cost. It does three things at once, in one batch:
 *
 *   1. Stock goes up at the receiving location, colour by colour.
 *   2. Each product's `costing.actualCost` is restated to the landed figure —
 *      factory price plus its share of cargo, transport, labeling and customs.
 *   3. The stock journal records where every piece came from.
 *
 * Step 2 is why the profit dashboard is real rather than a guess: every margin,
 * every stock valuation and every dead-stock capital figure in the system reads
 * that one field.
 */
export async function createPurchaseOrder({ po, actor }) {
  const document = {
    ...po,
    status: po.status ?? 'DRAFT',
    totals: summaryOf(po),
    createdBy: actor?.uid ?? actor?.id ?? null,
    createdAt: isDemoMode ? new Date().toISOString() : serverTimestamp(),
    clientAt: new Date().toISOString(),
  };

  if (isDemoMode) {
    await logAudit({ actor, action: 'PO_CREATE', entity: COL.purchaseOrders, entityId: po.poNo, after: document });
    return { ok: true, po: { id: po.poNo, ...document } };
  }

  const ref = await addDoc(collection(db, COL.purchaseOrders), document);
  await logAudit({ actor, action: 'PO_CREATE', entity: COL.purchaseOrders, entityId: ref.id, after: document });
  return { ok: true, po: { id: ref.id, ...document } };
}

/**
 * Receive a shipment. `lines[].receivedQty` carries what actually turned up —
 * shipments arrive short often enough that assuming otherwise would overstate
 * stock every time it happens.
 */
export async function receivePurchaseOrder({ po, locationId = 'LOC-MAIN', actor }) {
  const plan = receiptPlan(po, { locationId });

  if (!plan.movements.length) {
    return { ok: false, message: 'Nothing to receive — every line shows zero received.' };
  }

  if (isDemoMode) {
    await logAudit({
      actor,
      action: 'PO_RECEIVE',
      entity: COL.purchaseOrders,
      entityId: po.id,
      after: { movements: plan.movements.length, costUpdates: plan.costUpdates },
    });
    return { ok: true, plan };
  }

  const batch = writeBatch(db);
  const receivedAt = new Date();

  for (const move of plan.movements) {
    batch.update(doc(db, COL.products, move.productId, COL.variants, move.colorCode), {
      [`stock.${locationId}`]: increment(move.qty),
    });

    batch.set(doc(collection(db, COL.inventoryMoves)), {
      at: serverTimestamp(),
      clientAt: receivedAt.toISOString(),
      type: 'PO_RECEIPT',
      productId: move.productId,
      modelNo: move.modelNo,
      colorCode: move.colorCode,
      qty: move.qty,
      unitCost: move.landedUnitCost,
      fromLocationId: null,
      toLocationId: locationId,
      refType: 'PO',
      refId: po.id,
      refNo: po.poNo,
      byUserId: actor?.uid ?? actor?.id ?? null,
    });
  }

  // Restate actual cost. This is the write the whole profit side depends on.
  for (const update of plan.costUpdates) {
    batch.update(doc(db, COL.products, update.productId), {
      'costing.actualCost': update.actualCost,
      'costing.lastPoId': po.id,
      'costing.lastPoNo': po.poNo,
      'costing.updatedAt': serverTimestamp(),
    });
  }

  batch.update(doc(db, COL.purchaseOrders, po.id), {
    status: 'RECEIVED',
    receivedAt: serverTimestamp(),
    receivedBy: actor?.uid ?? actor?.id ?? null,
    totals: summaryOf(po),
    shortfalls: plan.shortfalls,
  });

  await batch.commit();
  await logAudit({
    actor,
    action: 'PO_RECEIVE',
    entity: COL.purchaseOrders,
    entityId: po.id,
    after: { movements: plan.movements.length, costUpdates: plan.costUpdates, shortfalls: plan.shortfalls },
  });

  return { ok: true, plan };
}

export async function recordExpense({ expense, actor }) {
  const document = {
    ...expense,
    amount: Math.round(Number(expense.amount) || 0),
    paidBy: actor?.uid ?? actor?.id ?? null,
    createdAt: isDemoMode ? new Date().toISOString() : serverTimestamp(),
    clientAt: new Date().toISOString(),
  };

  if (document.amount <= 0) {
    return { ok: false, message: 'Enter an amount greater than zero.' };
  }

  if (isDemoMode) {
    await logAudit({ actor, action: 'EXPENSE_RECORD', entity: COL.expenses, entityId: 'demo', after: document });
    return { ok: true, expense: { id: `EXP-${Date.now()}`, ...document } };
  }

  const ref = await addDoc(collection(db, COL.expenses), document);
  await logAudit({ actor, action: 'EXPENSE_RECORD', entity: COL.expenses, entityId: ref.id, after: document });
  return { ok: true, expense: { id: ref.id, ...document } };
}

function summaryOf(po) {
  const costed = computeLandedCost(po);
  return {
    qty: costed.totalQty,
    factory: costed.totalFactoryMMK,
    charges: costed.totalCharges,
    landed: costed.totalLanded,
    averageUnitCost: costed.averageUnitCost,
  };
}
