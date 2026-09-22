import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { rotateMasterPassword } from '../../services/userService';
import { OVERRIDE_MINUTES } from '../../services/creditService';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useToast } from '../ui/Toast';
import { Button } from '../ui/Button';

/**
 * The one password that lets an admin push a voucher through a shop the
 * 14-day rule has locked. Rotating it requires the CURRENT password, not just
 * an admin session — a desk left unlocked should not be enough to lock every
 * other admin out — and, like the override itself, it is a server-verified,
 * online-only action: see `services/userService.js#rotateMasterPassword`.
 */
export function MasterPasswordCard() {
  const { user } = useAuth();
  const { t } = useLocale();
  const online = useOnlineStatus();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({ defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });

  const onSubmit = async (values) => {
    if (values.newPassword !== values.confirm) {
      setError('confirm', { message: t('admin.mismatch') });
      return;
    }
    setSubmitting(true);
    const result = await rotateMasterPassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      actor: user,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError('currentPassword', { message: result.message });
      return;
    }
    toast.push(t('admin.rotatedToast'), { tone: 'success' });
    reset();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-card border border-line-hair bg-raised px-3 py-2.5 text-xs text-ink-secondary">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
        <p>{t('admin.passwordUse', { minutes: OVERRIDE_MINUTES })}</p>
      </div>

      <Field label={t('admin.currentPassword')} error={errors.currentPassword?.message}>
        <input
          type="password"
          autoComplete="off"
          disabled={!online}
          className="h-9 w-full rounded-md border border-line-hair bg-surface px-3 text-sm text-ink outline-none disabled:opacity-50"
          {...register('currentPassword', { required: t('admin.enterCurrent') })}
        />
      </Field>

      <Field label={t('admin.newPassword')} error={errors.newPassword?.message}>
        <input
          type="password"
          autoComplete="off"
          disabled={!online}
          className="h-9 w-full rounded-md border border-line-hair bg-surface px-3 text-sm text-ink outline-none disabled:opacity-50"
          {...register('newPassword', {
            required: t('admin.chooseNew'),
            minLength: { value: 4, message: t('admin.atLeast4') },
          })}
        />
      </Field>

      <Field label={t('admin.confirmNew')} error={errors.confirm?.message}>
        <input
          type="password"
          autoComplete="off"
          disabled={!online}
          className="h-9 w-full rounded-md border border-line-hair bg-surface px-3 text-sm text-ink outline-none disabled:opacity-50"
          {...register('confirm', { required: t('admin.confirmNewRequired') })}
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        icon={KeyRound}
        className="w-full"
        disabled={submitting || !online}
        onClick={handleSubmit(onSubmit)}
      >
        {submitting ? t('admin.rotating') : !online ? t('admin.offlineRotate') : t('admin.rotate')}
      </Button>
    </form>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-status-critical">{error}</span> : null}
    </label>
  );
}
