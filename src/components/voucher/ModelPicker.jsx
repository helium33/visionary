import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { fmtMMK } from '../../lib/format';

const MATERIALS = ['TR90', 'ACETATE', 'METAL', 'TITANIUM'];
const SHAPES = ['RECTANGLE', 'ROUND', 'SQUARE', 'CAT_EYE', 'AVIATOR'];

/**
 * Model selection for the grid. A rep knows the model number by heart, so
 * search is the primary path and the attribute filters exist for the case where
 * the shop asks for "a round acetate for women".
 */
export function ModelPicker({ products, selectedId, onSelect }) {
  const { t } = useLocale();
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
          <span className="sr-only">{t('vouchers.searchModel')}</span>
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('vouchers.modelPlaceholder')}
            className="h-9 w-full rounded-md border border-line-hair bg-surface pl-8 pr-2 text-sm text-ink outline-none"
          />
        </label>
        <select
          aria-label={t('vouchers.filterMaterial')}
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          className="h-9 rounded-md border border-line-hair bg-surface px-2 text-xs text-ink-secondary"
        >
          <option value="ALL">{t('vouchers.allMaterials')}</option>
          {MATERIALS.map((m) => (
            <option key={m} value={m}>
              {t(`labels.material.${m}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('vouchers.filterShape')}
          value={shape}
          onChange={(e) => setShape(e.target.value)}
          className="h-9 rounded-md border border-line-hair bg-surface px-2 text-xs text-ink-secondary"
        >
          <option value="ALL">{t('vouchers.allShapes')}</option>
          {SHAPES.map((s) => (
            <option key={s} value={s}>
              {t(`labels.shape.${s}`)}
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
                  {t('vouchers.colourCount', { count: product.colorCount })} · K {fmtMMK(product.pricing?.STANDARD, { compact: true })}
                </span>
                {low && !active ? (
                  <span className="rounded bg-wash-warning px-1 py-0.5 text-2xs text-ink">{t('vouchers.low')}</span>
                ) : null}
              </button>
            </li>
          );
        })}
        {rows.length === 0 ? (
          <li className="px-1 py-4 text-xs text-ink-secondary">{t('vouchers.noModels')}</li>
        ) : null}
      </ul>
    </div>
  );
}
