import { useEffect, useMemo, useState } from 'react';
import { subDays } from 'date-fns';
import { getDistrictForTownship, groupByDistrict } from '../constants/districts';
import { shopPurchaseSummary } from '../domain/shopPurchaseHistory';
import { ROLES } from '../lib/constants';
import { subscribeRecentVouchers, subscribeShops } from '../services/dataSource';
import { useAuth } from '../context/AuthContext';
import { useToday } from './useToday';

/**
 * Shops the signed-in user may see, each paired with a lifetime purchase
 * summary derived from their own vouchers — never the shop document's cached
 * `stats.*` roll-up, which is only a query hint and (as the seeded demo data
 * shows plainly: every demo shop ships with `stats.lifetimeSales: 0`) is not
 * something this screen can trust to be current.
 *
 * `days` bounds the voucher window the same way Reports.jsx already does —
 * "full purchase history" means every sale within that window, not a
 * genuinely unbounded read against an ever-growing collection.
 */
export function useShopsData({ days = 365 * 2 } = {}) {
  const { user } = useAuth();
  const today = useToday();
  const [shops, setShops] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);

  // A sales rep sees only their own shops and vouchers; everyone else sees
  // the whole directory — the same scoping useCreditData.js already uses.
  const salesRepId = user?.role === ROLES.SALES ? user.uid ?? user.id : null;
  const since = useMemo(() => subDays(today, days), [today, days]);

  useEffect(() => {
    if (!user) return undefined;
    setLoading(true);
    let gotShops = false;
    let gotVouchers = false;
    const settle = () => {
      if (gotShops && gotVouchers) setLoading(false);
    };

    const unsubShops = subscribeShops(
      ({ data }) => {
        setShops(data);
        gotShops = true;
        settle();
      },
      salesRepId ? { salesRepId } : {},
    );

    const unsubVouchers = subscribeRecentVouchers(
      ({ data }) => {
        setVouchers(data);
        gotVouchers = true;
        settle();
      },
      { since, salesRepId },
    );

    return () => {
      unsubShops();
      unsubVouchers();
    };
  }, [user, salesRepId, since]);

  const vouchersByShop = useMemo(() => {
    const map = new Map();
    for (const voucher of vouchers) {
      const list = map.get(voucher.shopId) ?? [];
      list.push(voucher);
      map.set(voucher.shopId, list);
    }
    return map;
  }, [vouchers]);

  const rows = useMemo(
    () =>
      shops.map((shop) => ({
        shop,
        district: getDistrictForTownship(shop.township),
        summary: shopPurchaseSummary(vouchersByShop.get(shop.id) ?? []),
      })),
    [shops, vouchersByShop],
  );

  const { buckets, unassigned } = useMemo(
    () => groupByDistrict(rows, (row) => row.shop.township),
    [rows],
  );

  return { rows, buckets, unassigned, vouchersByShop, loading };
}
