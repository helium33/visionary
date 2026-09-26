import { describe, expect, it } from 'vitest';
import { sortRows } from './sortRows';

const ts = (ms) => ({ toMillis: () => ms });

describe('sortRows', () => {
  it('orders strings ascending and descending', () => {
    const rows = [{ m: 'B2' }, { m: 'A1' }, { m: 'C3' }];
    expect(sortRows(rows, 'm').map((r) => r.m)).toEqual(['A1', 'B2', 'C3']);
    expect(sortRows(rows, 'm', 'desc').map((r) => r.m)).toEqual(['C3', 'B2', 'A1']);
  });

  it('orders Firestore timestamps and Dates by time', () => {
    const rows = [{ id: 'mid', at: ts(200) }, { id: 'old', at: new Date(100) }, { id: 'new', at: ts(300) }];
    expect(sortRows(rows, 'at', 'desc').map((r) => r.id)).toEqual(['new', 'mid', 'old']);
  });

  it('drops rows missing the field, as orderBy does', () => {
    const rows = [{ id: 'a', due: 2 }, { id: 'no-field' }, { id: 'b', due: 1 }];
    expect(sortRows(rows, 'due').map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('keeps nulls: first ascending, last descending', () => {
    const rows = [{ id: 'x', v: 5 }, { id: 'n', v: null }, { id: 'y', v: 1 }];
    expect(sortRows(rows, 'v').map((r) => r.id)).toEqual(['n', 'y', 'x']);
    expect(sortRows(rows, 'v', 'desc').map((r) => r.id)).toEqual(['x', 'y', 'n']);
  });

  it('does not mutate its input', () => {
    const rows = [{ v: 2 }, { v: 1 }];
    sortRows(rows, 'v');
    expect(rows.map((r) => r.v)).toEqual([2, 1]);
  });
});
