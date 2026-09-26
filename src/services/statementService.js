import { COMPANY } from '../lib/constants';
import { townshipLabel } from '../constants/districts';
import { fmtDate } from '../lib/dates';
import { fmtDays, fmtMMK } from '../lib/format';
import { getActiveLocale, tNow } from '../i18n/translate';

// Messages are written in the sender's UI language. An English message keeps
// its one-line Burmese summary, because the shop reading it usually prefers
// Burmese; a Burmese message already says everything in Burmese.
const withBurmeseLine = () => getActiveLocale() === 'en';

const shopLabel = (shop) => `${shop.name}${shop.nameMM ? ` (${shop.nameMM})` : ''}`;

/**
 * Statements go out over Viber and Telegram, not email — that is how Yangon
 * wholesale actually chases debt. So the primary artefact is a plain-text
 * message shaped to survive a chat bubble (no tables, no markdown), with the
 * printable A5 statement as the formal backup.
 */
export function buildStatementText(shop, state, { today = new Date() } = {}) {
  const lines = [];
  lines.push(`${COMPANY.name}`);
  lines.push(tNow('credit.msg.statementHeader', { date: fmtDate(today) }));
  lines.push('');
  lines.push(tNow('credit.msg.shop', { shop: shopLabel(shop) }));
  lines.push(tNow('credit.msg.township', { township: townshipLabel(shop.township, getActiveLocale()) }));
  lines.push('');
  lines.push(tNow('credit.msg.outstandingVouchers'));

  for (const { voucher, aging } of state.agedVouchers) {
    const when = aging.isOverdue
      ? tNow('credit.overdueTag', { n: aging.daysOverdue })
      : tNow('credit.dueInTag', { n: aging.daysUntilDue });
    lines.push(
      `• ${voucher.voucherNo}  ${fmtDate(voucher.issueDate, 'dd/MM')} → ${fmtDate(aging.dueDate, 'dd/MM')}  ` +
        `K ${fmtMMK(aging.balanceDue)}  [${when}]`,
    );
  }

  lines.push('');
  lines.push(tNow('credit.msg.totalOutstanding', { amount: fmtMMK(state.outstanding) }));
  if (state.overdueAmount > 0) {
    lines.push(tNow('credit.msg.ofWhichOverdue', { amount: fmtMMK(state.overdueAmount) }));
    lines.push('');
    lines.push(tNow('credit.msg.overdueWarning'));
    if (withBurmeseLine()) {
      lines.push('ငွေပေးချေရန် ရက်လွန်နေပါသည်။ အမှာစာအသစ် ခေတ္တရပ်ဆိုင်းထားပါသည်။');
    }
  } else if (state.status === 'WATCH') {
    const days = state.oldestAging?.daysUntilDue ?? 0;
    lines.push('');
    lines.push(tNow('credit.msg.dueSoon', { days: fmtDays(days) }));
    if (withBurmeseLine()) lines.push('ငွေပေးချေရန် ရက်နီးကပ်နေပါပြီ။');
  }

  lines.push('');
  lines.push(tNow('credit.msg.payment', { phone: COMPANY.phone }));
  lines.push(`${COMPANY.name} — ${COMPANY.phone}`);
  return lines.join('\n');
}

export function buildReminderText(shop, state) {
  const overdue = state.overdueAmount > 0;
  const headline = overdue
    ? tNow('credit.msg.remindOverdue', { amount: fmtMMK(state.overdueAmount) })
    : tNow('credit.msg.remindDue', {
        amount: fmtMMK(state.outstanding),
        days: fmtDays(state.oldestAging?.daysUntilDue ?? 0),
      });
  return [
    `${shop.name} — ${COMPANY.name}`,
    '',
    headline,
    tNow('credit.msg.remindOldest', {
      no: state.oldestVoucher?.voucherNo ?? '—',
      date: fmtDate(state.oldestAging?.dueDate),
    }),
    '',
    tNow(overdue ? 'credit.msg.remindOnHold' : 'credit.msg.remindThanks'),
    `${COMPANY.phone}`,
  ].join('\n');
}

/**
 * A voucher as a chat message. Shops confirm orders on Viber long before the
 * paper reaches them, so this is usually the first copy anyone reads.
 */
export function buildVoucherText(voucher, shop) {
  const lines = [];
  lines.push(`${COMPANY.name}`);
  lines.push(tNow('credit.msg.voucherHeader', { no: voucher.voucherNo, date: fmtDate(voucher.issueDate) }));
  lines.push('');
  lines.push(tNow('credit.msg.shop', { shop: shopLabel(shop) }));
  lines.push('');

  for (const item of voucher.items) {
    lines.push(
      `• ${item.modelNo} ${item.colorCode} ${item.colorName} × ${item.qty} ` +
        `@ ${fmtMMK(item.unitPrice)} = ${fmtMMK(item.lineTotal)}`,
    );
  }

  lines.push('');
  lines.push(tNow('credit.msg.subtotal', { amount: fmtMMK(voucher.subtotal) }));
  if (voucher.discount > 0) lines.push(tNow('credit.msg.discount', { amount: fmtMMK(voucher.discount) }));
  lines.push(tNow('credit.msg.thisVoucher', { amount: fmtMMK(voucher.grandTotal) }));

  if (voucher.type === 'CONSIGNMENT') {
    lines.push('');
    lines.push(tNow('credit.msg.consignment'));
  } else {
    if (voucher.previousBalance > 0) {
      lines.push(tNow('credit.msg.previousBalance', { amount: fmtMMK(voucher.previousBalance) }));
    }
    if (voucher.paymentAtIssue > 0) {
      lines.push(tNow('credit.msg.paidNow', { amount: fmtMMK(voucher.paymentAtIssue) }));
    }
    lines.push(tNow('credit.msg.totalOutstanding', { amount: fmtMMK(voucher.newBalance) }));
    lines.push('');
    lines.push(
      tNow('credit.msg.paymentDue', { date: fmtDate(voucher.dueDate), days: fmtDays(voucher.termDays) }),
    );
    if (withBurmeseLine()) lines.push(`ငွေပေးချေရမည့်ရက်: ${fmtDate(voucher.dueDate)}`);
  }

  lines.push('');
  lines.push(`${COMPANY.name} — ${COMPANY.phone}`);
  return lines.join('\n');
}

const SHARE_TARGETS = {
  viber: (text) => `viber://forward?text=${encodeURIComponent(text)}`,
  telegram: (text) => `https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(text)}`,
  sms: (text) => `sms:?body=${encodeURIComponent(text)}`,
};

/** Opens the chat app if installed; the caller falls back to copy-to-clipboard. */
export function shareTo(target, text) {
  const href = SHARE_TARGETS[target]?.(text);
  if (!href) return false;
  window.open(href, '_blank', 'noopener');
  return true;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Native share sheet — the best path on an Android phone in the field. */
export async function nativeShare(title, text) {
  if (!navigator.share) return false;
  try {
    await navigator.share({ title, text });
    return true;
  } catch {
    return false; // user dismissed
  }
}
