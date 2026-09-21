import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { COL, db, isDemoMode } from '../lib/firebase';
import { demoPayments, demoShops, demoUsers, demoVouchers } from '../data/demoData';

/**
 * One subscription layer for both sources.
 *
 * Every subscriber receives `{ data, pendingWrites, fromCache }`. Those last
 * two come straight off Firestore's snapshot metadata and are what the UI uses
 * to badge documents that exist only in the local mutation queue — the rep
 * needs to see, at a glance, which vouchers have not reached the server yet.
 */

function demoSubscribe(rows, cb) {
  // Async to match the real listener's timing so components never assume a
  // synchronous first frame.
  const handle = setTimeout(() => cb({ data: rows, pendingWrites: false, fromCache: false }), 0);
  return () => clearTimeout(handle);
}

function liveSubscribe(q, cb, onError) {
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      cb({
        data: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        pendingWrites: snap.metadata.hasPendingWrites,
        fromCache: snap.metadata.fromCache,
      });
    },
    (error) => {
      console.error('[dataSource] listener failed', error);
      onError?.(error);
    },
  );
}

export function subscribeShops(cb, { salesRepId } = {}, onError) {
  if (isDemoMode) {
    const rows = salesRepId ? demoShops.filter((s) => s.salesRepId === salesRepId) : demoShops;
    return demoSubscribe(rows, cb);
  }
  const clauses = [where('active', '==', true)];
  if (salesRepId) clauses.push(where('salesRepId', '==', salesRepId));
  return liveSubscribe(query(collection(db, COL.shops), ...clauses), cb, onError);
}

/**
 * Only OPEN receivables are streamed for the credit screens. The index on
 * (status, dueDate) keeps this cheap, and the result set stays small enough to
 * live comfortably in the offline cache on a rep's phone.
 */
export function subscribeOpenVouchers(cb, { salesRepId } = {}, onError) {
  if (isDemoMode) {
    const rows = demoVouchers.filter((v) =>
      salesRepId ? v.salesRepId === salesRepId : true,
    );
    return demoSubscribe(rows, cb);
  }
  const clauses = [where('status', 'in', ['ISSUED', 'PARTIAL', 'OVERDUE'])];
  if (salesRepId) clauses.push(where('salesRepId', '==', salesRepId));
  return liveSubscribe(
    query(collection(db, COL.vouchers), ...clauses, orderBy('dueDate', 'asc')),
    cb,
    onError,
  );
}

/** Vouchers issued since `since` — feeds the sales charts. */
export function subscribeRecentVouchers(cb, { since }, onError) {
  if (isDemoMode) {
    const rows = demoVouchers.filter((v) => new Date(v.issueDate) >= since);
    return demoSubscribe(rows, cb);
  }
  return liveSubscribe(
    query(
      collection(db, COL.vouchers),
      where('issueDate', '>=', since),
      orderBy('issueDate', 'desc'),
    ),
    cb,
    onError,
  );
}

export function subscribePayments(cb, { since }, onError) {
  if (isDemoMode) {
    const rows = since ? demoPayments.filter((p) => new Date(p.receivedAt) >= since) : demoPayments;
    return demoSubscribe(rows, cb);
  }
  const clauses = since ? [where('receivedAt', '>=', since)] : [];
  return liveSubscribe(
    query(collection(db, COL.payments), ...clauses, orderBy('receivedAt', 'desc')),
    cb,
    onError,
  );
}

export function subscribeUsers(cb, onError) {
  if (isDemoMode) return demoSubscribe(demoUsers, cb);
  return liveSubscribe(collection(db, COL.users), cb, onError);
}
