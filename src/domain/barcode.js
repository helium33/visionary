/**
 * ---------------------------------------------------------------------------
 * EAN-13 — encoded here rather than pulled from a library.
 * ---------------------------------------------------------------------------
 * The encoding is a fixed table and 40 lines of logic, it has to work offline
 * on a rep's phone, and a wrong barcode is an expensive mistake to discover at
 * a shop counter — so it is a pure, tested function rather than a dependency
 * whose failure mode is a silently misprinted label.
 *
 * Myanmar's GS1 country prefix is 885.
 */

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];

/** The first digit is not drawn — it is encoded in the parity of digits 2–7. */
const PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

const GUARD_SIDE = '101';
const GUARD_CENTRE = '01010';

/**
 * Modulo-10 check digit over the first 12 digits, weights alternating 1 and 3.
 */
export function ean13CheckDigit(base12) {
  const digits = String(base12).replace(/\D/g, '').slice(0, 12);
  if (digits.length !== 12) return null;
  const sum = [...digits].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return (10 - (sum % 10)) % 10;
}

/** Completes a 12-digit base into a full EAN-13, or validates a 13-digit one. */
export function toEan13(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 12) return `${digits}${ean13CheckDigit(digits)}`;
  if (digits.length === 13) return digits;
  return null;
}

export function isValidEan13(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length !== 13) return false;
  return ean13CheckDigit(digits.slice(0, 12)) === Number(digits[12]);
}

/**
 * Bar pattern for a full EAN-13: 95 modules, '1' meaning a dark bar.
 *
 * Returns the segments separately as well, because the printed form draws the
 * guard bars taller than the data bars and sets the first digit outside the
 * symbol — a label that skips that convention still scans, but reads as
 * amateur next to a factory label.
 */
export function encodeEan13(value) {
  const code = toEan13(value);
  if (!code) return null;

  const [first, ...rest] = [...code].map(Number);
  const parity = PARITY[first];

  const left = rest
    .slice(0, 6)
    .map((digit, i) => (parity[i] === 'L' ? L[digit] : G[digit]))
    .join('');
  const right = rest.slice(6).map((digit) => R[digit]).join('');

  return {
    code,
    firstDigit: String(first),
    leftDigits: code.slice(1, 7),
    rightDigits: code.slice(7),
    modules: `${GUARD_SIDE}${left}${GUARD_CENTRE}${right}${GUARD_SIDE}`,
    // Module offsets the renderer draws full-height.
    guards: [
      [0, 3],
      [45, 50],
      [92, 95],
    ],
    moduleCount: 95,
  };
}

/**
 * Human-readable stock keeping unit. This is what goes in the QR code, because
 * a phone camera reading "PB-2026 / C1" is useful to a warehouse hand in a way
 * that thirteen digits are not.
 */
export function buildSku(product, variant) {
  return `${product?.modelNo ?? '?'}-${variant?.colorCode ?? '?'}`;
}

/**
 * QR payload. Pipe-delimited rather than JSON: it stays scannable at a small
 * label size, and every field is readable to a person if the scanner fails.
 */
export function buildQrPayload(product, variant, { price } = {}) {
  return [
    buildSku(product, variant),
    variant?.colorName ?? '',
    price != null ? `K${price}` : '',
    variant?.barcode ?? '',
  ]
    .filter(Boolean)
    .join('|');
}
