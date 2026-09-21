import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import './index.css';

/**
 * Service worker registration. `autoUpdate` means a rep never sits on a stale
 * build, but the reload is deferred until the page is idle so it cannot
 * interrupt a voucher being written.
 */
registerSW({ immediate: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
