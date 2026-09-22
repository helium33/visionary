import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Demo mode keeps the UI reviewable with no Firebase project attached: the
 * repository ships a seeded dataset so a reviewer can open the dashboard
 * without credentials. Set VITE_DEMO_MODE=false once .env.local is filled in.
 */
export const isDemoMode =
  import.meta.env.VITE_DEMO_MODE === 'true' || !config.projectId;

let app = null;
let db = null;
let auth = null;

if (!isDemoMode) {
  app = initializeApp(config);

  /**
   * OFFLINE PERSISTENCE — the reason this system works in a Yangon market
   * street with no signal.
   *
   * `persistentLocalCache` is the modern replacement for
   * `enableIndexedDbPersistence()` and must be passed at initialisation, before
   * any read happens. `persistentMultipleTabManager` lets the warehouse keep
   * several tabs open against one shared IndexedDB cache instead of the second
   * tab silently failing to acquire the lease.
   *
   * With this in place, `addDoc`/`setDoc` resolve against the local cache
   * immediately, the write sits in Firestore's own mutation queue, and every
   * onSnapshot listener fires with `metadata.hasPendingWrites === true`. The
   * UI reads that flag (see useSyncState) to badge unsynced vouchers.
   */
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });

  auth = getAuth(app);
  // Keep the rep signed in across app restarts — a re-login prompt in the field
  // with no connectivity would strand them. Wrapped in try/catch, not just a
  // trailing .catch(): a storage-restricted host (a sandboxed preview iframe,
  // a private window) can make Firebase's own persistence-manager init throw
  // synchronously before it ever returns a promise, which .catch() alone
  // can't intercept — and this runs at module load, so an uncaught throw
  // here would blank the whole app before React ever gets to render.
  try {
    setPersistence(auth, browserLocalPersistence).catch(() => {});
  } catch {
    // No durable session across restarts in this environment — the app still
    // works for the current tab, just without that guarantee.
  }

  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
}

export { app, auth, db };

/** Collection names in one place so a typo cannot create a shadow collection. */
export const COL = {
  users: 'users',
  shops: 'shops',
  vouchers: 'vouchers',
  payments: 'payments',
  creditNotes: 'creditNotes',
  products: 'products',
  variants: 'variants',
  inventoryMoves: 'inventoryMoves',
  stockLocations: 'stockLocations',
  purchaseOrders: 'purchaseOrders',
  expenses: 'expenses',
  auditLogs: 'auditLogs',
  settings: 'settings',
  dailyRollups: 'dailyRollups',
};
