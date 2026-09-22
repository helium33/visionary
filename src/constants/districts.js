/**
 * ---------------------------------------------------------------------------
 * YANGON DISTRICT ↔ TOWNSHIP MAPPING
 * ---------------------------------------------------------------------------
 * Yangon Region's General Administration Department groups its townships into
 * four districts. That grouping is what this file encodes — `district` is
 * never stored on a shop document; it is always DERIVED from `shop.township`
 * via `getDistrictForTownship()` below, the same "compute it, don't duplicate
 * it" rule the rest of this app follows for credit status and dead stock. A
 * shop's township never silently disagrees with its district, because there
 * is only one place the fact lives.
 *
 * Coverage note: this lists the ~28 urban townships a wholesale distributor
 * actually sells into (every township that appears anywhere in this app's
 * demo shop data is included). A handful of outer/rural townships some
 * sources also assign to Yangon Region (Kungyangon, Taikkyi, Hmawbi, Hlegu,
 * Thongwa, Cocokyun) are left out as out-of-scope for a Yangon-city eyewear
 * network; add them here if the business expands there. District boundaries
 * for a few peripheral "new town" townships (the three Dagon Myothit
 * satellites) are genuinely cited differently across sources — the
 * assignments below follow the most common convention. Nothing else in the
 * app depends on getting those particular three exactly right, and the fix
 * is a one-line edit below if the business's own usage differs.
 */

export const DISTRICTS = {
  NORTH: 'NORTH',
  SOUTH: 'SOUTH',
  EAST: 'EAST',
  WEST: 'WEST',
};

export const DISTRICT_LABELS = {
  [DISTRICTS.NORTH]: { en: 'North District', mm: 'မြောက်ပိုင်းခရိုင်', short: { en: 'North', mm: 'မြောက်ပိုင်းခရိုင်' } },
  [DISTRICTS.SOUTH]: { en: 'South District', mm: 'တောင်ပိုင်းခရိုင်', short: { en: 'South', mm: 'တောင်ပိုင်းခရိုင်' } },
  [DISTRICTS.EAST]: { en: 'East District', mm: 'အရှေ့ပိုင်းခရိုင်', short: { en: 'East', mm: 'အရှေ့ပိုင်းခရိုင်' } },
  [DISTRICTS.WEST]: { en: 'West District', mm: 'အနောက်ပိုင်းခရိုင်', short: { en: 'West', mm: 'အနောက်ပိုင်းခရိုင်' } },
};

/** Display order used everywhere a list of districts is rendered. */
export const DISTRICT_ORDER = [DISTRICTS.NORTH, DISTRICTS.SOUTH, DISTRICTS.EAST, DISTRICTS.WEST];

/**
 * The mapping the brief asked for, spelled out directly: one entry per
 * district, each holding its townships. `YANGON_DISTRICTS` (below) is built
 * from this — the two never disagree because one is derived from the other.
 */
export const DISTRICT_TOWNSHIPS = {
  [DISTRICTS.NORTH]: [
    'Insein',
    'Mingaladon',
    'Shwe Pyi Thar',
    'Hlaingthaya',
    'Mingalardon Garden City',
    'Htantabin',
  ],
  [DISTRICTS.SOUTH]: [
    'Thanlyin',
    'Dala',
    'Kyauktan',
    'Twantay',
    'Seikkyi Kanaungto',
    'Kawhmu',
  ],
  [DISTRICTS.EAST]: [
    'Thingangyun',
    'Yankin',
    'South Okkalapa',
    'North Okkalapa',
    'Tamwe',
    'Mingala Taung Nyunt',
    'Botataung',
    'Pazundaung',
    'Thaketa',
    'Dawbon',
    'Dagon Myothit (South)',
    'Dagon Myothit (North)',
    'Dagon Myothit (East)',
  ],
  [DISTRICTS.WEST]: [
    'Latha',
    'Lanmadaw',
    'Pabedan',
    'Kyauktada',
    'Ahlone',
    'Kyeemyindaing',
    'Sanchaung',
    'Kamayut',
    'Hlaing',
    'Bahan',
    'Mayangone',
    'Dagon',
    'Seikkan',
  ],
};

/**
 * `[{ code, key: district, label: {en, mm}, townships: [...] }]` — the shape
 * a select/legend/chart usually wants: one row per district, townships
 * nested, in a fixed display order.
 */
export const YANGON_DISTRICTS = DISTRICT_ORDER.map((key) => ({
  key,
  label: DISTRICT_LABELS[key],
  townships: DISTRICT_TOWNSHIPS[key],
}));

/** township name → district key, built once. O(1) lookups from here on. */
export const TOWNSHIP_DISTRICT_MAP = Object.fromEntries(
  DISTRICT_ORDER.flatMap((district) =>
    DISTRICT_TOWNSHIPS[district].map((township) => [township, district]),
  ),
);

/** Flat, alphabetised list of every mapped township — what a `<select>` iterates. */
export const ALL_TOWNSHIPS = Object.keys(TOWNSHIP_DISTRICT_MAP).sort((a, b) =>
  a.localeCompare(b),
);

/**
 * The auto-categorisation the brief asks for: "selecting a Township should
 * automatically categorise it under the correct District." A shop form calls
 * this the moment a township is picked — `district` is never a field the
 * person fills in themselves, only ever this function's return value.
 *
 * Returns `null` for an unmapped township rather than guessing, so a form can
 * show "district unknown — check the spelling" instead of silently filing a
 * new town under the wrong one.
 */
export function getDistrictForTownship(township) {
  return TOWNSHIP_DISTRICT_MAP[township] ?? null;
}

export function districtLabel(district, locale = 'en') {
  return DISTRICT_LABELS[district]?.[locale] ?? DISTRICT_LABELS[district]?.en ?? district ?? '—';
}

/**
 * A compact axis-tick form of `districtLabel` — "North" rather than
 * "North District". English safely drops the redundant suffix (the chart
 * that uses this always titles itself "… by district", so the word isn't
 * needed twice); the Burmese names are the exact text the brief specified
 * and are not this app's to abbreviate, so the Myanmar short form is
 * identical to the full one.
 */
export function districtShortLabel(district, locale = 'en') {
  return DISTRICT_LABELS[district]?.short?.[locale] ?? districtLabel(district, locale);
}

/**
 * Groups arbitrary rows that carry a `township` field by district, in
 * DISTRICT_ORDER. Used by the Shops & Townships report to roll voucher totals
 * up from township → district without every caller re-deriving the grouping.
 */
export function groupByDistrict(rows, getTownship = (row) => row.township) {
  const buckets = new Map(DISTRICT_ORDER.map((key) => [key, []]));
  const unassigned = [];

  for (const row of rows) {
    const district = getDistrictForTownship(getTownship(row));
    if (district) buckets.get(district).push(row);
    else unassigned.push(row);
  }

  return { buckets, unassigned };
}
