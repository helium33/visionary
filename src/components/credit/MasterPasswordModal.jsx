import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { KeyRound, ShieldAlert, WifiOff } from 'lucide-react';
import { OVERRIDE_MINUTES, requestCreditOverride } from '../../services/creditService';
import { fmtDays, fmtMMK } from '../../lib/format';
import { townshipLabel } from '../../constants/districts';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/**
 * The admin release valve for a shop the 14-day rule has locked.
 *
 * The password is checked by a Cloud Function, so this dialog is online-only by
 * design — see the note in services/creditService.js. Every attempt, successful
 * or not, lands in the audit log with the reason the admin typed.
 */
export function MasterPasswordModal({ open, shop, state, onClose, onGranted }) {
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const online = useOnlineStatus();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({ defaultValues: { password: '', reason: '' } });

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit = async (values) => {
    setSubmitting(true);
    const result = await requestCreditOverride({
      shopId: shop.id,
      password: values.password,
      reason: values.reason,
      actor: user,
      isOnline: online,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError('password', { message: result.message });
      return;
    }
    toast.push(t('credit.releasedToast', { shop: shop.name, minutes: OVERRIDE_MINUTES }), {
      tone: 'success',
    });
    onGranted?.(result.override);
    close();
  };

  if (!open || !shop) return null;

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('credit.releaseTitle')}
      subtitle={`${shop.name} · ${townshipLabel(shop.township, locale)}`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            icon={KeyRound}
            disabled={submitting || !online}
            onClick={handleSubmit(onSubmit)}
          >
            {submitting ? t('credit.verifying') : t('credit.releaseFor', { minutes: OVERRIDE_MINUTES })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-card border border-status-critical/40 bg-wash-critical px-3 py-2.5">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-status-critical" aria-hidden="true" />
          <div className="text-xs text-ink-secondary">
            <p className="text-sm font-medium text-ink">
              {t('credit.overdueDays', {
                amount: fmtMMK(state.overdueAmount),
                days: fmtDays(state.maxDaysOverdue),
              })}
            </p>
            <p className="mt-0.5">{t('credit.releaseExplain', { minutes: OVERRIDE_MINUTES })}</p>
          </div>
        </div>

        {!online ? (
          <div className="flex items-start gap-2.5 rounded-card border border-line-hair bg-raised px-3 py-2.5 text-xs text-ink-secondary">
            <WifiOff size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>{t('credit.offlineRelease')}</p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label htmlFor="master-password" className="mb-1 block text-xs font-medium text-ink">
              {t('credit.masterPassword')}
            </label>
            <input
              id="master-password"
              type="password"
              autoComplete="off"
              disabled={!online}
              className="w-full rounded-md border border-line-hair bg-surface px-3 py-2 text-sm
                text-ink outline-none placeholder:text-ink-muted disabled:opacity-50"
              placeholder="••••"
              {...register('password', { required: t('credit.enterPassword') })}
            />
            {errors.password ? (
              <p className="mt-1 text-xs text-status-critical">{errors.password.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="override-reason" className="mb-1 block text-xs font-medium text-ink">
              {t('credit.reasonLabel')}
            </label>
            <textarea
              id="override-reason"
              rows={2}
              disabled={!online}
              className="w-full resize-none rounded-md border border-line-hair bg-surface px-3 py-2
                text-sm text-ink outline-none placeholder:text-ink-muted disabled:opacity-50"
              placeholder={t('credit.reasonPlaceholder')}
              {...register('reason', {
                required: t('credit.reasonRequired'),
                minLength: { value: 8, message: t('credit.reasonMore') },
              })}
            />
            {errors.reason ? (
              <p className="mt-1 text-xs text-status-critical">{errors.reason.message}</p>
            ) : null}
          </div>
        </form>
      </div>
    </Modal>
  );
}
