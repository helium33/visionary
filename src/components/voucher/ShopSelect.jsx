import { useMemo, useState } from 'react';
import { Ban, KeyRound, Lock, MapPin, Search, ShieldCheck, Store } from 'lucide-react';
import { CREDIT_STATUS } from '../../domain/credit';
import { PRICE_TIERS } from '../../lib/constants';
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
        shop.township.toLowerCase().includes(term),
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
              {shop.township}
              <span className="text-ink-muted">·</span>
              {PRICE_TIERS[shop.priceTier]?.label ?? shop.priceTier}
              <span className="text-ink-muted">·</span>
              K {fmtMMK(state.outstanding)} outstanding
            </p>
          </div>
        </div>
        <Button size="sm" variant="quiet" onClick={() => setBrowsing(true)}>
          Change shop
        </Button>
      </div>
    );
  }


  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Search shop</span>
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
          aria-hidden="true"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search shop or township"
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
                    {shop.township}
                    <span className="text-ink-muted">·</span>
                    {PRICE_TIERS[shop.priceTier]?.label ?? shop.priceTier}
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
          <li className="px-3 py-6 text-center text-xs text-ink-secondary">No shops match.</li>
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
  if (!shop) return null;

  if (state.override) {
    return (
      <Banner tone="warning" icon={ShieldCheck} title="Admin override active">
        Released until {state.override.expiresAt.toLocaleTimeString()}. This voucher will be tagged
        with the override in the audit log.
      </Banner>
    );
  }

  if (gate.allowed) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-secondary">
        <StatusPill status={state.status} size="sm" />
        <span>
          Outstanding K {fmtMMK(state.outstanding)}
          {state.creditLimit > 0
            ? ` of K ${fmtMMK(state.creditLimit)} limit · K ${fmtMMK(state.availableCredit)} available`
            : ' · no credit limit set'}
        </span>
      </div>
    );
  }

  return (
    <Banner
      tone="critical"
      icon={gate.code === 'OVER_LIMIT' ? Ban : Lock}
      title={gate.code === 'OVER_LIMIT' ? 'Over credit limit' : 'Shop is locked'}
      action={
        canOverride ? (
          <Button size="sm" variant="danger" icon={KeyRound} onClick={onRequestOverride}>
            Release with master password
          </Button>
        ) : null
      }
    >
      {gate.reason}
      {!canOverride ? ' Ask the office to release this shop — only an admin can.' : ''}
    </Banner>
  );
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
