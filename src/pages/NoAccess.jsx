import { useState } from 'react';
import { LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { BrandLogo } from '../components/brand/BrandLogo';
import { LanguageToggle } from '../components/layout/LanguageToggle';
import { ThemeToggle } from '../components/layout/ThemeToggle';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';

/**
 * Signed in, but the account's token carries no role, so firestore.rules
 * would deny every read. Shown instead of loading screens into permission
 * errors. Once an admin grants a role, "Check again" picks it up without
 * signing out, and ProtectedRoute lets the app through on its own.
 */
export default function NoAccess() {
  const { user, refreshAccess, logout } = useAuth();
  const { t } = useLocale();
  const toast = useToast();
  const [checking, setChecking] = useState(false);

  const checkAgain = async () => {
    setChecking(true);
    try {
      const role = await refreshAccess();
      if (!role) toast.push(t('access.stillNone'), { tone: 'info' });
    } catch {
      toast.push(t('login.errorNetworkFailed'), { tone: 'error' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-plane px-4 py-10">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandLogo />
        </div>

        <div className="card w-full space-y-5 p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <ShieldAlert size={20} className="mt-0.5 shrink-0 text-status-warning" aria-hidden="true" />
            <div>
              <h1 className="text-lg font-semibold text-ink">{t('access.title')}</h1>
              <p className="mt-1 text-sm text-ink-secondary">{t('access.body', { email: user?.email })}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" size="lg" className="w-full" onClick={checkAgain} disabled={checking}>
              <RefreshCw size={16} className={checking ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />
              {checking ? t('access.checking') : t('access.checkAgain')}
            </Button>
            <Button variant="secondary" size="lg" className="w-full" onClick={logout}>
              <LogOut size={16} aria-hidden="true" />
              {t('header.logout')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
