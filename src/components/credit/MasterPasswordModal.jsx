import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { KeyRound, ShieldAlert, WifiOff } from 'lucide-react';
import { OVERRIDE_MINUTES, requestCreditOverride } from '../../services/creditService';
import { fmtMMK } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
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
    toast.push(
      `${shop.name} released for ${OVERRIDE_MINUTES} minutes. The lock returns automatically.`,
      { tone: 'success' },
    );
    onGranted?.(result.override);
    close();
  };

  if (!open || !shop) return null;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Release a locked shop"
      subtitle={`${shop.name} · ${shop.township}`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            icon={KeyRound}
            disabled={submitting || !online}
            onClick={handleSubmit(onSubmit)}
          >
            {submitting ? 'Verifying…' : 'Release for 30 min'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-card border border-status-critical/40 bg-wash-critical px-3 py-2.5">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-status-critical" aria-hidden="true" />
          <div className="text-xs text-ink-secondary">
            <p className="text-sm font-medium text-ink">
              K {fmtMMK(state.overdueAmount)} is {state.maxDaysOverdue} day
              {state.maxDaysOverdue === 1 ? '' : 's'} past the 14-day term.
            </p>
            <p className="mt-0.5">
              Releasing this shop lets one more voucher through. The lock re-engages after{' '}
              {OVERRIDE_MINUTES} minutes — it is not a permanent exemption, and the release is
              recorded against your name.
            </p>
          </div>
        </div>

        {!online ? (
          <div className="flex items-start gap-2.5 rounded-card border border-line-hair bg-raised px-3 py-2.5 text-xs text-ink-secondary">
            <WifiOff size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>
              You are offline. The master password is verified on the server, so a release cannot
              be granted from a device with no signal — call the office to have the shop released.
            </p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label htmlFor="master-password" className="mb-1 block text-xs font-medium text-ink">
              Admin master password
            </label>
            <input
              id="master-password"
              type="password"
              autoComplete="off"
              disabled={!online}
              className="w-full rounded-md border border-line-hair bg-surface px-3 py-2 text-sm
                text-ink outline-none placeholder:text-ink-muted disabled:opacity-50"
              placeholder="••••"
              {...register('password', { required: 'Enter the master password.' })}
            />
            {errors.password ? (
              <p className="mt-1 text-xs text-status-critical">{errors.password.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="override-reason" className="mb-1 block text-xs font-medium text-ink">
              Reason (goes in the audit log)
            </label>
            <textarea
              id="override-reason"
              rows={2}
              disabled={!online}
              className="w-full resize-none rounded-md border border-line-hair bg-surface px-3 py-2
                text-sm text-ink outline-none placeholder:text-ink-muted disabled:opacity-50"
              placeholder="e.g. Shop paid by KBZPay this morning, transfer not yet cleared"
              {...register('reason', { required: 'A reason is required.', minLength: { value: 8, message: 'Give a little more detail.' } })}
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
