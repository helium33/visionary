import { useEffect, useMemo, useState } from 'react';
import { Boxes, Coins, PackageX, Search, Skull, Tag, Warehouse } from 'lucide-react';
import { DEAD_STOCK_DAYS, STOCK_BANDS, assessInventory } from '../domain/inventory';
import { subscribeStockLocations } from '../services/dataSource';
import { fmtMMK } from '../lib/format';
import { useLocale } from '../context/LocaleContext';
import { useCatalogue } from '../hooks/useCatalogue';
import { useToday } from '../hooks/useToday';
import { StackedBar } from '../components/charts/StackedBar';
import { DeadStockTable, LowStockTable } from '../components/inventory/AlertTables';
import { LabelPrintModal } from '../components/inventory/LabelPrintModal';
import { StockMatrix } from '../components/inventory/StockMatrix';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { SkeletonRows } from '../components/ui/EmptyState';
import { StatTile } from '../components/ui/StatTile';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/layout/AppShell';

/**
 * ===========================================================================
 * INVENTORY
 * ===========================================================================
 * Three questions, one assessment:
 *
 *  • What is on the shelf, by model and colour, at this location?
 *  • What has stopped selling — and how much cash is stuck in it?
 *  • What needs a label?
 *
 * Dead stock is DERIVED from `products.lastSoldAt` against today, the same way
 * credit status is derived from `dueDate`. A model goes dead at midnight on its
 * ninetieth day with nothing written and nobody notified — so the flag has to
 * be computed at read time or it is wrong by definition.
 */
const TABS = [
  { key: 'STOCK', label: 'inventory.tabStock' },
  { key: 'LOW', label: 'inventory.tabLow' },
  { key: 'DEAD', label: 'inventory.tabDead' },
];

export default function Inventory() {
  const today = useToday();
  const { t } = useLocale();
  // Inventory sums across every colour, so it takes the whole matrix rather
  // than loading variants a model at a time.
  const { products, ensureVariants, loading } = useCatalogue({ allVariants: true });
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('LOC-MAIN');
  const [tab, setTab] = useState('STOCK');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [selected, setSelected] = useState([]);
  const [labelsOpen, setLabelsOpen] = useState(false);

  useEffect(() => subscribeStockLocations(({ data }) => setLocations(data)), []);

  // Variants load for the model being inspected; the totals below fall back to
  // the denormalised counts on the product until they arrive.
  useEffect(() => {
    if (expandedId) ensureVariants(expandedId);
  }, [expandedId, ensureVariants]);

  const assessment = useMemo(
    () => assessInventory(products, { locationId, today }),
    [products, locationId, today],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return assessment.rows;
    return assessment.rows.filter(
      (row) =>
        row.product.modelNo.toLowerCase().includes(term) ||
        (row.product.brand ?? '').toLowerCase().includes(term) ||
        (row.product.material ?? '').toLowerCase().includes(term),
    );
  }, [assessment.rows, search]);

  const { totals } = assessment;

  const bandSegments = STOCK_BANDS.map((band) => ({
    ...band,
    label: t(`inventory.band.${band.key}`),
    range: t(`inventory.bandRange.${band.key}`),
    value: totals.bands[band.key] ?? 0,
  }));

  const toggleVariant = (product, variant) => {
    setSelected((prev) => {
      const index = prev.findIndex(
        (s) => s.product.id === product.id && s.variant.colorCode === variant.colorCode,
      );
      if (index >= 0) return prev.filter((_, i) => i !== index);
      return [...prev, { product, variant }];
    });
  };

  const selectModel = (row) => {
    setSelected((prev) => {
      const without = prev.filter((s) => s.product.id !== row.product.id);
      const all = row.variants.map((variant) => ({ product: row.product, variant }));
      // Toggle: if everything was already picked, clear the model instead.
      return prev.length - without.length === all.length ? without : [...without, ...all];
    });
  };

  /**
   * "Print" on a model row prints that whole model, whatever is ticked
   * elsewhere — the warehouse asked for this model's labels, not for the
   * basket they forgot they had.
   */
  const printModel = async (row) => {
    ensureVariants(row.product.id);
    const variants = row.variants.length ? row.variants : [];
    if (!variants.length) {
      setExpandedId(row.product.id); // variants still loading — open and wait
      return;
    }
    setSelected(variants.map((variant) => ({ product: row.product, variant })));
    setLabelsOpen(true);
  };

  return (
    <>
      <PageHeader
        title={t('inventory.title')}
        subtitle={t('inventory.subtitle', { days: DEAD_STOCK_DAYS })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t('inventory.stockLocation')}
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="h-9 rounded-md border border-line-hair bg-surface px-2 text-xs text-ink-secondary"
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
            <Button
              variant={selected.length ? 'primary' : 'secondary'}
              icon={Tag}
              disabled={!selected.length}
              onClick={() => setLabelsOpen(true)}
            >
              {selected.length
                ? t('inventory.printLabelsCount', { count: selected.length })
                : t('inventory.printLabels')}
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label={t('inventory.statUnits')}
            value={totals.units}
            unit=""
            raw
            icon={Boxes}
            footnote={t('inventory.statModels', { count: totals.modelCount })}
          />
          <StatTile
            label={t('inventory.statCapital')}
            value={totals.costValue}
            icon={Coins}
            footnote={t('inventory.statListValue', {
              amount: fmtMMK(totals.retailValue, { compact: true }),
            })}
          />
          <StatTile
            label={t('inventory.statDead')}
            value={totals.deadValue}
            icon={Skull}
            tone={totals.deadValue > 0 ? 'critical' : 'neutral'}
            footnote={t('inventory.statDeadNote', { count: totals.deadUnits, days: DEAD_STOCK_DAYS })}
          />
          <StatTile
            label={t('inventory.statReorder')}
            value={totals.lowVariantCount + totals.outVariantCount}
            unit=""
            raw
            icon={PackageX}
            tone={totals.outVariantCount > 0 ? 'critical' : 'neutral'}
            footnote={t('inventory.statOutNote', { count: totals.outVariantCount })}
          />
        </div>

        <Card>
          <CardHeader
            title={t('inventory.ageingTitle')}
            subtitle={t('inventory.ageingSub')}
            icon={Warehouse}
          />
          <CardBody>
            <StackedBar
              segments={bandSegments}
              total={totals.costValue}
              ariaLabel={t('inventory.ageingAria')}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t('inventory.catalogueTitle')}
            subtitle={t('inventory.catalogueSub')}
            icon={Boxes}
            action={
              <label className="relative">
                <span className="sr-only">{t('inventory.searchModels')}</span>
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted"
                  aria-hidden="true"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('inventory.searchPlaceholder')}
                  className="h-7 w-full min-w-[9rem] rounded border border-line-hair bg-surface pl-7 pr-2 text-xs text-ink outline-none sm:w-44"
                />
              </label>
            }
          />

          <div className="flex flex-wrap gap-1 border-b border-line-hair px-4 py-2">
            {TABS.map((option) => {
              const count =
                option.key === 'STOCK'
                  ? filtered.length
                  : option.key === 'LOW'
                    ? totals.lowVariantCount + totals.outVariantCount
                    : assessment.deadStock.length;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setTab(option.key)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                    tab === option.key
                      ? 'bg-ink text-plane'
                      : 'text-ink-secondary hover:bg-raised hover:text-ink'
                  }`}
                >
                  {t(option.label)}
                  <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <SkeletonRows rows={6} />
          ) : tab === 'STOCK' ? (
            <StockMatrix
              rows={filtered}
              expandedId={expandedId}
              onToggle={setExpandedId}
              locationId={locationId}
              selected={selected}
              onSelectVariant={toggleVariant}
              onSelectModel={selectModel}
              onPrintModel={printModel}
            />
          ) : tab === 'LOW' ? (
            <LowStockTable
              rows={assessment.lowStock}
              locationId={locationId}
              onPrintModel={printModel}
            />
          ) : (
            <DeadStockTable rows={assessment.deadStock} onPrintModel={printModel} />
          )}
        </Card>
      </div>

      <LabelPrintModal
        open={labelsOpen}
        selection={selected}
        locationId={locationId}
        onClose={() => setLabelsOpen(false)}
      />
    </>
  );
}
