import { Languages } from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';

/**
 * EN / MM pill toggle. Both codes are always visible rather than showing only
 * the "other" language to switch to — a rep scanning the header should be
 * able to tell which language is active without reading state from a tooltip.
 */
export function LanguageToggle() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      role="group"
      aria-label={t('header.language')}
      className="flex items-center gap-0.5 rounded-md border border-line-hair p-0.5"
    >
      <Languages size={12} className="ml-1 text-ink-muted" aria-hidden="true" />
      {['en', 'mm'].map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={`rounded px-1.5 py-1 text-2xs font-semibold uppercase transition ${
            locale === code ? 'bg-ink text-plane' : 'text-ink-secondary hover:bg-raised hover:text-ink'
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
