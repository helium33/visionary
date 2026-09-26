import { demoShops as seedShops } from './demoData';

/**
 * Demo-mode shop directory, held in memory for the session — the same shape
 * as `demoUsersStore.js`. Real mode writes go straight to `shops/{shopId}`;
 * demo mode has no server, so edits made on the Shops screen (a new shop, a
 * price-tier or credit-limit change) live here instead, as a plain mutable
 * store with subscribers. Every subscriber (this page, Credit Management,
 * Reports) sees the edit the moment it happens, not only after a reload.
 */
let shops = seedShops.map((shop) => ({ ...shop }));
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener(shops);
}

export function getDemoShops() {
  return shops;
}

export function subscribeDemoShops(cb) {
  listeners.add(cb);
  cb(shops);
  return () => listeners.delete(cb);
}

export function updateDemoShop(shopId, patch) {
  const before = shops.find((shop) => shop.id === shopId) ?? null;
  shops = shops.map((shop) => (shop.id === shopId ? { ...shop, ...patch } : shop));
  notify();
  return { before, after: shops.find((shop) => shop.id === shopId) ?? null };
}

export function createDemoShop(shop) {
  shops = [...shops, shop];
  notify();
  return shop;
}
