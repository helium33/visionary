import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Package, Plus, Search } from 'lucide-react';
import { subDays } from 'date-fns';
import { ageVoucher } from '../domain/credit';
import { subscribeRecentVouchers } from '../services/dataSource';
import { fmtDate } from '../lib/dates';
import { fmtMMK } from '../lib/format';
import { useToday } from '../hooks/useToday';
import { DueMeter } from '../components/credit/DueMeter';
import { Card, CardHeader } from '../components/ui/Card';
import { EmptyState, SkeletonRows } from '../components/ui/EmptyState';
import { StatusPill } from '../components/ui/StatusPill';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/layout/AppShell';

const STATUS_TONE = {
  ISSUED: ['warning', 'Issued'],
  PARTIAL: ['warning', 'Part paid'],
  PAID: ['good', 'Paid'],
  CONSIGNED: ['neutral', 'Consignment'],
  VOID: ['neutral', 'Void'],
};

export default function VoucherList() {
  const today = useToday();
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    const since = subDays(new Date(), 90);
    return subscribeRecentVouchers(
      ({ data }) => {
        setVouchers(data);
        setLoading(false);
      },
      { since },
    );
  }, []);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return vouchers
      .filter((v) => (filter === 'ALL' ? true : filter === 'OPEN' ? v.balanceDue > 0 : v.type === filter))
      .filter((v) =>
        term
          ? v.voucherNo.toLowerCase().includes(term) || (v.shopName ?? '').toLowerCase().includes(term)
          : true,
      )
      .sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate));
  }, [vouchers, search, filter]);

  return (
    <>
      <PageHeader
        title="Vouchers"
        subtitle="Last 90 days"
        actions={
          <Link to="/vouchers/new">
            <Button variant="primary" icon={Plus}>
              New voucher
            </Button>
          </Link>
        }
      />

      <Card>
        <CardHeader
          title="Recent vouchers"
          icon={FileText}
          action={
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <label className="relative">
                <span className="sr-only">Search vouchers</span>
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted"
                  aria-hidden="true"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Voucher or shop"
                  className="h-7 w-full min-w-[9rem] rounded border border-line-hair bg-surface pl-7 pr-2 text-xs text-ink outline-none sm:w-40"
                />
              </label>
            </div>
          }
        />

        <div className="flex flex-wrap gap-1 border-b border-line-hair px-4 py-2">
          {[
            ['ALL', 'All'],
            ['OPEN', 'Unpaid'],
            ['SALE', 'Sales'],
            ['CONSIGNMENT', 'Consignment'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                filter === key ? 'bg-ink text-plane' : 'text-ink-secondary hover:bg-raised hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <SkeletonRows rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No vouchers match"
            description="Try a different filter, or issue a new voucher."
          />
        ) : (
          <>
          {/* Phone: cards, so the amount is never scrolled off the right edge. */}
          <ul className="divide-y divide-line-hair lg:hidden">
            {rows.map((voucher) => {
              const [tone, label] = STATUS_TONE[voucher.status] ?? ['neutral', voucher.status];
              const aging = voucher.balanceDue > 0 ? ageVoucher(voucher, today) : null;
              return (
                <li key={voucher.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{voucher.shopName}</p>
                      <p className="text-2xs tabular-nums text-ink-secondary">
                        {voucher.voucherNo} · {fmtDate(voucher.issueDate, 'dd MMM')}
                      </p>
                    </div>
                    <StatusPill tone={tone} label={label} size="sm" />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    {aging ? <DueMeter aging={aging} /> : <span className="text-2xs text-ink-muted">Settled</span>}
                    <p className="text-right text-sm tabular-nums text-ink">
                      {voucher.balanceDue > 0 ? (
                        <>
                          <span className="font-medium">K {fmtMMK(voucher.balanceDue)}</span>
                          <span className="block text-2xs text-ink-secondary">
                            of K {fmtMMK(voucher.grandTotal)}
                          </span>
                        </>
                      ) : (
                        <span className="text-ink-secondary">K {fmtMMK(voucher.grandTotal)}</span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line-hair text-left text-xs text-ink-secondary">
                  <th className="px-4 py-2 font-medium">Voucher</th>
                  <th className="px-3 py-2 font-medium">Shop</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">14-day term</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((voucher) => {
                  const [tone, label] = STATUS_TONE[voucher.status] ?? ['neutral', voucher.status];
                  const aging = voucher.balanceDue > 0 ? ageVoucher(voucher, today) : null;
                  return (
                    <tr key={voucher.id} className="border-b border-line-hair last:border-0 hover:bg-raised">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <p className="tabular-nums text-ink">{voucher.voucherNo}</p>
                        <p className="text-2xs text-ink-muted">
                          {fmtDate(voucher.issueDate, 'dd MMM')}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="truncate text-ink">{voucher.shopName}</p>
                        <p className="text-2xs text-ink-secondary">{voucher.township}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <StatusPill tone={tone} label={label} size="sm" />
                      </td>
                      <td className="px-3 py-2.5">
                        {aging ? (
                          <DueMeter aging={aging} />
                        ) : (
                          <span className="text-2xs text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-secondary">
                        {fmtMMK(voucher.grandTotal)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums text-ink">
                        {voucher.balanceDue > 0 ? fmtMMK(voucher.balanceDue) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </>
  );
}
