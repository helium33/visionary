import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useLocale } from '../../context/LocaleContext';

/**
 * Offline state is a first-class part of the UI, not an error.
 *
 * Three distinct states, because they mean different things to a rep:
 *  - Offline: writes are being queued locally and will sync later.
 *  - Syncing: connected, but some writes have not been acknowledged yet.
 *  - Synced: everything on this device is on the server.
 */
export function SyncBadge({ sync }) {
  const online = useOnlineStatus();
  const { t } = useLocale();
  const pending = sync?.pendingWrites;

  const [Icon, label, tone] = !online
    ? [CloudOff, t('header.offline'), 'bg-wash-warning text-ink']
    : pending
      ? [RefreshCw, t('header.syncing'), 'bg-wash-accent text-ink']
      : [Cloud, t('header.synced'), 'bg-raised text-ink-secondary'];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-2xs font-medium ${tone}`}
      title={t(!online ? 'header.offlineHint' : pending ? 'header.syncingHint' : 'header.syncedHint')}
    >
      <Icon size={12} className={pending && online ? 'animate-spin' : ''} aria-hidden="true" />
      {label}
    </span>
  );
}
