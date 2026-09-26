import {
  collection,
  doc,
  increment,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { COL, db, isDemoMode } from '../lib/firebase';
import { buildVoucherDoc } from '../domain/voucher';
import { logAudit } from './auditService';
import { tNow } from '../i18n/translate';

/**
 * ---------------------------------------------------------------------------
 * VOUCHER WRITE — one batch, offline-safe.
 * ---------------------------------------------------------------------------
 * A voucher touches six things at once: the voucher itself, the stock of every
 * colour sold, the stock of the bundled cases and cloths, the immutable stock
 * journal, the shop's cached balance, and (when cash changes hands at the
 * counter) a payment document.
 *
 * All of it goes in a single `writeBatch`. A batch commits atomically AND
 * queues offline as one unit, so a rep with no signal can never produce a
 * voucher whose stock moved but whose debt did not — the failure mode that
 * makes a wholesale ledger untrustworthy.
 */
export async function createVoucher({
  shop,
  lines,
  bundles = [],
  totals,
  type = 'SALE',
  discountReason = null,
  locationId = 'LOC-MAIN',
  actor,
  isOnline = true,
  overrideRef = null,
  paymentMethod = 'CASH',
  issueDate = new Date(),
}) {
  if (!lines.length) {
    return { ok: false, message: tNow('vouchers.errNoItems') };
  }

  const voucher = buildVoucherDoc({
    shop,
    lines,
    bundles,
    totals,
    type,
    discountReason,
    locationId,
    actor,
    issueDate,
    issuedOffline: !isOnline,
    overrideRef,
  });

  if (isDemoMode) {
    await logAudit({
      actor,
      action: 'VOUCHER_CREATE',
      entity: COL.vouchers,
      entityId: voucher.voucherNo,
      after: voucher,
    });
    return { ok: true, voucher, demo: true };
  }

  const batch = writeBatch(db);
  const voucherRef = doc(collection(db, COL.vouchers));

  batch.set(voucherRef, {
    ...voucher,
    issueDate: issueDate,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Sold lines + the accessories they pull. Both move stock; only the lines
  // were billed.
  const movements = [
    ...lines.map((line) => ({ ...line, reason: 'SALE' })),
    ...bundles.map((bundle) => ({ ...bundle, reason: 'BUNDLE' })),
  ];

  for (const move of movements) {
    batch.update(doc(db, COL.products, move.productId, COL.variants, move.colorCode), {
      [`stock.${locationId}`]: increment(-move.qty),
    });

    batch.set(doc(collection(db, COL.inventoryMoves)), {
      at: serverTimestamp(),
      clientAt: issueDate.toISOString(),
      type: type === 'CONSIGNMENT' ? 'CONSIGNMENT' : 'SALE',
      reason: move.reason,
      productId: move.productId,
      modelNo: move.modelNo,
      colorCode: move.colorCode,
      qty: -move.qty,
      fromLocationId: locationId,
      toLocationId: null,
      refType: 'VOUCHER',
      refId: voucherRef.id,
      refNo: voucher.voucherNo,
      byUserId: actor?.uid ?? actor?.id ?? null,
    });
  }

  // Consignment stock is not revenue and carries no debt, so it leaves the
  // shop's balance untouched.
  if (type !== 'CONSIGNMENT') {
    batch.update(doc(db, COL.shops, shop.id), {
      'credit.outstanding': increment(voucher.balanceDue),
      'credit.recalcAt': serverTimestamp(),
      'stats.lastPurchaseAt': serverTimestamp(),
      'stats.lifetimeSales': increment(voucher.grandTotal),
      'stats.voucherCount': increment(1),
    });

    batch.set(doc(collection(db, COL.shops, shop.id, 'ledger')), {
      at: serverTimestamp(),
      clientAt: issueDate.toISOString(),
      type: 'VOUCHER',
      refId: voucherRef.id,
      refNo: voucher.voucherNo,
      debit: voucher.grandTotal,
      credit: 0,
      balanceAfter: totals.newBalance + totals.paymentAtIssue,
      note: `${totals.pieces} pcs · ${totals.lineCount} lines`,
    });

    // Cash taken at the counter is a real payment document, allocated to this
    // voucher, so the collection reports and the rep's on-time bonus see it.
    if (totals.paymentAtIssue > 0) {
      batch.set(doc(collection(db, COL.payments)), {
        receiptNo: voucher.voucherNo.replace('VN-', 'RC-'),
        shopId: shop.id,
        shopName: shop.name,
        township: shop.township,
        amount: totals.paymentAtIssue,
        appliedAmount: totals.paymentAtIssue,
        unappliedAmount: 0,
        method: paymentMethod,
        allocations: [
          {
            voucherId: voucherRef.id,
            voucherNo: voucher.voucherNo,
            amount: totals.paymentAtIssue,
            balanceAfter: voucher.balanceDue,
            daysOverdue: 0,
          },
        ],
        onTime: true,
        receivedAt: serverTimestamp(),
        clientAt: issueDate.toISOString(),
        receivedBy: actor?.uid ?? actor?.id ?? null,
        receivedByName: actor?.name ?? null,
        note: `Collected at issue of ${voucher.voucherNo}`,
      });
    }
  }

  await batch.commit();
  await logAudit({
    actor,
    action: 'VOUCHER_CREATE',
    entity: COL.vouchers,
    entityId: voucherRef.id,
    after: { voucherNo: voucher.voucherNo, grandTotal: voucher.grandTotal, shopId: shop.id },
  });

  return { ok: true, voucher: { ...voucher, id: voucherRef.id } };
}
