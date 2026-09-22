import { tOr } from '../i18n/translate';

/**
 * "Acetate · Cat eye · Women" in the reader's language. Products store their
 * attributes as keys (ACETATE, CAT_EYE, WOMEN); a key the label table doesn't
 * know yet is shown as stored.
 */
export function productAttributes(product, t, { brand = false, gender = true } = {}) {
  return [
    brand ? product.brand : null,
    product.material && tOr(t, `labels.material.${product.material}`, product.material),
    product.shape && tOr(t, `labels.shape.${product.shape}`, product.shape.replace('_', ' ')),
    gender && product.gender ? tOr(t, `labels.gender.${product.gender}`, product.gender) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
