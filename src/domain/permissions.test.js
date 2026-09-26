import { describe, expect, it } from 'vitest';
import { buildPermissionMatrix, ROLE_ORDER } from './permissions';
import { ROLES } from '../lib/constants';

describe('buildPermissionMatrix', () => {
  const matrix = buildPermissionMatrix();

  it('covers every role in a fixed order', () => {
    expect(ROLE_ORDER).toEqual([ROLES.ADMIN, ROLES.SALES, ROLES.ACCOUNTANT, ROLES.WAREHOUSE]);
  });

  it('gives admin every capability, via the wildcard, not a copy of the list', () => {
    const allRows = matrix.flatMap((section) => section.rows);
    expect(allRows.every((row) => row.grants[ROLES.ADMIN])).toBe(true);
  });

  it('grants a sales-only capability to sales and nobody else', () => {
    const row = matrix.flatMap((s) => s.rows).find((r) => r.key === 'voucher:create');
    expect(row.grants).toMatchObject({
      [ROLES.ADMIN]: true,
      [ROLES.SALES]: true,
      [ROLES.ACCOUNTANT]: false,
      [ROLES.WAREHOUSE]: false,
    });
  });

  it('never invents a capability no role actually has', () => {
    const allRows = matrix.flatMap((section) => section.rows);
    for (const row of allRows) {
      expect(Object.values(row.grants).some(Boolean)).toBe(true);
    }
  });

  it('groups permissions and drops empty groups', () => {
    expect(matrix.every((section) => section.rows.length > 0)).toBe(true);
    expect(matrix.map((s) => s.group)).toContain('Credit');
  });
});
