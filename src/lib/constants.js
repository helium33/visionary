/**
 * Yangon townships that carry optical-shop clusters. The canonical
 * district ↔ township mapping lives in `src/constants/districts.js` — this
 * is a thin, alphabetised view over it kept here only because a handful of
 * existing screens (the township filter dropdown, mainly) already import a
 * flat name list from `lib/constants`. Nothing recomputes the mapping; this
 * re-exports it so there is exactly one source of truth for "what district is
 * this township in", not two lists that can drift apart.
 */
export { ALL_TOWNSHIPS as TOWNSHIP_NAMES, getDistrictForTownship } from '../constants/districts';
import { ALL_TOWNSHIPS } from '../constants/districts';

export const YANGON_TOWNSHIPS = ALL_TOWNSHIPS;

export const ROLES = {
  ADMIN: 'ADMIN',
  SALES: 'SALES',
  ACCOUNTANT: 'ACCOUNTANT',
  WAREHOUSE: 'WAREHOUSE',
};

export const ROLE_LABELS = {
  ADMIN: 'Admin',
  SALES: 'Sales rep',
  ACCOUNTANT: 'Accountant',
  WAREHOUSE: 'Warehouse',
};

/**
 * Capability matrix. Firestore security rules are the real enforcement — this
 * table only decides what the UI offers, so the two must be kept in step
 * (see firestore.rules).
 */
export const PERMISSIONS = {
  ADMIN: ['*'],
  SALES: [
    'voucher:create',
    'voucher:read:own',
    'shop:read:own',
    'shop:create',
    'payment:collect',
    'stock:car',
  ],
  ACCOUNTANT: [
    'voucher:read',
    'payment:create',
    'payment:read',
    'creditNote:create',
    'credit:hold',
    'profit:read',
    'expense:write',
  ],
  WAREHOUSE: ['inventory:read', 'inventory:write', 'transfer:create', 'po:read'],
};

export function can(role, permission) {
  const granted = PERMISSIONS[role] ?? [];
  return granted.includes('*') || granted.includes(permission);
}

export const PRICE_TIERS = {
  STANDARD: { key: 'STANDARD', label: 'Standard', discountPct: 0 },
  BULK: { key: 'BULK', label: 'Bulk (>10 pcs)', discountPct: 5 },
  BULK_PLUS: { key: 'BULK_PLUS', label: 'Bulk+ (>50 pcs)', discountPct: 8 },
  VIP: { key: 'VIP', label: 'VIP shop', discountPct: 12 },
};

export const PAYMENT_METHODS = [
  { key: 'CASH', label: 'Cash' },
  { key: 'KBZ_PAY', label: 'KBZPay' },
  { key: 'WAVE_PAY', label: 'WavePay' },
  { key: 'AYA_PAY', label: 'AYA Pay' },
  { key: 'BANK_TRANSFER', label: 'Bank transfer' },
  { key: 'CHEQUE', label: 'Cheque' },
];

export const COMPANY = {
  name: 'Visionary Optical Wholesale',
  nameMM: 'ဗီဇင်နရီ မျက်မှန်လက်ကား',
  address: 'No. 142, 29th Street (Upper Block), Pabedan, Yangon',
  phone: '09-7700-11223',
  viber: '09-7700-11223',
};
