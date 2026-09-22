import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { LocaleProvider } from './context/LocaleContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppToaster } from './components/ui/Toast';
// Myanmar subset only, one file per weight the UI uses; the browser fetches a
// weight the first time Burmese text needs it (see the .mm rules in index.css).
import '@fontsource/noto-sans-myanmar/myanmar-400.css';
import '@fontsource/noto-sans-myanmar/myanmar-500.css';
import '@fontsource/noto-sans-myanmar/myanmar-600.css';
import '@fontsource/noto-sans-myanmar/myanmar-700.css';
import './index.css';

/**
 * Static-host preview builds (no server rewrite for deep links, and a sandbox
 * that blocks service workers) route on the hash and skip SW registration.
 * The real deployment uses neither branch.
 */
const isStaticPreview = import.meta.env.VITE_STATIC_PREVIEW === 'true';
const Router = isStaticPreview ? HashRouter : BrowserRouter;

if (!isStaticPreview) {
  /**
   * `autoUpdate` means a rep never sits on a stale build, but the reload is
   * deferred until the page is idle so it cannot interrupt a voucher being
   * written. Imported lazily so the preview build drops workbox entirely.
   */
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <ThemeProvider>
        <LocaleProvider>
          <AuthProvider>
            <App />
            <AppToaster />
          </AuthProvider>
        </LocaleProvider>
      </ThemeProvider>
    </Router>
  </StrictMode>,
);
