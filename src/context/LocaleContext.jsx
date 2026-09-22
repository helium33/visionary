import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, LOCALES } from '../i18n/dictionary';
import { translate } from '../i18n/translate';

const LocaleContext = createContext(null);
const STORAGE_KEY = 'visionary.locale';

function readStoredLocale() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return LOCALES.includes(stored) ? stored : null;
  } catch {
    // Private browsing, blocked storage — fall through to the default rather
    // than crash the app over a language preference.
    return null;
  }
}

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => readStoredLocale() ?? DEFAULT_LOCALE);

  useEffect(() => {
    // Myanmar script needs its own font fallback stack (see .mm in index.css)
    // and its own lang attribute for screen readers and browser spell-check —
    // applied at the document root so every element renders it, not just the
    // ones a developer remembered to tag individually.
    document.documentElement.lang = locale === 'mm' ? 'my' : 'en';
    document.body.classList.toggle('mm-locale', locale === 'mm');
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Per-viewer convenience only — losing the saved preference is fine.
    }
  }, [locale]);

  const setLocale = useCallback((next) => {
    setLocaleState(LOCALES.includes(next) ? next : DEFAULT_LOCALE);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((current) => (current === 'en' ? 'mm' : 'en'));
  }, []);

  const t = useCallback((key, vars) => translate(locale, key, vars), [locale]);

  const value = useMemo(
    () => ({ locale, locales: LOCALES, setLocale, toggleLocale, t }),
    [locale, setLocale, toggleLocale, t],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside <LocaleProvider>');
  return ctx;
}
