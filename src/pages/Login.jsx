import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import { useForm } from 'react-hook-form';
import { AlertCircle, Loader2 } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { BrandLogo } from '../components/brand/BrandLogo';
import { LanguageToggle } from '../components/layout/LanguageToggle';
import { ThemeToggle } from '../components/layout/ThemeToggle';
import { Button } from '../components/ui/Button';

const googleProvider = new GoogleAuthProvider();

/**
 * Firebase error codes turned into copy a shop owner can act on, without
 * leaking which half was wrong — Firebase itself no longer distinguishes
 * "no such user" from "wrong password" (both come back as
 * `auth/invalid-credential`) specifically so a login screen can't be used to
 * probe which emails have accounts. `auth/invalid-email` is the one case
 * safe to be specific about — it's a format check, not an account lookup.
 *
 * Returns `null` for the Google popup's own cancel codes — closing the
 * account picker or dismissing the popup is not an error to alarm someone
 * over, it's just declining to continue. `auth/operation-not-allowed` and
 * `auth/unauthorized-domain` are configuration problems in the Firebase
 * project itself (a sign-in method not switched on, or a domain not
 * allow-listed) rather than anything wrong with what the person typed or
 * clicked — worth saying plainly rather than folding into the generic
 * fallback, since "try again" would never fix either one.
 */
function loginErrorMessage(error, t) {
  switch (error?.code) {
    case 'auth/invalid-email':
      return t('login.errorInvalidEmail');
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return t('login.errorInvalidCredential');
    case 'auth/user-disabled':
      return t('login.errorUserDisabled');
    case 'auth/too-many-requests':
      return t('login.errorTooManyRequests');
    case 'auth/operation-not-allowed':
      return t('login.errorOperationNotAllowed');
    case 'auth/unauthorized-domain':
      return t('login.errorUnauthorizedDomain');
    case 'auth/network-request-failed':
      return t('login.errorNetworkFailed');
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    default:
      return t('login.errorDefault');
  }
}

/**
 * Popups are blocked outright by some browsers, and fail unconditionally
 * inside a cross-origin iframe (a claude.ai Artifact preview, notably) —
 * Google's own OAuth flow refuses to run inside one. `signInWithRedirect`
 * has neither restriction, so it's the fallback whenever the popup itself
 * couldn't open or run, not just when Firebase reports it as blocked.
 */
function isPopupUnavailable(error) {
  return [
    'auth/popup-blocked',
    'auth/operation-not-supported-in-this-environment',
    'auth/web-storage-unsupported',
  ].includes(error?.code);
}

export default function Login() {
  const { user } = useAuth();
  const { t } = useLocale();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  // Completing a signInWithRedirect round trip: the browser just navigated
  // back here from Google with the result in the URL, not in a popup's
  // return value. onAuthStateChanged also picks up the resulting session,
  // but only this call surfaces the specific error if the redirect itself
  // failed (e.g. the domain isn't authorised) rather than leaving the
  // person on a blank sign-in form with no explanation.
  //
  // Wrapped in try/catch, not just a trailing .catch(): this touches
  // Firebase's storage-backed persistence manager the moment the page
  // loads, and a host that restricts storage (a sandboxed preview iframe,
  // a private window) can make that throw synchronously before a promise
  // ever exists to attach .catch() to. Uncaught, that throw happens inside
  // the first effect run on this page's only route, with no error boundary
  // above it — so it doesn't fail quietly, it blanks the entire page. No
  // redirect is the overwhelmingly common case (nearly every visit is a
  // fresh sign-in attempt, not a return trip), so a failure checking for
  // one is silently ignored here rather than shown as an error.
  useEffect(() => {
    try {
      getRedirectResult(auth).catch((err) => setError(loginErrorMessage(err, t)));
    } catch {
      // Nothing to recover: no redirect result was retrievable, same as if
      // there simply wasn't one pending.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Already signed in — either ProtectedRoute sent a visitor here mid-session
  // (Firebase's own persisted session resolving after a fresh page load) or
  // a signed-in user navigated to /login directly. Send them back to
  // whichever page ProtectedRoute originally intercepted them on, or "/" if
  // they arrived here with no such detour on record.
  if (user) {
    return <Navigate to={location.state?.from?.pathname ?? '/'} replace />;
  }

  const onSubmit = async ({ email, password }) => {
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // No further action needed here — AuthContext's onAuthStateChanged
      // picks up the new session and ProtectedRoute re-renders past /login.
    } catch (err) {
      setError(loginErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const onGoogleSignIn = async () => {
    setGoogleBusy(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (isPopupUnavailable(err)) {
        // The page is about to navigate away for the redirect round trip,
        // so whether `finally` below still flips googleBusy back to false
        // in the instant before that happens doesn't matter — there's
        // nothing left on screen to look busy or not by the time it would.
        setError(loginErrorMessage({ code: 'auth/popup-blocked' }, t));
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      setError(loginErrorMessage(err, t));
    } finally {
      setGoogleBusy(false);
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

        <div className="card w-full space-y-4 p-6 sm:p-8">
          <div>
            <h1 className="text-lg font-semibold text-ink">{t('login.title')}</h1>
            <p className="mt-1 text-xs text-ink-secondary">{t('login.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-secondary">
                {t('login.email')}
              </span>
              <input
                type="email"
                autoComplete="username"
                placeholder="you@shop.com"
                aria-invalid={errors.email ? 'true' : 'false'}
                className="w-full rounded-md border border-line-hair bg-surface px-3 py-2.5 text-sm text-ink
                  outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                {...register('email', { required: true })}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-secondary">
                {t('login.password')}
              </span>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={errors.password ? 'true' : 'false'}
                className="w-full rounded-md border border-line-hair bg-surface px-3 py-2.5 text-sm text-ink
                  outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                {...register('password', { required: true })}
              />
            </label>
          </div>

            {/* Button defaults to type="button" (see ui/Button.jsx), so this
                click handler is the only submit path — the form's own onSubmit
                above still fires on Enter in a field, without a second,
                competing type="submit" trigger that would double-call
                handleSubmit(onSubmit) on a click. */}
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={busy || googleBusy}
              onClick={handleSubmit(onSubmit)}
            >
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              {busy ? t('login.signingIn') : t('login.signIn')}
            </Button>
          </form>

          {error ? (
            <p className="flex items-start gap-1.5 rounded-md bg-wash-critical px-3 py-2 text-xs text-status-critical">
              <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-2 text-2xs text-ink-muted">
            <span className="h-px flex-1 bg-line-hair" aria-hidden="true" />
            {t('login.orContinueWith')}
            <span className="h-px flex-1 bg-line-hair" aria-hidden="true" />
          </div>

          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={busy || googleBusy}
            onClick={onGoogleSignIn}
          >
            {googleBusy ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <GoogleMark />
            )}
            {googleBusy ? t('login.signingIn') : t('login.signInWithGoogle')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Google's own multi-colour "G" mark, per their sign-in button guidelines. */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8.1 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.1 8.1 3l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.5 0 10.5-2.1 14.2-5.6l-6.6-5.6C29.5 34.5 26.9 36 24 36c-5.3 0-9.6-3.1-11.3-7.5l-6.6 5.1C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-1 2.8-3 5.1-5.6 6.7l6.6 5.6C39.9 37.7 44 31.9 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}
