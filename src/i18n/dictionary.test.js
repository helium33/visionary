import { describe, expect, it } from 'vitest';
import { dictionary } from './dictionary';

function leaves(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'object' ? leaves(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]],
  );
}

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionary', () => {
  const en = new Map(leaves(dictionary.en));
  const mm = new Map(leaves(dictionary.mm));

  it('has every English key in Myanmar', () => {
    expect([...en.keys()].filter((k) => !mm.has(k))).toEqual([]);
  });

  it('has no Myanmar key missing from English', () => {
    expect([...mm.keys()].filter((k) => !en.has(k))).toEqual([]);
  });

  it('uses the same {placeholders} in both languages', () => {
    const mismatched = [...en].filter(([k, v]) => mm.has(k) && placeholders(v).join() !== placeholders(mm.get(k)).join());
    expect(mismatched.map(([k]) => k)).toEqual([]);
  });

  it('has no empty strings', () => {
    expect([...en, ...mm].filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => k)).toEqual([]);
  });
});
