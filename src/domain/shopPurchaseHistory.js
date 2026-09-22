/**
 * ---------------------------------------------------------------------------
 * SHOP PURCHASE HISTORY.
 * ---------------------------------------------------------------------------
 * "Full purchase history (date, model, colour, qty, amount)" flattened from
 * the shop's own vouchers — one row per sold line, not per voucher, since a
 * single voucher can carry several models and colours. Nothing here is
 * stored on the shop document; it is rebuilt from `vouchers.items[]` every
 * time, the same "derive, don't duplicate" rule the rest of this app follows.
 *
 * A voided voucher never happened, so it is excluded — the same rule
 * `isRevenueVoucher` (profit.js) applies to revenue, applied here to history
 * instead. Consignment IS included (with `type` on the row so the UI can
 * label it): a shop that received sample stock did receive it, even though
 * it isn't revenue yet.
 */
export function shopPurchaseHistory(vouchers = []) {
  const rows = [];

  for (const voucher of vouchers) {
    if (voucher.status === 'VOID') continue;
    for (const item of voucher.items ?? []) {
      rows.push({
        key: `${voucher.id}-${item.productId ?? ''}-${item.colorCode ?? ''}`,
        date: voucher.issueDate,
        voucherNo: voucher.voucherNo,
        type: voucher.type ?? 'SALE',
        modelNo: item.modelNo,
        colorName: item.colorName ?? item.colorCode ?? '—',
        qty: Number(item.qty) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        amount: Number(item.lineTotal) || 0,
      });
    }
  }

  return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/** Lifetime totals over the same rows — pieces, revenue lines only. */
export function shopPurchaseSummary(vouchers = []) {
  const sales = vouchers.filter((v) => v.status !== 'VOID' && v.type !== 'CONSIGNMENT');
  const pieces = sales.reduce(
    (sum, v) => sum + (v.items ?? []).reduce((s, item) => s + (Number(item.qty) || 0), 0),
    0,
  );
  const revenue = sales.reduce((sum, v) => sum + (Number(v.grandTotal) || 0), 0);
  const lastPurchaseAt = sales.reduce((latest, v) => {
    const date = v.issueDate ? new Date(v.issueDate) : null;
    return date && (!latest || date > latest) ? date : latest;
  }, null);

  return { voucherCount: sales.length, pieces, revenue, lastPurchaseAt };
}
