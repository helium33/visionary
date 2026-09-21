import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
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
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </Router>
  </StrictMode>,
);
