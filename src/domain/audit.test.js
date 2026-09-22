import { describe, expect, it } from 'vitest';
import { subDays } from 'date-fns';
import {
  actionMeta,
  describeAuditEntry,
  filterAuditLogs,
  sortAuditLogs,
  summariseAuditActivity,
} from './audit';

const TODAY = new Date('2026-09-22T10:00:00+06:30');

const entry = (overrides = {}) => ({
  id: 'a1',
  actorId: 'u-admin',
  actorName: 'Ma Thida (Owner)',
  actorRole: 'ADMIN',
  action: 'VOUCHER_CREATE',
  entity: 'vouchers',
  entityId: 'VN-001',
  before: null,
  after: { voucherNo: 'VN-001', grandTotal: 250_000 },
  reason: null,
  at: subDays(TODAY, 1).toISOString(),
  clientAt: subDays(TODAY, 1).toISOString(),
  ...overrides,
});

describe('describeAuditEntry', () => {
  it('describes a voucher with its number and amount', () => {
    expect(describeAuditEntry(entry())).toBe('Issued VN-001 for K 250,000');
  });

  it('describes a role change with both roles', () => {
    const result = describeAuditEntry(
      entry({
        action: 'USER_ROLE_CHANGE',
        entity: 'users',
        entityId: 'u-wh',
        before: { role: 'SALES' },
        after: { role: 'WAREHOUSE' },
      }),
    );
    expect(result).toBe('Changed u-wh from Sales rep to Warehouse');
  });

  it('describes a trip that came back short', () => {
    const result = describeAuditEntry(
      entry({ action: 'TRIP_CLOSE', after: { shortPieces: 2, shortValue: 20_000 } }),
    );
    expect(result).toContain('2 pcs short');
    expect(result).toContain('K 20,000');
  });

  it('describes a trip that tied out cleanly, without a false shortage', () => {
    const result = describeAuditEntry(entry({ action: 'TRIP_CLOSE', after: { shortPieces: 0 } }));
    expect(result).toBe('Settled the trip — everything tied out');
  });

  it('falls back to a generic sentence for an unmapped action', () => {
    const result = describeAuditEntry(entry({ action: 'SOMETHING_NEW', entity: 'shops', entityId: 'SH-1' }));
    expect(result).toContain('SH-1');
  });
});

describe('actionMeta', () => {
  it('marks a master-password rotation and an override as critical', () => {
    expect(actionMeta('MASTER_PASSWORD_ROTATE').tone).toBe('critical');
    expect(actionMeta('CREDIT_OVERRIDE').tone).toBe('critical');
  });

  it('never crashes on an unknown action', () => {
    expect(actionMeta(undefined).label).toBeTruthy();
  });
});

describe('filterAuditLogs', () => {
  const entries = [
    entry({ id: 'a', actorId: 'u-admin', action: 'CREDIT_OVERRIDE', at: subDays(TODAY, 1).toISOString() }),
    entry({ id: 'b', actorId: 'u-acct', action: 'PAYMENT_RECORD', at: subDays(TODAY, 40).toISOString() }),
    entry({ id: 'c', actorId: 'u-admin', action: 'VOUCHER_CREATE', entityId: 'VN-777', at: subDays(TODAY, 2).toISOString() }),
  ];

  it('filters by actor', () => {
    expect(filterAuditLogs(entries, { actorId: 'u-acct' })).toHaveLength(1);
  });

  it('filters by action', () => {
    expect(filterAuditLogs(entries, { action: 'CREDIT_OVERRIDE' })).toHaveLength(1);
  });

  it('filters by a date window', () => {
    const result = filterAuditLogs(entries, { from: subDays(TODAY, 10), to: TODAY });
    expect(result.map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('searches the entity id and the rendered description', () => {
    expect(filterAuditLogs(entries, { search: 'VN-777' })).toHaveLength(1);
    expect(filterAuditLogs(entries, { search: 'nothing matches this' })).toHaveLength(0);
  });

  it('combines filters', () => {
    const result = filterAuditLogs(entries, { actorId: 'u-admin', action: 'VOUCHER_CREATE' });
    expect(result.map((e) => e.id)).toEqual(['c']);
  });
});

describe('sortAuditLogs', () => {
  it('sorts newest first', () => {
    const entries = [
      entry({ id: 'old', at: subDays(TODAY, 30).toISOString() }),
      entry({ id: 'new', at: subDays(TODAY, 1).toISOString() }),
    ];
    expect(sortAuditLogs(entries).map((e) => e.id)).toEqual(['new', 'old']);
  });

  it('falls back to clientAt for an offline entry with no server time yet', () => {
    const entries = [
      entry({ id: 'synced', at: subDays(TODAY, 5).toISOString(), clientAt: subDays(TODAY, 5).toISOString() }),
      entry({ id: 'pending', at: null, clientAt: subDays(TODAY, 1).toISOString() }),
    ];
    expect(sortAuditLogs(entries).map((e) => e.id)).toEqual(['pending', 'synced']);
  });
});

describe('summariseAuditActivity', () => {
  it('counts entries per actor and per action, and flags critical actions', () => {
    const entries = [
      entry({ actorName: 'Ma Thida', action: 'CREDIT_OVERRIDE' }),
      entry({ actorName: 'Ma Thida', action: 'VOUCHER_CREATE' }),
      entry({ actorName: 'Daw Sandar', action: 'PAYMENT_RECORD' }),
    ];
    const summary = summariseAuditActivity(entries);
    expect(summary.total).toBe(3);
    expect(summary.criticalCount).toBe(1);
    expect(summary.byActor[0]).toMatchObject({ key: 'Ma Thida', value: 2 });
  });
});
