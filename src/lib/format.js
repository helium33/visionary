/** Myanmar kyat. Wholesale figures run to 7–8 digits, so tiles compact them. */
export function fmtMMK(amount, { compact = false, sign = false } = {}) {
  const value = Number(amount) || 0;
  const prefix = sign && value > 0 ? '+' : '';

  if (compact && Math.abs(value) >= 1_000_000) {
    return `${prefix}${trimZero(value / 1_000_000)}M`;
  }
  if (compact && Math.abs(value) >= 10_000) {
    return `${prefix}${trimZero(value / 1_000)}K`;
  }
  return `${prefix}${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function trimZero(n) {
  return n
    .toFixed(1)
    .replace(/\.0$/, '')
    .replace(/\B(?=(\d{3})+(?!\d))/, ',');
}

/** "K 1,250,000" — the unit reads ahead of the number on documents. */
export function fmtKyat(amount, options) {
  return `K ${fmtMMK(amount, options)}`;
}

export function fmtPct(value, digits = 0) {
  return `${(Number(value) || 0).toFixed(digits)}%`;
}

export function fmtDays(days) {
  if (days == null) return '—';
  const n = Math.abs(days);
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

export function initialsOf(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}
