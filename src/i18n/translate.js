import { DEFAULT_LOCALE, dictionary } from './dictionary';

/**
 * Dot-path lookup with `{placeholder}` interpolation — the two features a
 * hand-rolled i18n actually needs. `t('credit.showing', { shown: 3, total: 14 })`
 * reads `dictionary[locale].credit.showing` and substitutes `{shown}`/`{total}`.
 *
 * Falls back English → the raw key, in that order, and never throws: a
 * missing translation should degrade to readable English text in production,
 * not blank the screen.
 */
export function translate(locale, key, vars) {
  const fromLocale = lookup(dictionary[locale], key);
  const fromEnglish = fromLocale ?? lookup(dictionary[DEFAULT_LOCALE], key);
  const template = fromEnglish ?? key;
  return interpolate(template, vars);
}

let activeLocale = DEFAULT_LOCALE;

/** Mirrors LocaleProvider's locale for text built outside components. */
export function setActiveLocale(locale) {
  activeLocale = locale;
}

export function getActiveLocale() {
  return activeLocale;
}

/** `t()` for code outside React: service messages, date and day formatting. */
export function tNow(key, vars) {
  return translate(activeLocale, key, vars);
}

function lookup(table, key) {
  if (!table) return undefined;
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), table);
}

function interpolate(template, vars) {
  if (typeof template !== 'string' || !vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/**
 * `t(key)`, or `fallback` when no language has the key — for labels of keyed
 * data values (a material, a shape) that the table may not know yet, which
 * should show as stored rather than as a dotted key.
 */
export function tOr(t, key, fallback) {
  const text = t(key);
  return text === key ? fallback : text;
}
