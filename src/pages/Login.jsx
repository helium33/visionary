import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useForm } from 'react-hook-form';
import { AlertCircle, Loader2 } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { BrandLogo } from '../components/brand/BrandLogo';
import { Button } from '../components/ui/Button';

/**
 * Firebase error codes turned into copy a shop owner can act on, without
 * leaking which half was wrong — Firebase itself no longer distinguishes
 * "no such user" from "wrong password" (both come back as
 * `auth/invalid-credential`) specifically so a login screen can't be used to
 * probe which emails have accounts. `auth/invalid-email` is the one case
 * safe to be specific about — it's a format check, not an account lookup.
 */
function loginErrorMessage(error) {
  switch (error?.code) {
    case 'auth/invalid-email':
      return 'That doesn’t look like a valid email address.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact your administrator.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return 'Something went wrong signing in. Please try again.';
  }
}

export default function Login() {
  const { user } = useAuth();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

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
      setError(loginErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-plane px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandLogo />
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="card w-full space-y-4 p-6 sm:p-8"
        >
          <div>
            <h1 className="text-lg font-semibold text-ink">Sign in</h1>
            <p className="mt-1 text-xs text-ink-secondary">
              The session stays on this device, so the app keeps working in the field with no
              signal.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-secondary">Email</span>
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
              <span className="mb-1 block text-xs font-medium text-ink-secondary">Password</span>
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

          {error ? (
            <p className="flex items-start gap-1.5 rounded-md bg-wash-critical px-3 py-2 text-xs text-status-critical">
              <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          {/* Button defaults to type="button" (see ui/Button.jsx), so this
              click handler is the only submit path — the form's own onSubmit
              above still fires on Enter in a field, without a second,
              competing type="submit" trigger that would double-call
              handleSubmit(onSubmit) on a click. */}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={handleSubmit(onSubmit)}
          >
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
