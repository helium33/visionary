import {
  addDoc,
  collection,
  doc,
  increment,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { addMinutes } from 'date-fns';
import { COL, app, db, isDemoMode } from '../lib/firebase';
import { allocatePayment } from '../domain/allocation';
import { logAudit } from './auditService';
import { demoSettings } from '../data/demoData';
import { tNow } from '../i18n/translate';

export const OVERRIDE_MINUTES = 30;

/**
 * ---------------------------------------------------------------------------
 * ADMIN OVERRIDE ("master password")
 * ---------------------------------------------------------------------------
 * The password is verified by a Cloud Function, never in the browser. Three
 * reasons this is not negotiable:
 *
 *  - A client-side comparison means the hash ships in the bundle, and any rep
 *    can read it out of devtools.
 *  - Only the server can write the override document, because Firestore rules
 *    deny `shops/{id}.credit.override` to every client. That makes the override
 *    tamper-proof rather than merely inconvenient to fake.
 *  - It forces the override to be an ONLINE action. That is the correct
 *    business rule, not a limitation: releasing a shop that is past its 14-day
 *    term is an owner's decision and must not be self-served from a phone with
 *    no signal. Offline, the rep is told to call the office.
 *
 * The override is time-boxed (30 minutes) so an unlock cannot leak into next
 * week's orders.
 */
export async function requestCreditOverride({ shopId, password, reason, actor, isOnline }) {
  if (!isOnline) {
    return {
      ok: false,
      code: 'OFFLINE',
      message: tNow('credit.err.offline'),
    };
  }

  if (isDemoMode) {
    if (password !== demoSettings.masterPasswordHint) {
      return { ok: false, code: 'BAD_PASSWORD', message: tNow('credit.err.badPassword') };
    }
    const expiresAt = addMinutes(new Date(), OVERRIDE_MINUTES);
    await logAudit({
      actor,
      action: 'CREDIT_OVERRIDE',
      entity: COL.shops,
      entityId: shopId,
      after: { expiresAt: expiresAt.toISOString() },
      reason,
    });
    return {
      ok: true,
      override: { grantedBy: actor?.name, grantedAt: new Date(), expiresAt, reason },
    };
  }

  try {
    const callable = httpsCallable(getFunctions(app), 'grantCreditOverride');
    const { data } = await callable({ shopId, password, reason, minutes: OVERRIDE_MINUTES });
    return { ok: true, override: { ...data, expiresAt: new Date(data.expiresAt) } };
  } catch (error) {
    const code = error?.code === 'functions/permission-denied' ? 'BAD_PASSWORD' : 'ERROR';
    return {
      ok: false,
      code,
      message:
        code === 'BAD_PASSWORD'
          ? tNow('credit.err.badPassword')
          : tNow('credit.err.serverUnreachable'),
    };
  }
}

/**
 * ---------------------------------------------------------------------------
 * PAYMENT — one atomic batch, allocated oldest-voucher-first.
 * ---------------------------------------------------------------------------
 * The allocation is computed client-side by `allocatePayment` so an offline rep
 * sees the exact receipt the server will confirm; the batch then writes the
 * payment, every touched voucher and the shop's cached roll-up together. A
 * `writeBatch` commits atomically *and* queues offline as one unit, so the
 * ledger can never be half-applied.
 */
export async function recordPayment({ shop, vouchers, amount, method, note, actor, today = new Date() }) {
  const result = allocatePayment(vouchers, amount, today);
  if (result.applied === 0 && result.unapplied === 0) {
    return { ok: false, message: tNow('common.amountZero') };
  }

  const receiptNo = buildReceiptNo(actor, today);
  const payment = {
    receiptNo,
    shopId: shop.id,
    shopName: shop.name,
    township: shop.township,
    amount: result.applied + result.unapplied,
    appliedAmount: result.applied,
    unappliedAmount: result.unapplied,
    method,
    note: note ?? null,
    allocations: result.allocations.map((a) => ({
      voucherId: a.voucherId,
      voucherNo: a.voucherNo,
      amount: a.amount,
      balanceAfter: a.balanceAfter,
      daysOverdue: a.daysOverdue,
    })),
    receivedAt: today.toISOString(),
    receivedBy: actor?.uid ?? actor?.id ?? null,
    receivedByName: actor?.name ?? null,
    // Collected inside the 14-day term? Drives the rep's collection bonus.
    onTime: result.allocations.every((a) => a.daysOverdue === 0),
  };

  if (isDemoMode) {
    await logAudit({
      actor,
      action: 'PAYMENT_RECORD',
      entity: COL.payments,
      entityId: receiptNo,
      after: payment,
    });
    return { ok: true, payment, ...result };
  }

  const batch = writeBatch(db);
  const paymentRef = doc(collection(db, COL.payments));
  batch.set(paymentRef, { ...payment, receivedAt: serverTimestamp(), createdAt: serverTimestamp() });

  for (const alloc of result.allocations) {
    batch.update(doc(db, COL.vouchers, alloc.voucherId), {
      paidAmount: increment(alloc.amount),
      balanceDue: alloc.balanceAfter,
      status: alloc.settles ? 'PAID' : 'PARTIAL',
      settledAt: alloc.settles ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
  }

  // Cached roll-up. Authoritative recalculation still happens in the
  // onWrite Cloud Function — this keeps list views correct in the meantime.
  batch.update(doc(db, COL.shops, shop.id), {
    'credit.outstanding': increment(-result.applied),
    'credit.onAccountCredit': increment(result.unapplied),
    'credit.lastPaymentAt': serverTimestamp(),
    'credit.recalcAt': serverTimestamp(),
  });

  await batch.commit();
  await logAudit({
    actor,
    action: 'PAYMENT_RECORD',
    entity: COL.payments,
    entityId: paymentRef.id,
    after: payment,
  });

  return { ok: true, payment: { ...payment, id: paymentRef.id }, ...result };
}

/** Accountant-initiated hold, independent of ageing (e.g. a bounced cheque). */
export async function setManualHold({ shopId, hold, reason, actor }) {
  if (!isDemoMode) {
    const batch = writeBatch(db);
    batch.update(doc(db, COL.shops, shopId), {
      'credit.manualHold': hold,
      'credit.manualHoldReason': hold ? reason : null,
      'credit.recalcAt': serverTimestamp(),
    });
    await batch.commit();
  }
  await logAudit({
    actor,
    action: hold ? 'CREDIT_HOLD_SET' : 'CREDIT_HOLD_CLEARED',
    entity: COL.shops,
    entityId: shopId,
    reason,
  });
  return { ok: true };
}

/**
 * Voucher numbers must be collision-free without a server round-trip, so they
 * carry the device/rep prefix rather than coming from a shared counter
 * document — a counter needs a transaction, and transactions cannot run
 * offline. Same shape is used for receipts.
 */
function buildReceiptNo(actor, today) {
  const rep = (actor?.repCode ?? actor?.name ?? 'XX').slice(0, 2).toUpperCase();
  const stamp = today.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RC-${rep}${stamp}-${rand}`;
}

export async function createCreditNote({ shop, amount, reason, sourceVoucherId, actor }) {
  const note = {
    shopId: shop.id,
    shopName: shop.name,
    amount,
    reason, // RETURN_DEFECTIVE | PRICE_ADJUSTMENT | GOODWILL
    sourceVoucherId: sourceVoucherId ?? null,
    issuedAt: isDemoMode ? new Date().toISOString() : serverTimestamp(),
    issuedBy: actor?.uid ?? actor?.id ?? null,
  };
  if (isDemoMode) {
    await logAudit({ actor, action: 'CREDIT_NOTE', entity: COL.creditNotes, entityId: shop.id, after: note });
    return { ok: true, note };
  }
  const ref = await addDoc(collection(db, COL.creditNotes), note);
  await logAudit({ actor, action: 'CREDIT_NOTE', entity: COL.creditNotes, entityId: ref.id, after: note });
  return { ok: true, note: { id: ref.id, ...note } };
}
