import { PERMISSIONS, ROLES } from '../lib/constants';

/**
 * ---------------------------------------------------------------------------
 * THE PERMISSION MATRIX, RENDERED.
 * ---------------------------------------------------------------------------
 * `lib/constants.js#PERMISSIONS` is the single list the app gates on — every
 * `can()` check in every screen reads it. This module only turns that list
 * into something a person can read: grouped by area, one row per capability,
 * one column per role. It adds no new rules and grants nothing on its own; it
 * would be a bug for this file and the security rules to disagree, which is
 * exactly why there is only one source list, not two.
 */

/** Grouping and a human label for each permission key that appears anywhere. */
const PERMISSION_INFO = {
  'voucher:create': { group: 'Vouchers', label: 'Create vouchers' },
  'voucher:read': { group: 'Vouchers', label: 'View all vouchers' },
  'voucher:read:own': { group: 'Vouchers', label: 'View own vouchers' },
  'shop:create': { group: 'Shops', label: 'Add shops' },
  'shop:read': { group: 'Shops', label: 'View all shops' },
  'shop:read:own': { group: 'Shops', label: 'View own shops' },
  'shop:update': { group: 'Shops', label: 'Edit any shop' },
  'shop:update:own': { group: 'Shops', label: 'Edit own shops' },
  'payment:collect': { group: 'Credit', label: 'Collect a payment' },
  'payment:create': { group: 'Credit', label: 'Record any payment' },
  'payment:read': { group: 'Credit', label: 'View payments' },
  'creditNote:create': { group: 'Credit', label: 'Issue credit notes' },
  'credit:hold': { group: 'Credit', label: 'Place a manual credit hold' },
  'stock:car': { group: 'Inventory', label: 'Load & reconcile car stock' },
  'inventory:read': { group: 'Inventory', label: 'View inventory' },
  'inventory:write': { group: 'Inventory', label: 'Adjust stock' },
  'transfer:create': { group: 'Inventory', label: 'Transfer stock between locations' },
  'po:read': { group: 'Purchasing', label: 'View purchase orders' },
  'profit:read': { group: 'Reports', label: 'View profit & commission reports' },
  'expense:write': { group: 'Purchasing', label: 'Record general expenses' },
};

const GROUP_ORDER = ['Vouchers', 'Shops', 'Credit', 'Inventory', 'Purchasing', 'Reports'];

export const ROLE_ORDER = [ROLES.ADMIN, ROLES.SALES, ROLES.ACCOUNTANT, ROLES.WAREHOUSE];

/**
 * Every permission key that appears on any role, deduplicated, so a key added
 * to one role's list is never silently missing from the printed matrix. Admin
 * carries `'*'` rather than the full list — it is expanded into "every key
 * that exists anywhere else" so the matrix has something to check off.
 */
function allPermissionKeys() {
  const keys = new Set();
  for (const role of ROLE_ORDER) {
    for (const key of PERMISSIONS[role] ?? []) {
      if (key !== '*') keys.add(key);
    }
  }
  return [...keys];
}

/**
 * @returns {{ group: string, rows: { key, label, grants: Record<role, boolean> }[] }[]}
 */
export function buildPermissionMatrix() {
  const keys = allPermissionKeys();
  const groups = new Map(GROUP_ORDER.map((name) => [name, []]));

  for (const key of keys) {
    const info = PERMISSION_INFO[key] ?? { group: 'Other', label: key };
    if (!groups.has(info.group)) groups.set(info.group, []);
    groups.get(info.group).push({
      key,
      label: info.label,
      grants: Object.fromEntries(
        ROLE_ORDER.map((role) => [
          role,
          (PERMISSIONS[role] ?? []).includes('*') || (PERMISSIONS[role] ?? []).includes(key),
        ]),
      ),
    });
  }

  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 0)
    .map(([group, rows]) => ({
      group,
      rows: rows.sort((a, b) => a.label.localeCompare(b.label)),
    }));
}
