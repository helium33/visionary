import { useEffect } from 'react';
import toast, { ToastBar, Toaster } from 'react-hot-toast';
import { Info, X } from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { setListenerErrorReporter } from '../../services/dataSource';

const DURATION = { success: 3500, error: 6000, info: 4200 };

const LISTENER_ERROR_KEYS = {
  'permission-denied': 'errors.permission',
  'failed-precondition': 'errors.index',
  unavailable: 'errors.unavailable',
};

/**
 * `push(message, { tone, duration, id })` — tone is success | error | info |
 * loading. A loading toast stays until a later push with the same `id`
 * turns it into its outcome, which is how a slow save shows progress and
 * then its result in one place instead of two stacked toasts.
 */
const api = {
  push(message, { tone = 'info', duration, id } = {}) {
    const options = { id, duration: duration ?? DURATION[tone] };
    if (tone === 'success') return toast.success(message, options);
    if (tone === 'error') return toast.error(message, options);
    if (tone === 'loading') return toast.loading(message, { id });
    return toast(message, { ...options, icon: <Info size={17} className="shrink-0 text-brand-primary" /> });
  },
  dismiss: (id) => toast.dismiss(id),
};

export function useToast() {
  return api;
}

/** Colours come from the theme tokens, so toasts follow the light/dark toggle. */
export function AppToaster() {
  const { t } = useLocale();

  useEffect(() => {
    setListenerErrorReporter((error) => {
      const key = LISTENER_ERROR_KEYS[error?.code] ?? 'errors.loadFailed';
      // One toast per kind of failure: a screen whose five listeners all fail
      // the same way shouldn't stack five identical toasts.
      toast.error(t(key), { id: `listener:${key}`, duration: 8000 });
    });
    return () => setListenerErrorReporter(() => {});
  }, [t]);

  return (
    <Toaster
      position="bottom-center"
      gutter={8}
      containerStyle={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
      toastOptions={{
        style: {
          background: 'var(--surface-1)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-hair)',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgb(0 0 0 / 0.14)',
          fontSize: '14px',
          lineHeight: '1.4',
          maxWidth: '28rem',
          padding: '10px 12px',
          whiteSpace: 'pre-line',
        },
        success: { iconTheme: { primary: 'var(--status-good)', secondary: 'var(--surface-1)' } },
        error: { iconTheme: { primary: 'var(--status-critical)', secondary: 'var(--surface-1)' } },
        loading: { iconTheme: { primary: 'var(--brand-primary)', secondary: 'var(--border-hair)' } },
      }}
    >
      {(item) => (
        <ToastBar toast={item}>
          {({ icon, message }) => (
            <>
              {icon}
              {message}
              {item.type !== 'loading' ? (
                <button
                  type="button"
                  onClick={() => toast.dismiss(item.id)}
                  aria-label={t('ui.dismiss')}
                  className="shrink-0 rounded p-0.5 text-ink-muted hover:text-ink"
                >
                  <X size={14} />
                </button>
              ) : null}
            </>
          )}
        </ToastBar>
      )}
    </Toaster>
  );
}
