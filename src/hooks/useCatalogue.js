import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeProducts, subscribeVariants } from '../services/dataSource';

/**
 * The product catalogue, with colour variants loaded per model on demand.
 *
 * Products come down in one listener (a few dozen documents). Variants are a
 * subcollection and are only subscribed when a model is actually opened in the
 * grid or referenced by a cart line — a shop with 40 models × 6 colours would
 * otherwise put 240 documents in the cache for a voucher that touches three.
 */
export function useCatalogue() {
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState({}); // productId → variant[]
  const [loading, setLoading] = useState(true);
  const subscriptions = useRef(new Map());

  useEffect(() => {
    const unsub = subscribeProducts(({ data }) => {
      setProducts(data);
      setLoading(false);
    });
    return () => {
      unsub();
      subscriptions.current.forEach((fn) => fn());
      subscriptions.current.clear();
    };
  }, []);

  const ensureVariants = useCallback((productId) => {
    if (!productId || subscriptions.current.has(productId)) return;
    const unsub = subscribeVariants(productId, ({ data }) => {
      setVariants((prev) => ({ ...prev, [productId]: data }));
    });
    subscriptions.current.set(productId, unsub);
  }, []);

  /** Products with their variants attached — the shape the domain expects. */
  const hydrated = useMemo(
    () => products.map((product) => ({ ...product, variants: variants[product.id] ?? [] })),
    [products, variants],
  );

  const byId = useMemo(() => new Map(hydrated.map((p) => [p.id, p])), [hydrated]);

  const frames = useMemo(
    () => hydrated.filter((p) => p.category === 'FRAME'),
    [hydrated],
  );

  return { products: hydrated, byId, frames, ensureVariants, variants, loading };
}
