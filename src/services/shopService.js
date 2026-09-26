import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { COL, db, isDemoMode } from '../lib/firebase';
import { createDemoShop, updateDemoShop } from '../data/demoShopsStore';
import { logAudit } from './auditService';

/**
 * ---------------------------------------------------------------------------
 * SHOP DIRECTORY WRITES.
 * ---------------------------------------------------------------------------
 * A new shop's `code` is generated here, not typed by the person creating
 * it — a duplicate or malformed code would corrupt the one thing printed on
 * every voucher and statement this shop ever receives. `district` is never
 * written; it is derived from `township` at read time (constants/districts.js).
 */

function generateShopCode() {
  return `SH-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export async function createShop({
  name,
  nameMM,
  township,
  ownerName,
  phone,
  priceTier,
  creditLimit,
  creditTermDays,
  salesRepId,
  actor,
}) {
  const code = generateShopCode();
  const base = {
    code,
    name,
    nameMM: nameMM || '',
    township,
    ownerName: ownerName || '',
    phone: phone || '',
    viber: phone || '',
    priceTier,
    creditLimit: Number(creditLimit) || 0,
    creditTermDays: Number(creditTermDays) || 14,
    salesRepId: salesRepId || null,
    active: true,
    credit: { status: 'ACTIVE', outstanding: 0 },
    stats: { lifetimeSales: 0, voucherCount: 0 },
  };

  if (isDemoMode) {
    const shop = createDemoShop({
      id: code,
      ...base,
      createdAt: new Date().toISOString(),
      credit: { ...base.credit, recalcAt: new Date().toISOString() },
    });
    await logAudit({
      actor,
      action: 'SHOP_CREATE',
      entity: COL.shops,
      entityId: shop.id,
      after: { name, township, code },
    });
    return { ok: true, shop };
  }

  const ref = await addDoc(collection(db, COL.shops), {
    ...base,
    createdAt: serverTimestamp(),
    credit: { ...base.credit, recalcAt: serverTimestamp() },
  });
  await logAudit({
    actor,
    action: 'SHOP_CREATE',
    entity: COL.shops,
    entityId: ref.id,
    after: { name, township, code },
  });
  return { ok: true, shop: { id: ref.id, ...base } };
}

/**
 * Price tier, credit limit, credit term, and profile fields — never
 * `credit.override` or the cached `credit.*` roll-up, which only the
 * ageing engine and the override callable are allowed to touch (see
 * firestore.rules — a client write to those would let a shop's own rep
 * clear their own lock).
 */
export async function updateShop({ shopId, patch, actor }) {
  const safePatch = { ...patch };
  delete safePatch.credit;
  delete safePatch.id;
  delete safePatch.code;

  if (isDemoMode) {
    const { after } = updateDemoShop(shopId, safePatch);
    await logAudit({
      actor,
      action: 'SHOP_UPDATE',
      entity: COL.shops,
      entityId: shopId,
      after: safePatch,
    });
    return { ok: true, shop: after };
  }

  await updateDoc(doc(db, COL.shops, shopId), { ...safePatch, updatedAt: serverTimestamp() });
  await logAudit({
    actor,
    action: 'SHOP_UPDATE',
    entity: COL.shops,
    entityId: shopId,
    after: safePatch,
  });
  return { ok: true };
}
