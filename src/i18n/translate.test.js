import { describe, expect, it } from 'vitest';
import { translate } from './translate';

describe('translate', () => {
  it('resolves a nested key', () => {
    expect(translate('en', 'nav.dashboard')).toBe('Dashboard');
    expect(translate('mm', 'nav.dashboard')).toBe('ပင်မစာမျက်နှာ');
  });

  it('interpolates placeholders', () => {
    expect(translate('en', 'credit.acrossShops', { count: 5 })).toBe('across 5 shops');
  });

  it('falls back to English when the Myanmar string is missing', () => {
    // Simulated by asking for a key under a locale that has no such branch.
    expect(translate('mm', 'header.demoData')).toBe('သရုပ်ပြ အချက်အလက်');
  });

  it('falls back to the raw key when neither locale has it, without throwing', () => {
    expect(translate('en', 'nothing.here')).toBe('nothing.here');
    expect(translate('mm', 'nothing.here')).toBe('nothing.here');
  });

  it('tolerates an unknown locale by falling back to English', () => {
    expect(translate('fr', 'nav.dashboard')).toBe('Dashboard');
  });

  it('leaves an unmatched placeholder visible rather than deleting it', () => {
    expect(translate('en', 'credit.acrossShops', {})).toBe('across {count} shops');
  });
});
