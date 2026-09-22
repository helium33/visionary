import { toDate } from '../lib/dates';
import { fmtMMK } from '../lib/format';
import { roleLabel } from './permissions';

/**
 * ---------------------------------------------------------------------------
 * THE AUDIT LOG, READ BACK.
 * ---------------------------------------------------------------------------
 * Every action in this system that changes money, stock or trust writes an
 * entry through `services/auditService.js#logAudit` — that half is already
 * wired into every service module. This half turns the raw `{ action, entity,
 * before, after, reason }` documents into something a person scanning the log
 * can actually read, without opening each entry's JSON.
 *
 * Pure and offline-safe: it never reads the clock and never assumes `at` has
 * resolved yet (an entry written seconds ago, still offline, carries only
 * `clientAt` — see `logAudit`).
 */

export const ACTION_META = {
  VOUCHER_CREATE: { label: 'Voucher issued', tone: 'neutral' },
  VOUCHER_EDIT: { label: 'Voucher edited', tone: 'warning' },
  VOUCHER_VOID: { label: 'Voucher voided', tone: 'critical' },
  PAYMENT_RECORD: { label: 'Payment recorded', tone: 'good' },
  CREDIT_OVERRIDE: { label: 'Credit override granted', tone: 'critical' },
  CREDIT_HOLD_SET: { label: 'Manual hold placed', tone: 'critical' },
  CREDIT_HOLD_CLEARED: { label: 'Manual hold cleared', tone: 'good' },
  CREDIT_NOTE: { label: 'Credit note issued', tone: 'warning' },
  PO_CREATE: { label: 'Purchase order raised', tone: 'neutral' },
  PO_RECEIVE: { label: 'Purchase order received', tone: 'good' },
  EXPENSE_RECORD: { label: 'Expense recorded', tone: 'neutral' },
  TRIP_OPEN: { label: 'Car trip opened', tone: 'neutral' },
  CAR_LOAD: { label: 'Car loaded', tone: 'neutral' },
  TRIP_CLOSE: { label: 'Car trip settled', tone: 'good' },
  USER_ROLE_CHANGE: { label: 'Role changed', tone: 'warning' },
  USER_STATUS_CHANGE: { label: 'Account status changed', tone: 'warning' },
  MASTER_PASSWORD_ROTATE: { label: 'Master password rotated', tone: 'critical' },
};

const ENTITY_LABELS = {
  vouchers: 'voucher',
  shops: 'shop',
  payments: 'payment',
  creditNotes: 'credit note',
  purchaseOrders: 'purchase order',
  expenses: 'expense',
  carTrips: 'car trip',
  users: 'user',
  settings: 'settings',
};

export function actionMeta(action) {
  return ACTION_META[action] ?? { label: action ?? 'Unknown action', tone: 'neutral' };
}

export function entityLabel(entity) {
  return ENTITY_LABELS[entity] ?? entity ?? 'record';
}

/**
 * One line describing what actually happened — the thing a reviewer reads
 * first and opens the raw entry only if it does not answer the question.
 */
export function describeAuditEntry(entry) {
  const after = entry?.after ?? {};
  const before = entry?.before ?? {};

  switch (entry?.action) {
    case 'VOUCHER_CREATE':
      return after.grandTotal != null
        ? `Issued ${after.voucherNo ?? entry.entityId} for K ${fmtMMK(after.grandTotal)}`
        : `Issued voucher ${entry.entityId}`;
    case 'PAYMENT_RECORD':
      return after.amount != null
        ? `Recorded K ${fmtMMK(after.amount)}${after.shopId ? ` from ${after.shopId}` : ''}`
        : 'Recorded a payment';
    case 'CREDIT_OVERRIDE':
      return `Released ${entry.entityId} for 30 minutes`;
    case 'CREDIT_HOLD_SET':
      return `Placed a hold on ${entry.entityId}`;
    case 'CREDIT_HOLD_CLEARED':
      return `Cleared the hold on ${entry.entityId}`;
    case 'CREDIT_NOTE':
      return after.amount != null ? `Issued a credit note for K ${fmtMMK(after.amount)}` : 'Issued a credit note';
    case 'PO_CREATE':
      return `Raised ${entry.entityId}`;
    case 'PO_RECEIVE':
      return after.movements != null
        ? `Received ${entry.entityId} — ${after.movements} line${after.movements === 1 ? '' : 's'}, ${after.costUpdates?.length ?? 0} cost${(after.costUpdates?.length ?? 0) === 1 ? '' : 's'} restated`
        : `Received ${entry.entityId}`;
    case 'EXPENSE_RECORD':
      return after.amount != null ? `Recorded K ${fmtMMK(after.amount)} in expenses` : 'Recorded an expense';
    case 'TRIP_OPEN':
      return `Opened a car trip`;
    case 'CAR_LOAD':
      return after.pieces != null ? `Loaded ${after.pieces} pcs into the car` : 'Loaded the car';
    case 'TRIP_CLOSE':
      return after.shortPieces
        ? `Settled the trip — ${after.shortPieces} pcs short (K ${fmtMMK(after.shortValue ?? 0)})`
        : 'Settled the trip — everything tied out';
    case 'USER_ROLE_CHANGE':
      return `Changed ${entry.entityId} from ${roleLabel(before.role)} to ${roleLabel(after.role)}`;
    case 'USER_STATUS_CHANGE':
      return `${after.active ? 'Reactivated' : 'Deactivated'} ${entry.entityId}`;
    case 'MASTER_PASSWORD_ROTATE':
      return 'Rotated the credit-override master password';
    default:
      return `${actionMeta(entry?.action).label} on ${entityLabel(entry?.entity)} ${entry?.entityId ?? ''}`.trim();
  }
}

/**
 * @param {object} filters { actorId, action, entity, from, to, search }
 */
export function filterAuditLogs(entries = [], filters = {}) {
  const { actorId, action, entity, from, to, search } = filters;
  const term = search?.trim().toLowerCase();

  return entries.filter((entry) => {
    if (actorId && entry.actorId !== actorId) return false;
    if (action && entry.action !== action) return false;
    if (entity && entry.entity !== entity) return false;

    const at = toDate(entry.at) ?? toDate(entry.clientAt);
    if (from && at && at < from) return false;
    if (to && at && at > to) return false;

    if (term) {
      const haystack = [
        entry.actorName,
        entry.entityId,
        entry.reason,
        describeAuditEntry(entry),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }

    return true;
  });
}

/** Sorted newest first — an offline entry with no server `at` yet sorts by
 * its client timestamp, so a just-written row never appears to vanish. */
export function sortAuditLogs(entries = []) {
  return [...entries].sort((a, b) => {
    const dateA = toDate(a.at) ?? toDate(a.clientAt) ?? new Date(0);
    const dateB = toDate(b.at) ?? toDate(b.clientAt) ?? new Date(0);
    return dateB - dateA;
  });
}

export function summariseAuditActivity(entries = []) {
  const byActor = new Map();
  const byAction = new Map();

  for (const entry of entries) {
    const actorKey = entry.actorName ?? entry.actorId ?? 'Unknown';
    byActor.set(actorKey, (byActor.get(actorKey) ?? 0) + 1);
    byAction.set(entry.action, (byAction.get(entry.action) ?? 0) + 1);
  }

  return {
    total: entries.length,
    criticalCount: entries.filter((e) => actionMeta(e.action).tone === 'critical').length,
    byActor: [...byActor.entries()]
      .map(([name, count]) => ({ key: name, value: count }))
      .sort((a, b) => b.value - a.value),
    byAction: [...byAction.entries()]
      .map(([action, count]) => ({ key: action, label: actionMeta(action).label, value: count }))
      .sort((a, b) => b.value - a.value),
  };
}
