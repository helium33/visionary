import {
  collection,
  collectionGroup,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { COL, db, isDemoMode } from '../lib/firebase';
import { demoPayments, demoVouchers } from '../data/demoData';
import { demoProducts, demoStockLocations } from '../data/demoProducts';
import { demoExpenses, demoPurchaseOrders, demoSuppliers } from '../data/demoPurchases';
import { demoCarTrips } from '../data/demoCarTrips';
import { subscribeDemoUsers } from '../data/demoUsersStore';
import { subscribeDemoAudit } from '../data/demoAuditStore';
import { subscribeDemoShops } from '../data/demoShopsStore';
import { sortRows } from '../lib/sortRows';

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

// Most screens pass no onError, so a failed listener used to leave them on
// their loading skeleton with nothing on screen saying why. Every failure is
// also sent here; the toast layer registers the reporter.
let reportListenerError = () => {};

export function setListenerErrorReporter(report) {
  reportListenerError = report;
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
      reportListenerError(error);
      onError?.(error);
    },
  );
}

/**
 * For queries that filter on one field and need rows ordered by another:
 * Firestore only serves that pairing with a composite index, so the query
 * filters and the rows are ordered here instead (see sortRows).
 */
function sortedBy(field, direction, cb) {
  return (snapshot) => cb({ ...snapshot, data: sortRows(snapshot.data, field, direction) });
}

export function subscribeShops(cb, { salesRepId } = {}, onError) {
  if (isDemoMode) {
    return subscribeDemoShops((allShops) => {
      const data = salesRepId ? allShops.filter((s) => s.salesRepId === salesRepId) : allShops;
      cb({ data, pendingWrites: false, fromCache: false });
    });
  }
  const clauses = [where('active', '==', true)];
  if (salesRepId) clauses.push(where('salesRepId', '==', salesRepId));
  return liveSubscribe(query(collection(db, COL.shops), ...clauses), cb, onError);
}

/**
 * Only OPEN receivables are streamed for the credit screens. Filtering on
 * status keeps this cheap, and the result set stays small enough to live
 * comfortably in the offline cache on a rep's phone — small enough to order
 * by dueDate on the device rather than need a composite index for it.
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
    query(collection(db, COL.vouchers), ...clauses),
    sortedBy('dueDate', 'asc', cb),
    onError,
  );
}

/**
 * Vouchers issued since `since` — feeds the sales charts and the Shops
 * module's purchase history. `salesRepId` is required for a SALES-role
 * caller: firestore.rules only lets a rep read vouchers where
 * `salesRepId == request.auth.uid`, and an unscoped query the rules can't
 * prove is restricted is rejected outright rather than silently filtered —
 * so this is a correctness requirement, not an optimisation, for any screen
 * a SALES rep can reach (Reports is ADMIN/ACCOUNTANT-only, so it has never
 * needed this; the Shops module is not, so it always passes its own rep id).
 */
export function subscribeRecentVouchers(cb, { since, salesRepId } = {}, onError) {
  if (isDemoMode) {
    const rows = demoVouchers.filter(
      (v) => new Date(v.issueDate) >= since && (!salesRepId || v.salesRepId === salesRepId),
    );
    return demoSubscribe(rows, cb);
  }
  const clauses = [where('issueDate', '>=', since)];
  if (salesRepId) clauses.push(where('salesRepId', '==', salesRepId));
  return liveSubscribe(
    query(collection(db, COL.vouchers), ...clauses, orderBy('issueDate', 'desc')),
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
  if (isDemoMode) {
    // Live store, not the static seed array — a role or status edit made on
    // the Users screen has to reach every subscriber, the sidebar role
    // switcher included, without a reload.
    return subscribeDemoUsers((data) => cb({ data, pendingWrites: false, fromCache: false }));
  }
  return liveSubscribe(collection(db, COL.users), cb, onError);
}

/**
 * The audit trail, newest first. Real mode caps it at 500 rows — an
 * unbounded listener on a collection that only ever grows is exactly the kind
 * of query that quietly outgrows the offline cache.
 */
export function subscribeAuditLogs(cb, onError) {
  if (isDemoMode) {
    return subscribeDemoAudit((data) => cb({ data, pendingWrites: false, fromCache: false }));
  }
  return liveSubscribe(
    query(collection(db, COL.auditLogs), orderBy('at', 'desc'), limit(500)),
    cb,
    onError,
  );
}

/**
 * Product documents only — the colour variants live in a subcollection and are
 * fetched per model by `subscribeVariants`, so opening the catalogue does not
 * pull every colour of every model into the cache.
 */
export function subscribeProducts(cb, { category } = {}, onError) {
  if (isDemoMode) {
    const rows = demoProducts
      .filter((p) => (category ? p.category === category : true))
      .map(({ variants, ...product }) => product);
    return demoSubscribe(rows, cb);
  }
  const clauses = [where('active', '==', true)];
  if (category) clauses.push(where('category', '==', category));
  return liveSubscribe(
    query(collection(db, COL.products), ...clauses),
    sortedBy('modelNo', 'asc', cb),
    onError,
  );
}

/** The colour row for one model — what Grid Fast Entry renders. */
export function subscribeVariants(productId, cb, onError) {
  if (isDemoMode) {
    const product = demoProducts.find((p) => p.id === productId);
    return demoSubscribe(product?.variants ?? [], cb);
  }
  return liveSubscribe(
    query(collection(db, COL.products, productId, COL.variants), orderBy('colorCode', 'asc')),
    cb,
    onError,
  );
}

/**
 * EVERY colour of every model, in one collection-group query.
 *
 * The voucher screen loads variants per model on purpose — it touches three.
 * The inventory screen is the opposite case: stock totals, low-stock counts and
 * dead-stock capital are all sums over the whole matrix, so lazy loading would
 * report zero until the warehouse happened to open each model.
 *
 * A collection-group query reads `variants` wherever it appears, so each
 * document carries its parent product id (taken from the reference) to be
 * regrouped. Firestore rules must grant this separately from the nested path —
 * see the `/{path=**}/variants` rule in firestore.rules.
 */
export function subscribeAllVariants(cb, onError) {
  if (isDemoMode) {
    const rows = demoProducts.flatMap((product) =>
      (product.variants ?? []).map((variant) => ({ ...variant, productId: product.id })),
    );
    return demoSubscribe(rows, cb);
  }
  // No orderBy: ordering a collection-group query needs its own
  // collection-group index, and the whole matrix is read anyway.
  return onSnapshot(
    collectionGroup(db, COL.variants),
    { includeMetadataChanges: true },
    (snap) => {
      const rows = snap.docs.map((d) => ({
        id: d.id,
        productId: d.ref.parent.parent?.id ?? null,
        ...d.data(),
      }));
      cb({
        data: sortRows(rows, 'colorCode', 'asc'),
        pendingWrites: snap.metadata.hasPendingWrites,
        fromCache: snap.metadata.fromCache,
      });
    },
    (error) => {
      console.error('[dataSource] variant group listener failed', error);
      reportListenerError(error);
      onError?.(error);
    },
  );
}

export function subscribeStockLocations(cb, onError) {
  if (isDemoMode) return demoSubscribe(demoStockLocations, cb);
  return liveSubscribe(
    query(collection(db, COL.stockLocations), where('active', '==', true)),
    cb,
    onError,
  );
}

export function subscribePurchaseOrders(cb, onError) {
  if (isDemoMode) return demoSubscribe(demoPurchaseOrders, cb);
  return liveSubscribe(
    query(collection(db, COL.purchaseOrders), orderBy('orderedAt', 'desc')),
    cb,
    onError,
  );
}

export function subscribeExpenses(cb, { since } = {}, onError) {
  if (isDemoMode) {
    const rows = since ? demoExpenses.filter((e) => new Date(e.date) >= since) : demoExpenses;
    return demoSubscribe(rows, cb);
  }
  const clauses = since ? [where('date', '>=', since)] : [];
  return liveSubscribe(
    query(collection(db, COL.expenses), ...clauses, orderBy('date', 'desc')),
    cb,
    onError,
  );
}

export function subscribeSuppliers(cb, onError) {
  if (isDemoMode) return demoSubscribe(demoSuppliers, cb);
  return liveSubscribe(collection(db, 'suppliers'), cb, onError);
}

export function subscribeCarTrips(cb, { repId } = {}, onError) {
  if (isDemoMode) {
    const rows = repId ? demoCarTrips.filter((trip) => trip.repId === repId) : demoCarTrips;
    return demoSubscribe(rows, cb);
  }
  const clauses = repId ? [where('repId', '==', repId)] : [];
  return liveSubscribe(
    query(collection(db, 'carTrips'), ...clauses),
    sortedBy('openedAt', 'desc', cb),
    onError,
  );
}
