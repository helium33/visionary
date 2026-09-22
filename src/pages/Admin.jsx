import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileText, KeyRound, ShieldQuestion, Users as UsersIcon } from 'lucide-react';
import { summariseAuditActivity } from '../domain/audit';
import { subscribeAuditLogs, subscribeUsers } from '../services/dataSource';
import { useAuth } from '../context/AuthContext';
import { useToday } from '../hooks/useToday';
import { AuditLogTable } from '../components/admin/AuditLogTable';
import { MasterPasswordCard } from '../components/admin/MasterPasswordCard';
import { RoleMatrix } from '../components/admin/RoleMatrix';
import { UsersTable } from '../components/admin/UsersTable';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState, SkeletonRows } from '../components/ui/EmptyState';
import { StatTile } from '../components/ui/StatTile';
import { PageHeader } from '../components/layout/AppShell';

const TABS = [
  { key: 'USERS', label: 'Users & roles' },
  { key: 'AUDIT', label: 'Audit log' },
];

/**
 * ===========================================================================
 * USERS & AUDIT
 * ===========================================================================
 * Two things live here because they are both about trust rather than about
 * the day-to-day business: who is allowed to do what, and a record of what
 * they actually did.
 *
 * The audit entries are not fetched specially — every service module in this
 * app already calls `logAudit` on the writes that matter (a voucher, a
 * payment, an override, a received PO, a settled trip, a role change). This
 * page is the first place that reads them back.
 */
export default function Admin() {
  const { user, isDemoMode } = useAuth();
  const today = useToday();
  const [tab, setTab] = useState('USERS');
  const [users, setUsers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let gotUsers = false;
    let gotAudit = false;
    const settle = () => {
      if (gotUsers && gotAudit) setLoading(false);
    };
    const unsubUsers = subscribeUsers(({ data }) => {
      setUsers(data);
      gotUsers = true;
      settle();
    });
    const unsubAudit = subscribeAuditLogs(({ data }) => {
      setEntries(data);
      gotAudit = true;
      settle();
    });
    return () => {
      unsubUsers();
      unsubAudit();
    };
  }, []);

  const activity = useMemo(() => summariseAuditActivity(entries), [entries]);
  const activeCount = users.filter((u) => u.active !== false).length;

  if (user?.role !== 'ADMIN') {
    return (
      <>
        <PageHeader title="Users & audit" />
        <Card>
          <CardBody>
            <EmptyState
              icon={ShieldQuestion}
              title="Admins only"
              description="Ask an admin to make this change, or to grant you the admin role from this same screen."
            />
          </CardBody>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Users & audit"
        subtitle={isDemoMode ? 'Demo mode — edits here last for this session only' : undefined}
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Active users" value={activeCount} unit="" raw icon={UsersIcon} footnote={`${users.length} total`} />
          <StatTile
            label="Audit entries"
            value={activity.total}
            unit=""
            raw
            icon={FileText}
            footnote="all time, append-only"
          />
          <StatTile
            label="Sensitive actions"
            value={activity.criticalCount}
            unit=""
            raw
            icon={AlertTriangle}
            tone={activity.criticalCount > 0 ? 'critical' : 'neutral'}
            footnote="overrides, holds, role & password changes"
          />
          <StatTile
            label="Most active"
            value={activity.byActor[0]?.key ?? '—'}
            unit=""
            raw
            icon={KeyRound}
            footnote={activity.byActor[0] ? `${activity.byActor[0].value} entries` : 'nothing yet'}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            <Card>
              <div className="flex flex-wrap gap-1 border-b border-line-hair px-4 py-2">
                {TABS.map((option) => (
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
                    {option.label}
                    <span className="ml-1.5 tabular-nums opacity-70">
                      {option.key === 'USERS' ? users.length : entries.length}
                    </span>
                  </button>
                ))}
              </div>

              {loading ? (
                <SkeletonRows rows={5} />
              ) : tab === 'USERS' ? (
                <UsersTable users={users} />
              ) : (
                <AuditLogTable entries={entries} actors={users} today={today} />
              )}
            </Card>

            {tab === 'USERS' ? (
              <Card>
                <CardHeader
                  title="What each role can do"
                  subtitle="The same list the security rules enforce — this screen never grants anything on its own"
                  icon={ShieldQuestion}
                />
                <RoleMatrix />
              </Card>
            ) : null}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Master password" icon={KeyRound} />
              <CardBody>
                <MasterPasswordCard />
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
