import { demoProducts as seedProducts } from './demoProducts';

/**
 * Demo-mode product catalogue, held in memory for the session — the same
 * pattern as `demoShopsStore.js`. Real mode writes `products/{id}` and its
 * `variants`; demo mode has no server, so models added by a stock import live
 * here, and every screen subscribed to the catalogue (Inventory, the voucher
 * grid, car stock) sees them at once.
 */
let products = seedProducts.map((product) => ({
  ...product,
  variants: (product.variants ?? []).map((variant) => ({ ...variant })),
}));
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener(products);
}

export function getDemoProducts() {
  return products;
}

export function subscribeDemoProducts(cb) {
  listeners.add(cb);
  // Async first frame, like the real listener, so no screen relies on a
  // synchronous one.
  const handle = setTimeout(() => cb(products), 0);
  return () => {
    clearTimeout(handle);
    listeners.delete(cb);
  };
}

/** Adds whole models (each with its `variants`). Existing ids are left alone. */
export function addDemoProducts(newProducts) {
  const known = new Set(products.map((product) => product.id));
  const fresh = newProducts.filter((product) => !known.has(product.id));
  products = [...products, ...fresh];
  notify();
  return fresh.length;
}
