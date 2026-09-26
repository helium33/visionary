import { AGING_BUCKETS } from '../../domain/credit';
import { useLocale } from '../../context/LocaleContext';
import { StackedBar } from './StackedBar';

/** Receivables ageing — every open voucher placed against its 14-day term. */
export function AgingBar({ buckets, total }) {
  const { t } = useLocale();
  const segments = AGING_BUCKETS.map((bucket) => ({
    ...bucket,
    label: t(`labels.agingBucket.${bucket.key}`),
    range: t(`labels.agingRange.${bucket.key}`),
    value: buckets[bucket.key] ?? 0,
  }));

  return (
    <StackedBar
      segments={segments}
      total={total}
      ariaLabel={t('charts.agingAria', { count: segments.length })}
    />
  );
}
