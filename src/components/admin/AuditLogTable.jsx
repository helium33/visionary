import { useMemo, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import { subDays } from 'date-fns';
import { actionMeta, describeAuditEntry, entityLabel, filterAuditLogs, sortAuditLogs } from '../../domain/audit';
import { fmtDateTime } from '../../lib/dates';
import { EmptyState } from '../ui/EmptyState';
import { StatusPill } from '../ui/StatusPill';

const PERIODS = [
  { key: 7, label: '7 days' },
  { key: 30, label: '30 days' },
  { key: 90, label: '90 days' },
  { key: 0, label: 'All time' },
];

/**
 * The audit trail. Nothing here can be edited or deleted — not by this screen
 * and not by the security rules (`allow update, delete: if false`, admins
 * included) — so what filters to is exactly what happened, in the order it
 * happened.
 */
export function AuditLogTable({ entries, actors, today }) {
  const [days, setDays] = useState(30);
  const [actorId, setActorId] = useState('ALL');
  const [action, setAction] = useState('ALL');
  const [search, setSearch] = useState('');

  const actions = useMemo(
    () => [...new Set(entries.map((e) => e.action))].sort(),
    [entries],
  );

  const from = days > 0 ? subDays(today, days) : null;

  // No upper bound: `today` only refreshes at day-rollover (see useToday), so
  // capping the window at it would hide an entry logged seconds ago — exactly
  // wrong for a screen meant to show activity as it happens. Nothing is ever
  // dated later than "now" anyway, so `from` alone is enough to scope the
  // window; `today` still sets where that window starts.
  const rows = useMemo(
    () =>
      sortAuditLogs(
        filterAuditLogs(entries, {
          actorId: actorId === 'ALL' ? null : actorId,
          action: action === 'ALL' ? null : action,
          from,
          search,
        }),
      ),
    [entries, actorId, action, from, search],
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line-hair px-4 py-2.5">
        <div className="flex gap-1 rounded-md border border-line-hair p-0.5 text-xs">
          {PERIODS.map((period) => (
            <button
              key={period.key}
              type="button"
              onClick={() => setDays(period.key)}
              aria-pressed={days === period.key}
              className={`rounded px-2 py-1 font-medium transition ${
                days === period.key ? 'bg-ink text-plane' : 'text-ink-secondary hover:bg-raised'
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>

        <select
          aria-label="Filter by actor"
          value={actorId}
          onChange={(e) => setActorId(e.target.value)}
          className="h-7 rounded border border-line-hair bg-surface px-2 text-xs text-ink-secondary"
        >
          <option value="ALL">Everyone</option>
          {actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="h-7 rounded border border-line-hair bg-surface px-2 text-xs text-ink-secondary"
        >
          <option value="ALL">Every action</option>
          {actions.map((key) => (
            <option key={key} value={key}>
              {actionMeta(key).label}
            </option>
          ))}
        </select>

        <label className="relative ml-auto">
          <span className="sr-only">Search the audit log</span>
          <Search
            size={13}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="h-7 w-full min-w-[8rem] rounded border border-line-hair bg-surface pl-7 pr-2 text-xs text-ink outline-none sm:w-40"
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nothing matches"
          description="Try a wider date range or a different filter."
        />
      ) : (
        <>
          <ul className="divide-y divide-line-hair lg:hidden">
            {rows.map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </ul>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line-hair text-left text-2xs text-ink-secondary">
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Who</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">What happened</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  const meta = actionMeta(entry.action);
                  return (
                    <tr key={entry.id} className="border-b border-line-hair last:border-0 hover:bg-raised">
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-secondary">
                        {fmtDateTime(entry.at ?? entry.clientAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <p className="text-ink">{entry.actorName}</p>
                        <p className="text-2xs text-ink-secondary">{entry.actorRole}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <StatusPill tone={meta.tone} label={meta.label} size="sm" />
                      </td>
                      <td className="px-3 py-2.5 text-ink">
                        {describeAuditEntry(entry)}
                        {entry.reason ? (
                          <p className="mt-0.5 text-2xs text-ink-secondary">&ldquo;{entry.reason}&rdquo;</p>
                        ) : null}
                        <p className="mt-0.5 text-2xs text-ink-muted">
                          {entityLabel(entry.entity)} · {entry.entityId}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function EntryCard({ entry }) {
  const meta = actionMeta(entry.action);
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{entry.actorName}</p>
          <p className="text-2xs text-ink-secondary">{fmtDateTime(entry.at ?? entry.clientAt)}</p>
        </div>
        <StatusPill tone={meta.tone} label={meta.label} size="sm" />
      </div>
      <p className="mt-1.5 text-sm text-ink">{describeAuditEntry(entry)}</p>
      {entry.reason ? (
        <p className="mt-0.5 text-2xs text-ink-secondary">&ldquo;{entry.reason}&rdquo;</p>
      ) : null}
      <p className="mt-0.5 text-2xs text-ink-muted">
        {entityLabel(entry.entity)} · {entry.entityId}
      </p>
    </li>
  );
}
