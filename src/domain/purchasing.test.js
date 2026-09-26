import { describe, expect, it } from 'vitest';
import { addDays, subDays } from 'date-fns';
import { openCommitments, poArrivalState, summariseExpenses } from './purchasing';

const TODAY = new Date('2026-09-21T10:00:00+06:30');

describe('poArrivalState', () => {
  it('is quiet about an order that is simply on its way', () => {
    const state = poArrivalState(
      { status: 'IN_TRANSIT', expectedAt: addDays(TODAY, 6).toISOString() },
      TODAY,
    );
    expect(state).toMatchObject({ label: 'In transit', tone: 'neutral', overdue: false, daysUntil: 6 });
  });

  it('raises a shipment that should already have arrived', () => {
    const state = poArrivalState(
      { status: 'IN_TRANSIT', expectedAt: subDays(TODAY, 4).toISOString() },
      TODAY,
    );
    expect(state).toMatchObject({ tone: 'serious', overdue: true, daysLate: 4 });
  });

  it('never calls a received order late, whatever its expected date said', () => {
    const state = poArrivalState(
      { status: 'RECEIVED', expectedAt: subDays(TODAY, 30).toISOString() },
      TODAY,
    );
    expect(state).toMatchObject({ label: 'Received', tone: 'good', overdue: false });
  });

  it('a draft with no expected date is not late', () => {
    expect(poArrivalState({ status: 'DRAFT' }, TODAY)).toMatchObject({
      label: 'Draft',
      overdue: false,
      daysUntil: null,
    });
  });
});

describe('openCommitments', () => {
  const orders = [
    { id: 'a', status: 'RECEIVED', expectedAt: subDays(TODAY, 40).toISOString() },
    { id: 'b', status: 'ORDERED', expectedAt: addDays(TODAY, 21).toISOString() },
    { id: 'c', status: 'IN_TRANSIT', expectedAt: subDays(TODAY, 2).toISOString() },
    { id: 'd', status: 'DRAFT' },
  ];

  it('lists only money already committed, soonest first', () => {
    const rows = openCommitments(orders, TODAY);
    expect(rows.map((r) => r.po.id)).toEqual(['c', 'b']);
    expect(rows[0].arrival.overdue).toBe(true);
  });
});

describe('summariseExpenses', () => {
  const expenses = [
    { id: '1', date: subDays(TODAY, 5).toISOString(), category: 'SALARY', amount: 2_850_000 },
    { id: '2', date: subDays(TODAY, 6).toISOString(), category: 'RENT', amount: 1_200_000 },
    { id: '3', date: subDays(TODAY, 40).toISOString(), category: 'SALARY', amount: 2_800_000 },
    { id: '4', date: subDays(TODAY, 200).toISOString(), category: 'FEES', amount: 90_000 },
    { id: '5', date: 'not a date', category: 'OTHER', amount: 999 },
  ];

  it('totals only what falls inside the window', () => {
    const result = summariseExpenses(expenses, { from: subDays(TODAY, 30), to: TODAY });
    expect(result.total).toBe(4_050_000);
    expect(result.count).toBe(2);
  });

  it('groups by category, largest first', () => {
    const result = summariseExpenses(expenses, { from: subDays(TODAY, 90), to: TODAY });
    expect(result.byCategory.map((c) => c.key)).toEqual(['SALARY', 'RENT']);
    expect(result.byCategory[0]).toMatchObject({ value: 5_650_000, count: 2, label: 'Salaries & commission' });
  });

  it('drops an unparseable date rather than counting it as now', () => {
    const result = summariseExpenses(expenses, { to: TODAY });
    expect(result.rows.some((r) => r.id === '5')).toBe(false);
  });

  it('returns zeros for an empty ledger', () => {
    expect(summariseExpenses([], { to: TODAY })).toMatchObject({ total: 0, count: 0 });
  });
});
