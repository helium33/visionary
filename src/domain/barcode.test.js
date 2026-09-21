import { describe, expect, it } from 'vitest';
import {
  buildQrPayload,
  buildSku,
  ean13CheckDigit,
  encodeEan13,
  isValidEan13,
  toEan13,
} from './barcode';

describe('EAN-13 check digit', () => {
  it('matches the canonical GS1 example', () => {
    // 5901234123457 is the worked example in the GS1 specification.
    expect(ean13CheckDigit('590123412345')).toBe(7);
  });

  it.each([
    ['400638133393', 1],
    ['978020137962', 4],
    ['885123400001', 2],
  ])('computes the check digit for %s', (base, expected) => {
    expect(ean13CheckDigit(base)).toBe(expected);
  });

  it('refuses a base that is not twelve digits', () => {
    expect(ean13CheckDigit('12345')).toBeNull();
  });
});

describe('toEan13 / isValidEan13', () => {
  it('completes a twelve-digit base', () => {
    expect(toEan13('590123412345')).toBe('5901234123457');
  });

  it('passes a complete code through unchanged', () => {
    expect(toEan13('5901234123457')).toBe('5901234123457');
  });

  it('rejects the wrong length', () => {
    expect(toEan13('885000')).toBeNull();
  });

  it('catches a transcription error', () => {
    expect(isValidEan13('5901234123457')).toBe(true);
    expect(isValidEan13('5901234123458')).toBe(false); // wrong check digit
    expect(isValidEan13('5901243123457')).toBe(false); // two digits swapped
  });
});

describe('encodeEan13', () => {
  const encoded = encodeEan13('5901234123457');

  it('produces the 95-module symbol', () => {
    expect(encoded.modules).toHaveLength(95);
    expect(encoded.moduleCount).toBe(95);
  });

  it('places the three guard patterns', () => {
    expect(encoded.modules.slice(0, 3)).toBe('101');
    expect(encoded.modules.slice(45, 50)).toBe('01010');
    expect(encoded.modules.slice(92)).toBe('101');
  });

  it('encodes the first digit as parity, not as bars', () => {
    expect(encoded.firstDigit).toBe('5');
    // First digit 5 → parity LGGLLG for digits 2–7. Digit 2 is 9, L-coded.
    expect(encoded.modules.slice(3, 10)).toBe('0001011');
    // Digit 3 is 0, G-coded under this parity.
    expect(encoded.modules.slice(10, 17)).toBe('0100111');
  });

  it('right-hand digits always use R-code', () => {
    // Digits 8–13 are 123457; digit 8 is 1 → R[1].
    expect(encoded.modules.slice(50, 57)).toBe('1100110');
  });

  it('splits the digits for the printed row', () => {
    expect(encoded.leftDigits).toBe('901234');
    expect(encoded.rightDigits).toBe('123457');
  });

  it('returns null rather than a wrong symbol', () => {
    expect(encodeEan13('abc')).toBeNull();
  });
});

describe('label payloads', () => {
  const product = { modelNo: 'PB-2026' };
  const variant = { colorCode: 'C1', colorName: 'Black', barcode: '8851234000016' };

  it('builds a human-readable SKU', () => {
    expect(buildSku(product, variant)).toBe('PB-2026-C1');
  });

  it('builds a QR payload a person could also read', () => {
    expect(buildQrPayload(product, variant, { price: 18000 })).toBe(
      'PB-2026-C1|Black|K18000|8851234000016',
    );
  });

  it('drops empty fields rather than leaving gaps', () => {
    expect(buildQrPayload(product, { colorCode: 'C2' })).toBe('PB-2026-C2');
  });
});
