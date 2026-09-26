import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'visionary.theme';

function systemPrefersDark() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function readStoredTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

/**
 * A manual light/dark override on top of the OS-linked default this app
 * already had. `index.css` was already built for exactly this: the light
 * tokens on bare `:root`, the dark set under `@media (prefers-color-scheme:
 * dark)` guarded as `:not([data-theme='light'])`, and again under the
 * explicit `:root[data-theme='dark']` so a toggle wins in both directions.
 * Nothing there needed to change — this just starts setting the attribute.
 *
 * `override` stays `null` until the person actually touches the toggle, so
 * the app keeps following a live OS theme change (day → night) right up
 * until the first explicit choice — after that, like every app with a
 * theme switch, the choice is sticky rather than system-linked.
 */
export function ThemeProvider({ children }) {
  const [override, setOverride] = useState(() => readStoredTheme());
  const theme = override ?? (systemPrefersDark() ? 'dark' : 'light');

  useEffect(() => {
    if (override) {
      document.documentElement.dataset.theme = override;
    } else {
      delete document.documentElement.dataset.theme;
    }
    try {
      if (override) window.localStorage.setItem(STORAGE_KEY, override);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Per-viewer convenience only — losing the saved preference is fine.
    }
  }, [override]);

  const setTheme = useCallback((next) => {
    setOverride(next === 'dark' ? 'dark' : 'light');
  }, []);

  const toggleTheme = useCallback(() => {
    setOverride((current) => ((current ?? theme) === 'dark' ? 'light' : 'dark'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
