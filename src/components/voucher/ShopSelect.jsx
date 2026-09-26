import { useMemo, useState } from 'react';
import { Ban, KeyRound, Lock, MapPin, Search, ShieldCheck, Store } from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { CREDIT_STATUS } from '../../domain/credit';
import { townshipLabel, townshipMatches } from '../../constants/districts';
import { fmtDate } from '../../lib/dates';
import { fmtMMK } from '../../lib/format';
import { Button } from '../ui/Button';
import { StatusPill } from '../ui/StatusPill';

/**
 * Shop selection, with the credit position attached to every row.
 *
 * A rep should never get three screens into an order before learning the shop
 * is locked, so the status rides the picker itself — and locked shops are shown
 * rather than hidden, because "why can't I sell to them" is information the rep
 * needs in front of the shopkeeper.
 */
export function ShopSelect({ rows, selectedId, onSelect }) {
  const { t, locale } = useLocale();
  const [search, setSearch] = useState('');
  const [browsing, setBrowsing] = useState(false);

  const selected = rows.find(({ shop }) => shop.id === selectedId);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      ({ shop }) =>
        shop.name.toLowerCase().includes(term) ||
        (shop.nameMM ?? '').includes(term) ||
        townshipMatches(shop.township, term),
    );
  }, [rows, search]);

  // Once a shop is chosen the list collapses to a single line. Entry screens
  // are dense and the picker has done its job — but it stays one click away,
  // because reps do pick the wrong shop.
  if (selected && !browsing) {
    const { shop, state } = selected;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line-hair px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Store size={15} className="shrink-0 text-ink-muted" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{shop.name}</p>
            <p className="flex items-center gap-1 text-2xs text-ink-secondary">
              <MapPin size={10} aria-hidden="true" />
              {townshipLabel(shop.township, locale)}
              <span className="text-ink-muted">·</span>
              {t(`labels.priceTier.${shop.priceTier ?? 'STANDARD'}`)}
              <span className="text-ink-muted">·</span>
              {t('vouchers.outstandingShort', { amount: fmtMMK(state.outstanding) })}
            </p>
          </div>
        </div>
        <Button size="sm" variant="quiet" onClick={() => setBrowsing(true)}>
          {t('vouchers.changeShop')}
        </Button>
      </div>
    );
  }


  return (
    <div>
      <label className="relative block">
        <span className="sr-only">{t('vouchers.searchShop')}</span>
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
          aria-hidden="true"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('vouchers.searchShopPlaceholder')}
          className="h-9 w-full rounded-md border border-line-hair bg-surface pl-8 pr-2 text-sm text-ink outline-none"
        />
      </label>

      <ul className="mt-2 max-h-64 divide-y divide-line-hair overflow-y-auto rounded-card border border-line-hair">
        {filtered.map(({ shop, state }) => {
          const active = shop.id === selectedId;
          const locked = state.status === CREDIT_STATUS.LOCKED && !state.override;
          return (
            <li key={shop.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(shop.id);
                  setBrowsing(false);
                }}
                aria-pressed={active}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
                  active ? 'bg-raised' : 'hover:bg-raised'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{shop.name}</p>
                  <p className="flex items-center gap-1 text-2xs text-ink-secondary">
                    <MapPin size={10} aria-hidden="true" />
                    {townshipLabel(shop.township, locale)}
                    <span className="text-ink-muted">·</span>
                    {t(`labels.priceTier.${shop.priceTier ?? 'STANDARD'}`)}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs tabular-nums text-ink">
                    K {fmtMMK(state.outstanding, { compact: true })}
                  </p>
                  {locked ? (
                    <Lock size={11} className="ml-auto text-status-critical" aria-hidden="true" />
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-ink-secondary">{t('vouchers.noShops')}</li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * The gate, rendered. `canIssueVoucher` decides; this only explains the
 * decision and offers the one legitimate way past it.
 */
export function CreditGate({ shop, state, gate, canOverride, onRequestOverride }) {
  const { t, locale } = useLocale();
  if (!shop) return null;

  if (state.override) {
    return (
      <Banner tone="warning" icon={ShieldCheck} title={t('vouchers.overrideActive')}>
        {t('vouchers.overrideBody', { time: fmtDate(state.override.expiresAt, 'HH:mm') })}
      </Banner>
    );
  }

  if (gate.allowed) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-secondary">
        <StatusPill status={state.status} size="sm" />
        <span>
          {state.creditLimit > 0
            ? t('vouchers.outstandingLimit', {
                outstanding: fmtMMK(state.outstanding),
                limit: fmtMMK(state.creditLimit),
                available: fmtMMK(state.availableCredit),
              })
            : t('vouchers.outstandingNoLimit', { outstanding: fmtMMK(state.outstanding) })}
        </span>
      </div>
    );
  }

  return (
    <Banner
      tone="critical"
      icon={gate.code === 'OVER_LIMIT' ? Ban : Lock}
      title={t(gate.code === 'OVER_LIMIT' ? 'vouchers.overLimit' : 'vouchers.shopLocked')}
      action={
        canOverride ? (
          <Button size="sm" variant="danger" icon={KeyRound} onClick={onRequestOverride}>
            {t('vouchers.releaseWithPassword')}
          </Button>
        ) : null
      }
    >
      {gateReasonText(gate, t)}
      {!canOverride ? ` ${t('vouchers.askOffice')}` : ''}
    </Banner>
  );
}

/**
 * The gate's reason in the reader's language, built from its code and
 * figures rather than the English `reason` the domain module carries.
 */
export function gateReasonText(gate, t) {
  const d = gate?.details ?? {};
  switch (gate?.code) {
    case 'MANUAL_HOLD':
      return t('vouchers.gate.MANUAL_HOLD');
    case 'OVERDUE_LOCK':
      return t('vouchers.gate.OVERDUE_LOCK', { days: d.days, term: d.term, amount: fmtMMK(d.amount) });
    case 'OVER_LIMIT':
      return t('vouchers.gate.OVER_LIMIT', { projected: fmtMMK(d.projected), limit: fmtMMK(d.limit) });
    default:
      return gate?.reason ?? null;
  }
}

function Banner({ tone, icon: Icon, title, children, action }) {
  const shell =
    tone === 'critical'
      ? 'border-status-critical/40 bg-wash-critical'
      : 'border-line-hair bg-wash-warning';
  const iconColor = tone === 'critical' ? 'text-status-critical' : 'text-ink';

  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 rounded-card border px-3 py-2.5 ${shell}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon size={16} className={`mt-0.5 shrink-0 ${iconColor}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{title}</p>
          <p className="text-xs text-ink-secondary">{children}</p>
        </div>
      </div>
      {action}
    </div>
  );
}
