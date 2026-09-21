/** Yangon townships that carry optical-shop clusters, grouped by district. */
export const YANGON_TOWNSHIPS = [
  { code: 'LAT', name: 'Latha', district: 'Western' },
  { code: 'PAZ', name: 'Pabedan', district: 'Western' },
  { code: 'KTD', name: 'Kyauktada', district: 'Western' },
  { code: 'LNM', name: 'Lanmadaw', district: 'Western' },
  { code: 'AHL', name: 'Ahlone', district: 'Western' },
  { code: 'KMY', name: 'Kamayut', district: 'Western' },
  { code: 'SCG', name: 'Sanchaung', district: 'Western' },
  { code: 'HLG', name: 'Hlaing', district: 'Western' },
  { code: 'MTN', name: 'Mingala Taung Nyunt', district: 'Eastern' },
  { code: 'BTG', name: 'Botataung', district: 'Eastern' },
  { code: 'TMW', name: 'Tamwe', district: 'Eastern' },
  { code: 'TKT', name: 'Thingangyun', district: 'Eastern' },
  { code: 'SOK', name: 'South Okkalapa', district: 'Eastern' },
  { code: 'NOK', name: 'North Okkalapa', district: 'Eastern' },
  { code: 'DGN', name: 'Dagon', district: 'Southern' },
  { code: 'THK', name: 'Thaketa', district: 'Southern' },
  { code: 'DLA', name: 'Dala', district: 'Southern' },
  { code: 'INS', name: 'Insein', district: 'Northern' },
  { code: 'MYG', name: 'Mayangone', district: 'Northern' },
  { code: 'SPT', name: 'Shwe Pyi Thar', district: 'Northern' },
];

export const TOWNSHIP_NAMES = YANGON_TOWNSHIPS.map((t) => t.name);

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
