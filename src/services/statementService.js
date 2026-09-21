import { COMPANY } from '../lib/constants';
import { fmtDate } from '../lib/dates';
import { fmtMMK } from '../lib/format';

/**
 * Statements go out over Viber and Telegram, not email — that is how Yangon
 * wholesale actually chases debt. So the primary artefact is a plain-text
 * message shaped to survive a chat bubble (no tables, no markdown), with the
 * printable A5 statement as the formal backup.
 */
export function buildStatementText(shop, state, { today = new Date() } = {}) {
  const lines = [];
  lines.push(`${COMPANY.name}`);
  lines.push(`Statement of Account — ${fmtDate(today)}`);
  lines.push('');
  lines.push(`Shop: ${shop.name}${shop.nameMM ? ` (${shop.nameMM})` : ''}`);
  lines.push(`Township: ${shop.township}`);
  lines.push('');
  lines.push('OUTSTANDING VOUCHERS');

  for (const { voucher, aging } of state.agedVouchers) {
    const when = aging.isOverdue
      ? `OVERDUE ${aging.daysOverdue}d`
      : `due in ${aging.daysUntilDue}d`;
    lines.push(
      `• ${voucher.voucherNo}  ${fmtDate(voucher.issueDate, 'dd/MM')} → ${fmtDate(aging.dueDate, 'dd/MM')}  ` +
        `K ${fmtMMK(aging.balanceDue)}  [${when}]`,
    );
  }

  lines.push('');
  lines.push(`TOTAL OUTSTANDING: K ${fmtMMK(state.outstanding)}`);
  if (state.overdueAmount > 0) {
    lines.push(`OF WHICH OVERDUE: K ${fmtMMK(state.overdueAmount)}`);
    lines.push('');
    lines.push('⚠️ Account is past the 14-day credit term. New orders are on hold');
    lines.push('until the overdue amount is settled.');
    lines.push('ငွေပေးချေရန် ရက်လွန်နေပါသည်။ အမှာစာအသစ် ခေတ္တရပ်ဆိုင်းထားပါသည်။');
  } else if (state.status === 'WATCH') {
    const days = state.oldestAging?.daysUntilDue ?? 0;
    lines.push('');
    lines.push(`⏰ Payment due in ${days} day(s). Please arrange settlement.`);
    lines.push('ငွေပေးချေရန် ရက်နီးကပ်နေပါပြီ။');
  }

  lines.push('');
  lines.push(`Payment: ${COMPANY.phone} (KBZPay / WavePay)`);
  lines.push(`${COMPANY.name} — ${COMPANY.phone}`);
  return lines.join('\n');
}

export function buildReminderText(shop, state) {
  const overdue = state.overdueAmount > 0;
  const headline = overdue
    ? `Your account has K ${fmtMMK(state.overdueAmount)} past the 14-day term.`
    : `K ${fmtMMK(state.outstanding)} falls due in ${state.oldestAging?.daysUntilDue ?? 0} day(s).`;
  return [
    `${shop.name} — ${COMPANY.name}`,
    '',
    headline,
    `Oldest voucher: ${state.oldestVoucher?.voucherNo ?? '—'} (due ${fmtDate(state.oldestAging?.dueDate)})`,
    '',
    overdue
      ? 'New orders are on hold until this is cleared. Thank you.'
      : 'Thank you for your continued business.',
    `${COMPANY.phone}`,
  ].join('\n');
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
