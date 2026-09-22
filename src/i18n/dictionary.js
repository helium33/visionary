/**
 * ---------------------------------------------------------------------------
 * TRANSLATION DICTIONARY — English & Myanmar.
 * ---------------------------------------------------------------------------
 * A plain nested object rather than react-i18next: this app has no other i18n
 * need (no plural rules, no ICU message formatting, no per-locale number
 * formats beyond what `lib/format.js` already owns), and a ~2KB hand-rolled
 * lookup keeps the bundle smaller than shipping i18next + react-i18next +
 * a language detector for what is, today, a flat key→string table.
 *
 * One file per namespace under ./ns, each holding its `en` and `mm` strings
 * side by side so a reviewer can check a module's Burmese against its English
 * in one place. Every screen reads its copy through `t()`; dictionary.test.js
 * fails if a key exists in one language but not the other, or if the two
 * disagree on a `{placeholder}`.
 */
import { access } from './ns/access';
import { admin } from './ns/admin';
import { carstock } from './ns/carstock';
import { charts } from './ns/charts';
import { common } from './ns/common';
import { credit } from './ns/credit';
import { dashboard } from './ns/dashboard';
import { errors } from './ns/errors';
import { header } from './ns/header';
import { inventory } from './ns/inventory';
import { labels } from './ns/labels';
import { loading } from './ns/loading';
import { login } from './ns/login';
import { nav } from './ns/nav';
import { purchasing } from './ns/purchasing';
import { reports } from './ns/reports';
import { shops } from './ns/shops';
import { ui } from './ns/ui';
import { vouchers } from './ns/vouchers';

const NAMESPACES = {
  access,
  admin,
  carstock,
  charts,
  common,
  credit,
  dashboard,
  errors,
  header,
  inventory,
  labels,
  loading,
  login,
  nav,
  purchasing,
  reports,
  shops,
  ui,
  vouchers,
};

function forLocale(locale) {
  return Object.fromEntries(Object.entries(NAMESPACES).map(([name, ns]) => [name, ns[locale]]));
}

export const dictionary = {
  en: forLocale('en'),
  mm: forLocale('mm'),
};

export const LOCALES = ['en', 'mm'];
export const DEFAULT_LOCALE = 'en';
