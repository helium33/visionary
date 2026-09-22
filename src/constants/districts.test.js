import { describe, expect, it } from 'vitest';
import {
  ALL_TOWNSHIPS,
  DISTRICTS,
  DISTRICT_ORDER,
  TOWNSHIP_LABELS_MM,
  YANGON_DISTRICTS,
  districtLabel,
  districtShortLabel,
  getDistrictForTownship,
  groupByDistrict,
  townshipLabel,
  townshipMatches,
} from './districts';

describe('getDistrictForTownship — the shop-form auto-categorisation', () => {
  it.each([
    ['Insein', DISTRICTS.NORTH],
    ['Shwe Pyi Thar', DISTRICTS.NORTH],
    ['Dala', DISTRICTS.SOUTH],
    ['Thanlyin', DISTRICTS.SOUTH],
    ['Thingangyun', DISTRICTS.EAST],
    ['Mingala Taung Nyunt', DISTRICTS.EAST],
    ['Botataung', DISTRICTS.EAST],
    ['Latha', DISTRICTS.WEST],
    ['Kamayut', DISTRICTS.WEST],
    ['Sanchaung', DISTRICTS.WEST],
  ])('%s → %s', (township, district) => {
    expect(getDistrictForTownship(township)).toBe(district);
  });

  it('returns null rather than guessing for an unmapped township', () => {
    expect(getDistrictForTownship('Nowhereville')).toBeNull();
    expect(getDistrictForTownship(undefined)).toBeNull();
  });

  it('covers every township this app already has a shop in', () => {
    // Nothing that demo data uses today may resolve to null — a shop
    // silently falling out of every district chart is worse than a loud one.
    const used = [
      'Botataung', 'Hlaing', 'Insein', 'Kamayut', 'Latha', 'Mingala Taung Nyunt',
      'North Okkalapa', 'Pabedan', 'Sanchaung', 'Tamwe', 'Thingangyun',
    ];
    for (const township of used) {
      expect(getDistrictForTownship(township)).not.toBeNull();
    }
  });
});

describe('data shape', () => {
  it('never lists the same township under two districts', () => {
    const seen = new Set();
    for (const district of YANGON_DISTRICTS) {
      for (const township of district.townships) {
        expect(seen.has(township)).toBe(false);
        seen.add(township);
      }
    }
  });

  it('keeps ALL_TOWNSHIPS in sync with the per-district lists, alphabetised', () => {
    const expected = YANGON_DISTRICTS.flatMap((d) => d.townships).sort((a, b) =>
      a.localeCompare(b),
    );
    expect(ALL_TOWNSHIPS).toEqual(expected);
  });

  it('renders a district label in both languages, falling back to English', () => {
    expect(districtLabel(DISTRICTS.WEST, 'en')).toBe('West District');
    expect(districtLabel(DISTRICTS.WEST, 'mm')).toBe('အနောက်ပိုင်းခရိုင်');
    expect(districtLabel(DISTRICTS.WEST, 'fr')).toBe('West District');
  });

  it('renders the compact English form for a chart axis, dropping the redundant "District"', () => {
    expect(districtShortLabel(DISTRICTS.NORTH, 'en')).toBe('North');
    expect(districtShortLabel(DISTRICTS.WEST, 'en')).toBe('West');
  });

  it('keeps the full Myanmar name as its own short form — not this app’s text to abbreviate', () => {
    expect(districtShortLabel(DISTRICTS.WEST, 'mm')).toBe(districtLabel(DISTRICTS.WEST, 'mm'));
  });

  it('covers all four districts in a fixed order', () => {
    expect(DISTRICT_ORDER).toEqual([DISTRICTS.NORTH, DISTRICTS.SOUTH, DISTRICTS.EAST, DISTRICTS.WEST]);
    expect(YANGON_DISTRICTS.map((d) => d.key)).toEqual(DISTRICT_ORDER);
  });
});

describe('groupByDistrict', () => {
  const rows = [
    { id: 1, township: 'Latha' },
    { id: 2, township: 'Insein' },
    { id: 3, township: 'Latha' },
    { id: 4, township: 'Nowhereville' },
  ];

  it('buckets rows by their township’s district, in district order', () => {
    const { buckets } = groupByDistrict(rows);
    expect([...buckets.keys()]).toEqual(DISTRICT_ORDER);
    expect(buckets.get(DISTRICTS.WEST).map((r) => r.id)).toEqual([1, 3]);
    expect(buckets.get(DISTRICTS.NORTH).map((r) => r.id)).toEqual([2]);
  });

  it('sets aside rows whose township has no district, rather than dropping them', () => {
    const { unassigned } = groupByDistrict(rows);
    expect(unassigned.map((r) => r.id)).toEqual([4]);
  });

  it('accepts a custom accessor for a differently-shaped row', () => {
    const { buckets } = groupByDistrict([{ shopTownship: 'Dala' }], (r) => r.shopTownship);
    expect(buckets.get(DISTRICTS.SOUTH)).toHaveLength(1);
  });
});

describe('township names in Burmese', () => {
  it('has a Burmese name for every township a shop can be in', () => {
    expect(ALL_TOWNSHIPS.filter((name) => !TOWNSHIP_LABELS_MM[name])).toEqual([]);
  });

  it('shows the stored name in English and the Burmese one in Myanmar', () => {
    expect(townshipLabel('Latha', 'en')).toBe('Latha');
    expect(townshipLabel('Latha', 'mm')).toBe('လသာ');
  });

  it('falls back to the stored name for a township it does not know', () => {
    expect(townshipLabel('Somewhere New', 'mm')).toBe('Somewhere New');
  });

  it('matches a search in either language', () => {
    expect(townshipMatches('Latha', 'lat')).toBe(true);
    expect(townshipMatches('Latha', 'လသာ')).toBe(true);
    expect(townshipMatches('Latha', 'bahan')).toBe(false);
  });
});
