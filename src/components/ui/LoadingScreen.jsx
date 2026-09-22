import { GlassesMark } from '../brand/BrandLogo';

/**
 * The brand mark breathing inside a spinning ring. index.html paints the same
 * markup before any JavaScript arrives, so the hand-over from that splash to
 * this screen (while the session is restored) shows no jump — only the label
 * appears. motion-safe: people who ask their device for reduced motion get a
 * still mark.
 */
function LoaderMark({ size = 'lg' }) {
  const large = size === 'lg';
  return (
    <div className={`relative grid place-items-center ${large ? 'h-24 w-24' : 'h-14 w-14'}`}>
      <span
        className="absolute inset-0 rounded-full border-[3px] border-line-hair border-t-brand-primary motion-safe:animate-spin"
        aria-hidden="true"
      />
      <span
        className={`grid place-items-center bg-brand-primary text-white motion-safe:animate-breathe ${
          large ? 'h-14 w-14 rounded-2xl' : 'h-8 w-8 rounded-lg'
        }`}
      >
        <GlassesMark className={large ? 'h-8 w-5' : 'h-5 w-3'} />
      </span>
    </div>
  );
}

export function LoadingScreen({ label }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-5 bg-plane"
      role="status"
      aria-live="polite"
    >
      <LoaderMark />
      <p className="text-sm font-medium text-ink-secondary">{label}</p>
    </div>
  );
}

/** Inside the app shell, while a page's code downloads. */
export function PageLoader({ label }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <LoaderMark size="sm" />
      <p className="text-xs text-ink-secondary">{label}</p>
    </div>
  );
}
