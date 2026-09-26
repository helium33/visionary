import { AlertTriangle, CheckCircle2, Clock, Lock, ShieldCheck } from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { CREDIT_STATUS } from '../../domain/credit';

/**
 * Status colour never travels alone: every pill carries an icon and a word, so
 * the state survives colour-blindness, a greyscale print-out and a cracked
 * phone screen in a dim shophouse.
 */
const TONES = {
  good: { text: 'text-status-good', bg: 'bg-wash-good', icon: CheckCircle2 },
  warning: { text: 'text-ink', bg: 'bg-wash-warning', icon: Clock },
  serious: { text: 'text-ink', bg: 'bg-wash-serious', icon: AlertTriangle },
  critical: { text: 'text-status-critical', bg: 'bg-wash-critical', icon: Lock },
  neutral: { text: 'text-ink-secondary', bg: 'bg-raised', icon: ShieldCheck },
};

const STATUS_TONE = {
  [CREDIT_STATUS.ACTIVE]: 'good',
  [CREDIT_STATUS.WATCH]: 'warning',
  [CREDIT_STATUS.OVERDUE]: 'serious',
  [CREDIT_STATUS.LOCKED]: 'critical',
};

export function StatusPill({ status, tone, label, detail, size = 'md' }) {
  const { t } = useLocale();
  const [resolvedTone, resolvedLabel] = STATUS_TONE[status]
    ? [STATUS_TONE[status], t(`labels.creditStatus.${status}`)]
    : [tone ?? 'neutral', label ?? status];
  const config = TONES[tone ?? resolvedTone] ?? TONES.neutral;
  const Icon = config.icon;
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-2xs' : 'px-2 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-medium ${config.bg} ${config.text} ${pad}`}
    >
      <Icon size={size === 'sm' ? 11 : 13} aria-hidden="true" />
      {label ?? resolvedLabel}
      {detail ? <span className="font-normal opacity-80">· {detail}</span> : null}
    </span>
  );
}
