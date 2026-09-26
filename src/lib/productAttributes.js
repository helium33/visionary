import { tOr } from '../i18n/translate';

const same = (a, b) =>
  String(a ?? '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '') ===
  String(b ?? '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '');

/**
 * "Acetate · Cat eye · Women" in the reader's language. Products store their
 * attributes as keys (ACETATE, CAT_EYE, WOMEN); a key the label table doesn't
 * know yet is shown as stored. An imported model may also carry its old
 * system's `line` ("Sunglasses", "Soulmate သံ"), shown as written — it is the
 * business's own wording, not a key — unless it only repeats the brand.
 */
export function productAttributes(product, t, { brand = false, gender = true } = {}) {
  const line = product.line && !(brand && same(product.line, product.brand)) ? product.line : null;
  return [
    brand ? product.brand : null,
    line,
    product.material && tOr(t, `labels.material.${product.material}`, product.material),
    product.shape && tOr(t, `labels.shape.${product.shape}`, product.shape.replace('_', ' ')),
    gender && product.gender ? tOr(t, `labels.gender.${product.gender}`, product.gender) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
