import { toDate } from '../lib/dates';
import { fmtMMK } from '../lib/format';
import { tOr, translate } from '../i18n/translate';

// Descriptions read from the dictionary (admin.action / admin.entity /
// admin.desc). Callers in a component pass their own `t`; everything else —
// tests included — gets English.
const english = (key, vars) => translate('en', key, vars);

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

// Display names: admin.action.<ACTION> in the dictionary.
export const ACTION_META = {
  VOUCHER_CREATE: { tone: 'neutral' },
  VOUCHER_EDIT: { tone: 'warning' },
  VOUCHER_VOID: { tone: 'critical' },
  PAYMENT_RECORD: { tone: 'good' },
  CREDIT_OVERRIDE: { tone: 'critical' },
  CREDIT_HOLD_SET: { tone: 'critical' },
  CREDIT_HOLD_CLEARED: { tone: 'good' },
  CREDIT_NOTE: { tone: 'warning' },
  PO_CREATE: { tone: 'neutral' },
  PO_RECEIVE: { tone: 'good' },
  EXPENSE_RECORD: { tone: 'neutral' },
  TRIP_OPEN: { tone: 'neutral' },
  CAR_LOAD: { tone: 'neutral' },
  TRIP_CLOSE: { tone: 'good' },
  USER_ROLE_CHANGE: { tone: 'warning' },
  USER_STATUS_CHANGE: { tone: 'warning' },
  MASTER_PASSWORD_ROTATE: { tone: 'critical' },
  SHOP_CREATE: { tone: 'neutral' },
  SHOP_UPDATE: { tone: 'warning' },
  STOCK_IMPORT: { tone: 'good' },
};

export function actionMeta(action, t = english) {
  return {
    tone: ACTION_META[action]?.tone ?? 'neutral',
    label: tOr(t, `admin.action.${action}`, action ?? t('admin.action.unknown')),
  };
}

export function entityLabel(entity, t = english) {
  return entity ? tOr(t, `admin.entity.${entity}`, entity) : t('admin.entity.record');
}

/**
 * One line describing what actually happened — the thing a reviewer reads
 * first and opens the raw entry only if it does not answer the question.
 */
export function describeAuditEntry(entry, t = english) {
  const after = entry?.after ?? {};
  const before = entry?.before ?? {};
  const id = entry?.entityId;
  const d = (key, vars) => t(`admin.desc.${key}`, vars);
  const role = (key) => tOr(t, `labels.role.${key}`, key);

  switch (entry?.action) {
    case 'VOUCHER_CREATE':
      return after.grandTotal != null
        ? d('voucherIssuedAmount', { no: after.voucherNo ?? id, amount: fmtMMK(after.grandTotal) })
        : d('voucherIssued', { id });
    case 'PAYMENT_RECORD':
      if (after.amount == null) return d('payment');
      return after.shopId
        ? d('paymentFrom', { amount: fmtMMK(after.amount), shop: after.shopId })
        : d('paymentAmount', { amount: fmtMMK(after.amount) });
    case 'CREDIT_OVERRIDE':
      return d('override', { id, minutes: 30 });
    case 'CREDIT_HOLD_SET':
      return d('holdSet', { id });
    case 'CREDIT_HOLD_CLEARED':
      return d('holdCleared', { id });
    case 'CREDIT_NOTE':
      return after.amount != null ? d('creditNoteAmount', { amount: fmtMMK(after.amount) }) : d('creditNote');
    case 'PO_CREATE':
      return d('poRaised', { id });
    case 'PO_RECEIVE': {
      if (after.movements == null) return d('poReceived', { id });
      const costs = after.costUpdates?.length ?? 0;
      return d('poReceivedDetail', {
        id,
        lines: d(after.movements === 1 ? 'lineOne' : 'lineMany', { count: after.movements }),
        costs: d(costs === 1 ? 'costOne' : 'costMany', { count: costs }),
      });
    }
    case 'EXPENSE_RECORD':
      return after.amount != null ? d('expenseAmount', { amount: fmtMMK(after.amount) }) : d('expense');
    case 'TRIP_OPEN':
      return d('tripOpened');
    case 'CAR_LOAD':
      return after.pieces != null ? d('carLoadedPieces', { pieces: after.pieces }) : d('carLoaded');
    case 'TRIP_CLOSE':
      return after.shortPieces
        ? d('tripShort', { pieces: after.shortPieces, amount: fmtMMK(after.shortValue ?? 0) })
        : d('tripTiedOut');
    case 'USER_ROLE_CHANGE':
      return d('roleChange', { id, from: role(before.role), to: role(after.role) });
    case 'USER_STATUS_CHANGE':
      return d(after.active ? 'reactivated' : 'deactivated', { id });
    case 'MASTER_PASSWORD_ROTATE':
      return d('passwordRotated');
    case 'SHOP_CREATE':
      return after.code ? d('shopAddedCode', { name: after.name ?? id, code: after.code }) : d('shopAdded', { id });
    case 'SHOP_UPDATE': {
      const fields = Object.keys(after ?? {}).map((field) => tOr(t, `admin.field.${field}`, field));
      return fields.length
        ? d('shopUpdatedFields', { id, fields: fields.join(', ') })
        : d('shopUpdated', { id });
    }
    case 'STOCK_IMPORT':
      return after.pieces != null
        ? d('stockImported', { models: after.models, pieces: after.pieces, file: id ?? '' })
        : d('stockImportedPlain');
    default:
      return d('generic', {
        action: actionMeta(entry?.action, t).label,
        entity: entityLabel(entry?.entity, t),
        id: id ?? '',
      }).trim();
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

export function summariseAuditActivity(entries = [], t = english) {
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
      .map(([action, count]) => ({ key: action, label: actionMeta(action, t).label, value: count }))
      .sort((a, b) => b.value - a.value),
  };
}
