import { enUS } from 'date-fns/locale';

/**
 * date-fns ships no Burmese locale, so this overrides only the month and
 * weekday names on top of en-US — the parts the app's format patterns use.
 * Digits stay Western, matching how amounts are shown.
 */
const MONTHS_WIDE = [
  'ဇန်နဝါရီ', 'ဖေဖော်ဝါရီ', 'မတ်', 'ဧပြီ', 'မေ', 'ဇွန်',
  'ဇူလိုင်', 'ဩဂုတ်', 'စက်တင်ဘာ', 'အောက်တိုဘာ', 'နိုဝင်ဘာ', 'ဒီဇင်ဘာ',
];
// April and August keep their full (already short) names: 'ဧ' and 'ဩ' on
// their own read as single letters rather than months.
const MONTHS_SHORT = ['ဇန်', 'ဖေ', 'မတ်', 'ဧပြီ', 'မေ', 'ဇွန်', 'ဇူ', 'ဩဂုတ်', 'စက်', 'အောက်', 'နို', 'ဒီ'];
const WEEKDAYS = ['တနင်္ဂနွေ', 'တနင်္လာ', 'အင်္ဂါ', 'ဗုဒ္ဓဟူး', 'ကြာသပတေး', 'သောကြာ', 'စနေ'];

export const myanmarDateLocale = {
  ...enUS,
  code: 'my',
  localize: {
    ...enUS.localize,
    month: (index, options) => (options?.width === 'wide' ? MONTHS_WIDE[index] : MONTHS_SHORT[index]),
    day: (index) => WEEKDAYS[index],
  },
};
