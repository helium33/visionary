import { subDays } from 'date-fns';

/**
 * Demo-mode audit trail, held in memory for the session.
 *
 * `auditService#logAudit` pushes here in demo mode instead of only logging to
 * the console, so every action taken while reviewing the app — a payment, an
 * override, a receipt, a settled trip — shows up on the Audit log the moment
 * it happens. That is the point of an audit trail: it has to be something you
 * can actually watch fill up, not a write nobody can see land.
 *
 * Seeded with a short history so the page is not empty on first load.
 */
const now = new Date();
const iso = (d) => d.toISOString();

let entries = [
  {
    id: 'demo-seed-1',
    actorId: 'u-admin',
    actorName: 'Ma Thida (Owner)',
    actorRole: 'ADMIN',
    action: 'CREDIT_OVERRIDE',
    entity: 'shops',
    entityId: 'SH-006',
    before: null,
    after: { expiresAt: iso(subDays(now, 6)) },
    reason: 'Shop paid by KBZPay, transfer not yet cleared.',
    at: iso(subDays(now, 6)),
    clientAt: iso(subDays(now, 6)),
  },
  {
    id: 'demo-seed-2',
    actorId: 'u-acct',
    actorName: 'Daw Sandar',
    actorRole: 'ACCOUNTANT',
    action: 'CREDIT_HOLD_SET',
    entity: 'shops',
    entityId: 'SH-010',
    before: null,
    after: null,
    reason: 'Cheque returned unpaid — holding new orders until resolved.',
    at: iso(subDays(now, 4)),
    clientAt: iso(subDays(now, 4)),
  },
  {
    id: 'demo-seed-3',
    actorId: 'u-wh',
    actorName: 'Ko Htet',
    actorRole: 'WAREHOUSE',
    action: 'PO_RECEIVE',
    entity: 'purchaseOrders',
    entityId: 'PO-2026-012',
    before: null,
    after: { movements: 6, costUpdates: 2 },
    reason: null,
    at: iso(subDays(now, 27)),
    clientAt: iso(subDays(now, 27)),
  },
  {
    id: 'demo-seed-4',
    actorId: 'u-admin',
    actorName: 'Ma Thida (Owner)',
    actorRole: 'ADMIN',
    action: 'USER_ROLE_CHANGE',
    entity: 'users',
    entityId: 'u-wh',
    before: { role: 'SALES' },
    after: { role: 'WAREHOUSE' },
    reason: 'Moved from field sales to the warehouse team.',
    at: iso(subDays(now, 120)),
    clientAt: iso(subDays(now, 120)),
  },
];

const listeners = new Set();

function notify() {
  for (const listener of listeners) listener(entries);
}

export function subscribeDemoAudit(cb) {
  listeners.add(cb);
  cb(entries);
  return () => listeners.delete(cb);
}

export function pushDemoAudit(entry) {
  const withId = { id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...entry };
  entries = [withId, ...entries];
  notify();
  return withId;
}
