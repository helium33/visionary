import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  startOfDay,
} from 'date-fns';
import { myanmarDateLocale } from '../i18n/dateLocale';
import { getActiveLocale } from '../i18n/translate';

/**
 * Normalises anything the app might hold as a date into a JS Date.
 *
 * Firestore hands back `Timestamp` objects when a document comes from the
 * server, but a document written while offline and read back from the local
 * cache before the server round-trip carries the *pending* sentinel or a plain
 * JS Date instead. Every date read must therefore tolerate all three shapes —
 * this is the single most common source of offline-mode crashes.
 */
export function toDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate();
    } catch {
      return null; // pending serverTimestamp() sentinel
    }
  }
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return isValid(parsed) ? parsed : null;
  }
  return null;
}

/** Calendar-day difference — credit terms are counted in days, not in hours. */
export function daysBetween(from, to) {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return null;
  return differenceInCalendarDays(startOfDay(b), startOfDay(a));
}

export function addDaysTo(value, days) {
  const base = toDate(value);
  return base ? addDays(startOfDay(base), days) : null;
}

export function fmtDate(value, pattern = 'dd MMM yyyy') {
  const date = toDate(value);
  if (!date) return '—';
  return format(date, pattern, getActiveLocale() === 'mm' ? { locale: myanmarDateLocale } : undefined);
}

export function fmtDateTime(value) {
  return fmtDate(value, 'dd MMM yyyy HH:mm');
}

export { startOfDay };
