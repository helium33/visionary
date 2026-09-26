import { useEffect, useMemo, useState } from 'react';
import { MapPin, Plus, Search, Store } from 'lucide-react';
import { DISTRICT_ORDER, districtLabel, townshipLabel, townshipMatches } from '../constants/districts';
import { PRICE_TIERS, ROLES } from '../lib/constants';
import { fmtDate } from '../lib/dates';
import { fmtMMK } from '../lib/format';
import { subscribeUsers } from '../services/dataSource';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useShopsData } from '../hooks/useShopsData';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState, SkeletonRows } from '../components/ui/EmptyState';
import { StatTile } from '../components/ui/StatTile';
import { ShopFormModal } from '../components/shops/ShopFormModal';
import { ShopProfilePanel } from '../components/shops/ShopProfilePanel';
import { PageHeader } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';

const DISTRICT_FILTERS = ['ALL', ...DISTRICT_ORDER];

function canManageShop(user, shop) {
  if (!user) return false;
  if (user.role === ROLES.ADMIN || user.role === ROLES.ACCOUNTANT) return true;
  if (user.role === ROLES.SALES) return shop.salesRepId === (user.uid ?? user.id);
  return false;
}

/**
 * ===========================================================================
 * SHOPS & TOWNSHIPS — the directory itself, not its analytics.
 * ===========================================================================
 * Reports' Shops & townships tab already answers "how are districts and
 * townships performing" with charts; this page answers "who is this shop,
 * what have they bought, and what are their terms" — a directory and a
 * profile, not a second dashboard. District rollups here are a grouped list,
 * not Recharts, on purpose: the two pages would otherwise duplicate the same
 * visualisation for two different jobs.
 */
export default function Shops() {
  const { user, can } = useAuth();
  const { t, locale } = useLocale();
  const { rows, vouchersByShop, loading } = useShopsData();
  const [district, setDistrict] = useState('ALL');
  const [search, setSearch] = useState('');
  const [reps, setReps] = useState([]);
  const [dialog, setDialog] = useState(null); // 'add' | 'edit' | 'profile'
  const [selected, setSelected] = useState(null); // { shop, vouchers }

  useEffect(() => {
    return subscribeUsers(({ data }) => setReps(data.filter((u) => u.role === ROLES.SALES)));
  }, []);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(({ shop, district: rowDistrict }) => {
      if (district !== 'ALL' && rowDistrict !== district) return false;
      if (!term) return true;
      return (
        shop.name.toLowerCase().includes(term) ||
        (shop.nameMM ?? '').includes(term) ||
        (shop.code ?? '').toLowerCase().includes(term) ||
        townshipMatches(shop.township, term)
      );
    });
  }, [rows, district, search]);

  // Grouped by township within the filtered set — the "township grouping"
  // the module scope asks for, without re-deriving district: each row
  // already carries it from useShopsData.
  const byTownship = useMemo(() => {
    const groups = new Map();
    for (const row of filteredRows) {
      const list = groups.get(row.shop.township) ?? [];
      list.push(row);
      groups.set(row.shop.township, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredRows]);

  const totals = useMemo(
    () => ({
      shops: rows.length,
      lifetimeRevenue: rows.reduce((sum, r) => sum + r.summary.revenue, 0),
      withBalance: rows.filter((r) => (r.shop.credit?.outstanding ?? 0) > 0).length,
    }),
    [rows],
  );

  const openProfile = (row) => {
    setSelected(row);
    setDialog('profile');
  };
  const openEdit = (shop) => {
    const row = rows.find((r) => r.shop.id === shop.id);
    setSelected(row ?? { shop });
    setDialog('edit');
  };
  const close = () => setDialog(null);

  return (
    <>
      <PageHeader
        title={t('shops.title')}
        subtitle={t('shops.subtitle', {
          count: totals.shops,
          amount: fmtMMK(totals.lifetimeRevenue, { compact: true }),
        })}
        actions={
          can('shop:create') ? (
            <Button variant="primary" icon={Plus} onClick={() => setDialog('add')}>
              {t('shops.addShop')}
            </Button>
          ) : null
        }
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label={t('shops.statShops')} value={totals.shops} raw unit="" icon={Store} />
          <StatTile
            label={t('shops.statLifetime')}
            value={totals.lifetimeRevenue}
            icon={MapPin}
            footnote={t('shops.statLifetimeNote')}
          />
          <StatTile
            label={t('shops.statBalance')}
            value={totals.withBalance}
            raw
            unit=""
            tone={totals.withBalance > 0 ? 'serious' : 'neutral'}
          />
        </div>

        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-line-hair p-3">
            <label className="relative flex-1 sm:max-w-xs">
              <span className="sr-only">{t('shops.searchLabel')}</span>
              <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('shops.searchPlaceholder')}
                className="h-8 w-full rounded border border-line-hair bg-surface pl-7 pr-2 text-xs text-ink outline-none"
              />
            </label>
            <div className="flex flex-wrap gap-1">
              {DISTRICT_FILTERS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDistrict(key)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                    district === key ? 'bg-ink text-plane' : 'text-ink-secondary hover:bg-raised hover:text-ink'
                  }`}
                >
                  {key === 'ALL' ? t('common.allDistricts') : districtLabel(key, locale)}
                </button>
              ))}
            </div>
          </div>

          <CardBody>
            {loading ? (
              <SkeletonRows rows={6} />
            ) : filteredRows.length === 0 ? (
              <EmptyState icon={Store} title={t('shops.noMatch')} description={t('shops.noMatchHint')} />
            ) : (
              <div className="space-y-5">
                {byTownship.map(([township, townRows]) => (
                  <div key={township}>
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-secondary">
                      <MapPin size={12} aria-hidden="true" />
                      {townshipLabel(township, locale)}
                      <span className="tabular-nums text-ink-muted">· {townRows.length}</span>
                    </h3>
                    <div className="rounded-card border border-line-hair">
                      {/* Phone layout — a card per shop, not a wide table scrolled sideways. */}
                      <ul className="divide-y divide-line-hair lg:hidden">
                        {townRows.map(({ shop, summary }) => (
                          <li key={shop.id}>
                            <button
                              type="button"
                              onClick={() => openProfile({ shop, vouchers: vouchersByShop.get(shop.id) ?? [] })}
                              className="block w-full px-3 py-2.5 text-left hover:bg-raised"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-ink">{shop.name}</p>
                                  <p className="text-2xs text-ink-secondary">{shop.code} · {shop.ownerName}</p>
                                </div>
                                <p className="shrink-0 text-right font-medium tabular-nums text-ink">
                                  K {fmtMMK(summary.revenue, { compact: true })}
                                </p>
                              </div>
                              <div className="mt-1.5 flex items-center justify-between gap-3 text-2xs text-ink-secondary">
                                <span>{tierLabel(shop, t)}</span>
                                <span>
                                  {voucherCount(summary.voucherCount, t)} ·{' '}
                                  {summary.lastPurchaseAt
                                    ? fmtDate(summary.lastPurchaseAt, 'dd MMM yyyy')
                                    : t('shops.noPurchasesYetInline')}
                                </span>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>

                      <div className="hidden overflow-x-auto lg:block">
                        <table className="w-full text-sm">
                          <tbody>
                            {townRows.map(({ shop, summary }) => (
                              <tr
                                key={shop.id}
                                onClick={() => openProfile({ shop, vouchers: vouchersByShop.get(shop.id) ?? [] })}
                                className="cursor-pointer border-b border-line-hair last:border-0 hover:bg-raised"
                              >
                                <td className="px-3 py-2.5">
                                  <p className="font-medium text-ink">{shop.name}</p>
                                  <p className="text-2xs text-ink-secondary">{shop.code} · {shop.ownerName}</p>
                                </td>
                                <td className="px-3 py-2.5 text-xs text-ink-secondary">{tierLabel(shop, t)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums text-ink-secondary">
                                  {voucherCount(summary.voucherCount, t)}
                                </td>
                                <td className="px-3 py-2.5 text-right text-xs text-ink-secondary">
                                  {summary.lastPurchaseAt
                                    ? fmtDate(summary.lastPurchaseAt, 'dd MMM yyyy')
                                    : t('shops.noPurchasesYet')}
                                </td>
                                <td className="px-3 py-2.5 text-right font-medium tabular-nums text-ink">
                                  K {fmtMMK(summary.revenue, { compact: true })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <ShopFormModal
        open={dialog === 'add' || dialog === 'edit'}
        shop={dialog === 'edit' ? selected?.shop : null}
        reps={reps}
        onClose={close}
        onSaved={close}
      />

      <ShopProfilePanel
        open={dialog === 'profile'}
        shop={selected?.shop}
        vouchers={selected?.vouchers ?? []}
        canEdit={selected ? canManageShop(user, selected.shop) : false}
        onClose={close}
        onEdit={openEdit}
      />
    </>
  );
}

function tierLabel(shop, t) {
  return t(`labels.priceTier.${(PRICE_TIERS[shop.priceTier] ?? PRICE_TIERS.STANDARD).key}`);
}

function voucherCount(count, t) {
  return t(count === 1 ? 'charts.voucherOne' : 'charts.voucherMany', { count });
}
