import { useEffect, useMemo, useState } from 'react';
import { ROLES } from '../lib/constants';
import { evaluatePortfolio } from '../domain/credit';
import { subscribeOpenVouchers, subscribeShops } from '../services/dataSource';
import { useAuth } from '../context/AuthContext';
import { useToday } from './useToday';

/**
 * Streams the shops and open vouchers this user may see, then derives the whole
 * credit portfolio from them.
 *
 * The derivation is deliberately client-side: it works identically against
 * fresh server data and against the offline cache, so a rep's phone in a
 * basement shophouse computes the same lock decisions the office sees.
 */
export function useCreditData() {
  const { user } = useAuth();
  const today = useToday();
  const [shops, setShops] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sync, setSync] = useState({ pendingWrites: false, fromCache: false });
  const [error, setError] = useState(null);

  // A sales rep sees only their own shops; everyone else sees the portfolio.
  const scope = user?.role === ROLES.SALES ? { salesRepId: user.uid ?? user.id } : {};
  const scopeKey = scope.salesRepId ?? 'ALL';

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
      scope,
      setError,
    );

    const unsubVouchers = subscribeOpenVouchers(
      ({ data, pendingWrites, fromCache }) => {
        setVouchers(data);
        setSync({ pendingWrites, fromCache });
        gotVouchers = true;
        settle();
      },
      scope,
      setError,
    );

    return () => {
      unsubShops();
      unsubVouchers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, user?.role]);

  const portfolio = useMemo(
    () => evaluatePortfolio(shops, vouchers, today),
    [shops, vouchers, today],
  );

  const vouchersByShop = useMemo(() => {
    const map = new Map();
    for (const voucher of vouchers) {
      if (!map.has(voucher.shopId)) map.set(voucher.shopId, []);
      map.get(voucher.shopId).push(voucher);
    }
    return map;
  }, [vouchers]);

  return { shops, vouchers, vouchersByShop, portfolio, loading, sync, error, today };
}
