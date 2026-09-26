import { useState } from 'react';
import { Ban, CheckCircle2, ShieldAlert } from 'lucide-react';
import { setUserActive, updateUserRole } from '../../services/userService';
import { ROLE_LABELS } from '../../lib/constants';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { initialsOf } from '../../lib/format';

const ROLE_OPTIONS = Object.keys(ROLE_LABELS);

/**
 * Role and status live-edit here; everything else about a user (name, email,
 * townships, commission rate) is set-up detail with nothing gated on it, so it
 * is shown but not editable from this pass — role assignment and account
 * status are the two things that change what a signed-in session can do.
 */
export function UsersTable({ users }) {
  const { user: me } = useAuth();
  const { t } = useLocale();
  const toast = useToast();
  const [pending, setPending] = useState(null);

  const onRoleChange = async (targetUser, role) => {
    if (role === targetUser.role) return;
    setPending(targetUser.id);
    const result = await updateUserRole({ userId: targetUser.id, role, actor: me });
    setPending(null);
    toast.push(
      result.ok
        ? t('admin.roleChanged', { name: targetUser.name, role: t(`labels.role.${role}`) })
        : result.message ?? t('admin.roleChangeFailed'),
      { tone: result.ok ? 'success' : 'error' },
    );
  };

  const onToggleActive = async (targetUser) => {
    setPending(targetUser.id);
    const result = await setUserActive({
      userId: targetUser.id,
      active: !targetUser.active,
      actor: me,
    });
    setPending(null);
    toast.push(
      result.ok
        ? t(targetUser.active ? 'admin.deactivatedToast' : 'admin.reactivatedToast', { name: targetUser.name })
        : result.message ?? t('admin.statusFailed'),
      { tone: result.ok ? 'success' : 'error' },
    );
  };

  return (
    <>
      <ul className="divide-y divide-line-hair lg:hidden">
        {users.map((row) => (
          <li key={row.id} className="px-4 py-3">
            <div className="flex items-start gap-2.5">
              <Avatar name={row.name} inactive={row.active === false} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                <p className="truncate text-2xs text-ink-secondary">{row.email}</p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <RoleSelect
                user={row}
                disabled={row.id === me?.id || pending === row.id}
                onChange={(role) => onRoleChange(row, role)}
              />
              <Button
                size="sm"
                variant={row.active === false ? 'secondary' : 'quiet'}
                icon={row.active === false ? CheckCircle2 : Ban}
                disabled={row.id === me?.id || pending === row.id}
                onClick={() => onToggleActive(row)}
              >
                {row.active === false ? t('admin.reactivate') : t('admin.deactivate')}
              </Button>
            </div>
            {row.id === me?.id ? (
              <p className="mt-1.5 text-2xs text-ink-muted">{t('admin.ownAccount')}</p>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line-hair text-left text-xs text-ink-secondary">
              <th className="px-4 py-2 font-medium">{t('admin.colUser')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.colRole')}</th>
              <th className="px-3 py-2 font-medium">{t('admin.colStatus')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('admin.colAction')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.id} className="border-b border-line-hair last:border-0 hover:bg-raised">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={row.name} inactive={row.active === false} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        {row.name}
                        {row.id === me?.id ? (
                          <span className="ml-1.5 text-2xs font-normal text-ink-muted">{t('admin.you')}</span>
                        ) : null}
                      </p>
                      <p className="truncate text-2xs text-ink-secondary">{row.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <RoleSelect
                    user={row}
                    disabled={row.id === me?.id || pending === row.id}
                    onChange={(role) => onRoleChange(row, role)}
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {row.active === false ? (
                    <span className="inline-flex items-center gap-1 text-2xs text-status-critical">
                      <Ban size={11} aria-hidden="true" /> {t('admin.deactivated')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-2xs text-status-good">
                      <CheckCircle2 size={11} aria-hidden="true" /> {t('admin.active')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Button
                    size="sm"
                    variant={row.active === false ? 'secondary' : 'quiet'}
                    icon={row.active === false ? CheckCircle2 : Ban}
                    disabled={row.id === me?.id || pending === row.id}
                    title={row.id === me?.id ? t('admin.cantChangeOwnAccount') : undefined}
                    onClick={() => onToggleActive(row)}
                  >
                    {row.active === false ? t('admin.reactivate') : t('admin.deactivate')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="flex items-start gap-2 border-t border-line-hair px-4 py-2.5 text-2xs text-ink-secondary">
        <ShieldAlert size={13} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
        {t('admin.roleNote')}
      </p>
    </>
  );
}

function RoleSelect({ user, disabled, onChange }) {
  const { t } = useLocale();
  return (
    <select
      aria-label={t('admin.roleFor', { name: user.name })}
      value={user.role}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      title={disabled ? t('admin.cantChangeOwnRole') : undefined}
      className="h-8 rounded-md border border-line-hair bg-surface px-2 text-xs text-ink outline-none disabled:opacity-50"
    >
      {ROLE_OPTIONS.map((key) => (
        <option key={key} value={key}>
          {t(`labels.role.${key}`)}
        </option>
      ))}
    </select>
  );
}

function Avatar({ name, inactive }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-2xs font-medium ${
        inactive ? 'bg-raised text-ink-muted' : 'bg-raised text-ink-secondary'
      }`}
    >
      {initialsOf(name)}
    </span>
  );
}
