import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useForm } from 'react-hook-form';
import { Glasses } from 'lucide-react';
import { auth } from '../lib/firebase';
import { Button } from '../components/ui/Button';

export default function Login() {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit } = useForm();

  const onSubmit = async ({ email, password }) => {
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError('Email or password is incorrect.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-plane px-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="card w-full max-w-sm space-y-4 p-6"
      >
        <div className="flex items-center gap-2">
          <Glasses size={20} className="text-series-1" aria-hidden="true" />
          <h1 className="text-base font-semibold text-ink">Visionary</h1>
        </div>
        <p className="text-xs text-ink-secondary">
          Sign in once — the session is kept on this device so the app keeps working in the field
          with no signal.
        </p>

        <div className="space-y-2">
          <input
            type="email"
            autoComplete="username"
            placeholder="Email"
            className="w-full rounded-md border border-line-hair bg-surface px-3 py-2 text-sm text-ink outline-none"
            {...register('email', { required: true })}
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            className="w-full rounded-md border border-line-hair bg-surface px-3 py-2 text-sm text-ink outline-none"
            {...register('password', { required: true })}
          />
        </div>

        {error ? <p className="text-xs text-status-critical">{error}</p> : null}

        <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={handleSubmit(onSubmit)}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
