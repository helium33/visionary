import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { fmtMMK } from '../../lib/format';

const MATERIALS = ['TR90', 'ACETATE', 'METAL', 'TITANIUM'];
const SHAPES = ['RECTANGLE', 'ROUND', 'SQUARE', 'CAT_EYE', 'AVIATOR'];

/**
 * Model selection for the grid. A rep knows the model number by heart, so
 * search is the primary path and the attribute filters exist for the case where
 * the shop asks for "a round acetate for women".
 */
export function ModelPicker({ products, selectedId, onSelect }) {
  const [search, setSearch] = useState('');
  const [material, setMaterial] = useState('ALL');
  const [shape, setShape] = useState('ALL');

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      if (material !== 'ALL' && product.material !== material) return false;
      if (shape !== 'ALL' && product.shape !== shape) return false;
      if (!term) return true;
      return (
        product.modelNo.toLowerCase().includes(term) ||
        (product.brand ?? '').toLowerCase().includes(term)
      );
    });
  }, [products, search, material, shape]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-[10rem] flex-1">
          <span className="sr-only">Search model number</span>
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Model no. — e.g. PB-2026"
            className="h-9 w-full rounded-md border border-line-hair bg-surface pl-8 pr-2 text-sm text-ink outline-none"
          />
        </label>
        <select
          aria-label="Filter by material"
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          className="h-9 rounded-md border border-line-hair bg-surface px-2 text-xs text-ink-secondary"
        >
          <option value="ALL">All materials</option>
          {MATERIALS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by shape"
          value={shape}
          onChange={(e) => setShape(e.target.value)}
          className="h-9 rounded-md border border-line-hair bg-surface px-2 text-xs text-ink-secondary"
        >
          <option value="ALL">All shapes</option>
          {SHAPES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <ul className="mt-3 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
        {rows.map((product) => {
          const active = product.id === selectedId;
          const low = product.totalStock <= 12;
          return (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => onSelect(product.id)}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition ${
                  active
                    ? 'border-ink bg-ink text-plane'
                    : 'border-line-hair text-ink-secondary hover:bg-raised hover:text-ink'
                }`}
              >
                {active ? <Check size={12} aria-hidden="true" /> : null}
                <span className="font-medium tabular-nums">{product.modelNo}</span>
                <span className={active ? 'opacity-70' : 'text-ink-muted'}>
                  {product.colorCount}c · K {fmtMMK(product.pricing?.STANDARD, { compact: true })}
                </span>
                {low && !active ? (
                  <span className="rounded bg-wash-warning px-1 py-0.5 text-2xs text-ink">low</span>
                ) : null}
              </button>
            </li>
          );
        })}
        {rows.length === 0 ? (
          <li className="px-1 py-4 text-xs text-ink-secondary">No models match that filter.</li>
        ) : null}
      </ul>
    </div>
  );
}
