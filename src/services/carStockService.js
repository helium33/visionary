import {
  addDoc,
  collection,
  doc,
  increment,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { COL, db, isDemoMode } from '../lib/firebase';
import { settlementPlan } from '../domain/carStock';
import { logAudit } from './auditService';

const TRIPS = 'carTrips';

/**
 * ---------------------------------------------------------------------------
 * CAR STOCK — loading a bag, and settling it when the rep comes back.
 * ---------------------------------------------------------------------------
 * Both operations are single batches, for the same reason as every other write
 * in this system: a rep loads the car at 7am in the warehouse yard and settles
 * it at 7pm on a street with no signal. A transfer that applied to one location
 * and not the other would leave stock that exists in two places or in none.
 */

export async function openTrip({ rep, locationId, route = [], openingLines = [], actor }) {
  const trip = {
    tripNo: buildTripNo(rep),
    repId: rep.uid ?? rep.id,
    repName: rep.name,
    locationId,
    status: 'OPEN',
    route,
    openingLines,
    loadLines: [],
    countedLines: [],
    cash: {},
    openedAt: isDemoMode ? new Date().toISOString() : serverTimestamp(),
    clientAt: new Date().toISOString(),
    openedBy: actor?.uid ?? actor?.id ?? null,
  };

  if (isDemoMode) {
    await logAudit({ actor, action: 'TRIP_OPEN', entity: TRIPS, entityId: trip.tripNo, after: trip });
    return { ok: true, trip: { id: trip.tripNo, ...trip } };
  }

  const ref = await addDoc(collection(db, TRIPS), trip);
  await logAudit({ actor, action: 'TRIP_OPEN', entity: TRIPS, entityId: ref.id, after: trip });
  return { ok: true, trip: { id: ref.id, ...trip } };
}

/**
 * Move stock from the warehouse into a rep's bag. Both sides of the transfer
 * and the journal entry go in one batch — stock is never in flight.
 */
export async function loadCar({ trip, lines, fromLocationId = 'LOC-MAIN', actor }) {
  if (!lines.length) {
    return { ok: false, message: 'Nothing selected to load.' };
  }

  if (isDemoMode) {
    await logAudit({
      actor,
      action: 'CAR_LOAD',
      entity: TRIPS,
      entityId: trip.id,
      after: { lines: lines.length, pieces: lines.reduce((s, l) => s + l.qty, 0) },
    });
    return { ok: true, lines };
  }

  const batch = writeBatch(db);
  const at = new Date();

  for (const line of lines) {
    batch.update(doc(db, COL.products, line.productId, COL.variants, line.colorCode), {
      [`stock.${fromLocationId}`]: increment(-line.qty),
      [`stock.${trip.locationId}`]: increment(line.qty),
    });

    batch.set(doc(collection(db, COL.inventoryMoves)), {
      at: serverTimestamp(),
      clientAt: at.toISOString(),
      type: 'TRANSFER',
      productId: line.productId,
      modelNo: line.modelNo,
      colorCode: line.colorCode,
      qty: line.qty,
      fromLocationId,
      toLocationId: trip.locationId,
      refType: 'TRIP',
      refId: trip.id,
      refNo: trip.tripNo,
      byUserId: actor?.uid ?? actor?.id ?? null,
    });
  }

  // The trip's own record of what went out — the reconciliation reads this,
  // not the live stock figure, so it can explain itself line by line.
  batch.update(doc(db, TRIPS, trip.id), {
    loadLines: [...(trip.loadLines ?? []), ...lines],
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  await logAudit({
    actor,
    action: 'CAR_LOAD',
    entity: TRIPS,
    entityId: trip.id,
    after: { lines: lines.length, pieces: lines.reduce((s, l) => s + l.qty, 0) },
  });

  return { ok: true, lines };
}

/**
 * Settle the trip. The counted figure becomes the truth and the difference is
 * written as an explicit signed adjustment — a shortage is a loss somebody has
 * to account for, so it leaves a record rather than being absorbed silently.
 */
export async function closeTrip({ trip, reconciliation, returnToWarehouse = true, actor }) {
  const plan = settlementPlan(reconciliation, { returnToWarehouse });
  if (!plan) {
    return { ok: false, message: 'Count the bag before settling the trip.' };
  }

  const summary = {
    pieces: reconciliation.piecesCounted,
    shortPieces: reconciliation.shortPieces,
    shortValue: reconciliation.shortValue,
    cashExpected: reconciliation.expectedCash,
    cashCounted: reconciliation.countedCash,
    cashVariance: reconciliation.cashVariance,
    creditIssued: reconciliation.creditIssued,
  };

  if (isDemoMode) {
    await logAudit({ actor, action: 'TRIP_CLOSE', entity: TRIPS, entityId: trip.id, after: summary });
    return { ok: true, plan, summary };
  }

  const batch = writeBatch(db);
  const at = new Date();

  for (const adjustment of plan.adjustments) {
    batch.update(doc(db, COL.products, adjustment.productId, COL.variants, adjustment.colorCode), {
      [`stock.${adjustment.locationId}`]: increment(adjustment.qty),
    });
    batch.set(doc(collection(db, COL.inventoryMoves)), {
      at: serverTimestamp(),
      clientAt: at.toISOString(),
      type: 'ADJUSTMENT',
      reason: adjustment.reason,
      productId: adjustment.productId,
      modelNo: adjustment.modelNo,
      colorCode: adjustment.colorCode,
      qty: adjustment.qty,
      fromLocationId: adjustment.qty < 0 ? adjustment.locationId : null,
      toLocationId: adjustment.qty > 0 ? adjustment.locationId : null,
      value: adjustment.value,
      refType: 'TRIP',
      refId: trip.id,
      refNo: trip.tripNo,
      byUserId: actor?.uid ?? actor?.id ?? null,
    });
  }

  for (const back of plan.returns) {
    batch.update(doc(db, COL.products, back.productId, COL.variants, back.colorCode), {
      [`stock.${back.fromLocationId}`]: increment(-back.qty),
      [`stock.${back.toLocationId}`]: increment(back.qty),
    });
    batch.set(doc(collection(db, COL.inventoryMoves)), {
      at: serverTimestamp(),
      clientAt: at.toISOString(),
      type: 'TRANSFER',
      productId: back.productId,
      modelNo: back.modelNo,
      colorCode: back.colorCode,
      qty: back.qty,
      fromLocationId: back.fromLocationId,
      toLocationId: back.toLocationId,
      refType: 'TRIP',
      refId: trip.id,
      refNo: trip.tripNo,
      byUserId: actor?.uid ?? actor?.id ?? null,
    });
  }

  batch.update(doc(db, TRIPS, trip.id), {
    status: 'CLOSED',
    closedAt: serverTimestamp(),
    countedLines: reconciliation.stockLines
      .filter((line) => line.counted != null)
      .map((line) => ({
        productId: line.productId,
        modelNo: line.modelNo,
        colorCode: line.colorCode,
        qty: line.counted,
      })),
    cash: plan.cash,
    summary,
    stockReturned: returnToWarehouse,
    reconciledBy: actor?.uid ?? actor?.id ?? null,
  });

  await batch.commit();
  await logAudit({ actor, action: 'TRIP_CLOSE', entity: TRIPS, entityId: trip.id, after: summary });

  return { ok: true, plan, summary };
}

function buildTripNo(rep) {
  const code = String(rep?.repCode ?? rep?.name ?? 'XX')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 2)
    .toUpperCase()
    .padEnd(2, 'X');
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `CAR-${stamp}-${code}`;
}
