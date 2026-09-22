import { useMemo, useState } from 'react';
import { Landmark, Map, Package, Trophy } from 'lucide-react';
import { districtSales, leadingDistrict, topShops, townshipSales } from '../../domain/townshipAnalytics';
import { DISTRICT_ORDER, districtLabel } from '../../constants/districts';
import { useLocale } from '../../context/LocaleContext';
import { DistrictBarChart, TopShopsChart, TownshipDrilldownChart } from './TownshipCharts';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { SkeletonRows } from '../ui/EmptyState';

/**
 * Shops & Townships tab — district → township → shop, each rollup DERIVED
 * from the same voucher window Reports.jsx already fetched for the Profit
 * tab (see domain/townshipAnalytics.js). Nothing here queries Firestore a
 * second time; a period change on the Profit tab's selector reruns every
 * chart here too, because both tabs share one `[from, today]` window.
 */
export function ShopsTownshipsReport({ vouchers, from, to, loading }) {
  const { t, locale } = useLocale();
  const [district, setDistrict] = useState(null);

  const { rows: districtRows } = useMemo(
    () => districtSales(vouchers, { from, to }),
    [vouchers, from, to],
  );

  const activeDistrict = district ?? leadingDistrict(districtRows);

  const townshipRows = useMemo(
    () => townshipSales(vouchers, activeDistrict, { from, to }),
    [vouchers, activeDistrict, from, to],
  );

  const shopRows = useMemo(
    () => topShops(vouchers, { limit: 10, from, to }),
    [vouchers, from, to],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('reports.districtTitle')} subtitle={t('reports.districtSub')} icon={Map} />
          <CardBody>
            {loading ? (
              <SkeletonRows rows={4} />
            ) : (
              <DistrictBarChart
                rows={districtRows}
                metric="revenue"
                locale={locale}
                emptyLabel={t('common.noData')}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t('reports.districtVolumeTitle')}
            subtitle={t('reports.districtVolumeSub')}
            icon={Package}
          />
          <CardBody>
            {loading ? (
              <SkeletonRows rows={4} />
            ) : (
              <DistrictBarChart
                rows={districtRows}
                metric="volume"
                locale={locale}
                emptyLabel={t('common.noData')}
              />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t('reports.townshipTitle')}
          subtitle={t('reports.townshipSub')}
          icon={Landmark}
          action={
            <label className="flex items-center gap-2 text-xs text-ink-secondary">
              <span className="sr-only">{t('reports.selectDistrict')}</span>
              <select
                aria-label={t('reports.selectDistrict')}
                value={activeDistrict}
                onChange={(e) => setDistrict(e.target.value)}
                className="h-7 rounded border border-line-hair bg-surface px-2 text-xs text-ink-secondary"
              >
                {DISTRICT_ORDER.map((key) => (
                  <option key={key} value={key}>
                    {districtLabel(key, locale)}
                  </option>
                ))}
              </select>
            </label>
          }
        />
        <CardBody>
          {loading ? (
            <SkeletonRows rows={6} />
          ) : (
            <TownshipDrilldownChart rows={townshipRows} emptyLabel={t('common.noData')} />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('reports.topShopsTitle')} subtitle={t('reports.topShopsSub')} icon={Trophy} />
        <CardBody>
          {loading ? (
            <SkeletonRows rows={6} />
          ) : (
            <TopShopsChart rows={shopRows} ordersLabel={t('common.orders')} emptyLabel={t('common.noData')} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
