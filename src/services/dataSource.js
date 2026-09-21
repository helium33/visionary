import {
  collection,
  collectionGroup,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { COL, db, isDemoMode } from '../lib/firebase';
import { demoPayments, demoShops, demoUsers, demoVouchers } from '../data/demoData';
import { demoProducts, demoStockLocations } from '../data/demoProducts';
import { demoExpenses, demoPurchaseOrders, demoSuppliers } from '../data/demoPurchases';
import { demoCarTrips } from '../data/demoCarTrips';

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
    query(collection(db, COL.products), ...clauses, orderBy('modelNo', 'asc')),
    cb,
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
  return onSnapshot(
    query(collectionGroup(db, COL.variants), orderBy('colorCode', 'asc')),
    { includeMetadataChanges: true },
    (snap) => {
      cb({
        data: snap.docs.map((d) => ({
          id: d.id,
          productId: d.ref.parent.parent?.id ?? null,
          ...d.data(),
        })),
        pendingWrites: snap.metadata.hasPendingWrites,
        fromCache: snap.metadata.fromCache,
      });
    },
    (error) => {
      console.error('[dataSource] variant group listener failed', error);
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
    query(collection(db, 'carTrips'), ...clauses, orderBy('openedAt', 'desc')),
    cb,
    onError,
  );
}
