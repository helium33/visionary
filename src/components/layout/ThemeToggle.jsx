import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';

const OPTIONS = [
  { key: 'light', Icon: Sun, labelKey: 'header.lightMode' },
  { key: 'dark', Icon: Moon, labelKey: 'header.darkMode' },
];

/**
 * Light / dark pill toggle — the same shape as LanguageToggle, one icon per
 * option rather than text, since a sun/moon pair reads faster than "Light" /
 * "Dark" at this size and needs no translation itself.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useLocale();

  return (
    <div
      role="group"
      aria-label={t('header.theme')}
      className="flex items-center gap-0.5 rounded-md border border-line-hair p-0.5"
    >
      {OPTIONS.map(({ key, Icon, labelKey }) => (
        <button
          key={key}
          type="button"
          onClick={() => setTheme(key)}
          aria-pressed={theme === key}
          aria-label={t(labelKey)}
          title={t(labelKey)}
          className={`rounded p-1 transition ${
            theme === key ? 'bg-ink text-plane' : 'text-ink-secondary hover:bg-raised hover:text-ink'
          }`}
        >
          <Icon size={13} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
