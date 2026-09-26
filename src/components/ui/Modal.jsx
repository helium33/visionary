import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';

export function Modal({ open, onClose, title, subtitle, children, footer, width = 'max-w-lg' }) {
  const panelRef = useRef(null);
  const { t } = useLocale();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    // Move focus into the dialog so keyboard and screen-reader users land here.
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 w-full ${width} max-h-[92vh] overflow-y-auto rounded-t-xl border
          border-line-hair bg-surface shadow-2xl outline-none sm:rounded-card`}
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-line-hair bg-surface px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-ink-secondary">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('ui.close')}
            className="rounded p-1 text-ink-muted hover:bg-raised hover:text-ink"
          >
            <X size={16} />
          </button>
        </header>
        <div className="px-4 py-4">{children}</div>
        {footer ? (
          <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-line-hair bg-surface px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
