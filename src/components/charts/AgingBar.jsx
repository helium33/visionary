import { AGING_BUCKETS } from '../../domain/credit';
import { StackedBar } from './StackedBar';

/** Receivables ageing — every open voucher placed against its 14-day term. */
export function AgingBar({ buckets, total }) {
  const segments = AGING_BUCKETS.map((bucket) => ({
    ...bucket,
    value: buckets[bucket.key] ?? 0,
  }));

  return (
    <StackedBar
      segments={segments}
      total={total}
      ariaLabel={`Receivables ageing across ${segments.length} bands`}
    />
  );
}
