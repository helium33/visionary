/**
 * ---------------------------------------------------------------------------
 * PLAN B VISION EYEWEARS — brand mark.
 * ---------------------------------------------------------------------------
 * The real mark, traced from the owner's logo artwork (see `brandArt.js`):
 * "PLAN" between two rules, the "B" drawn as a pair of sunglasses, "VISION"
 * over a tracked "EYEWEARS", white on a brand-primary plate. It replaced a
 * lookalike set in a web font, which the owner rightly said was not their
 * logo.
 *
 * Two sizes, not one scalable one: the full lockup needs real width to read,
 * and the 56px sidebar header row does not have it. `compact` renders just
 * the sunglasses-B as a small badge — AppShell puts the "Visionary" wordmark
 * beside it as plain text, the same layout the sidebar already had.
 */
import { B_MARK_PATH, B_MARK_VIEWBOX, LOGO_VIEWBOX, WORDMARK_PATH } from './brandArt';

export function BrandLogo({ compact = false, className = '' }) {
  if (compact) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-md bg-brand-primary px-1.5 py-1 text-white ${className}`}
        role="img"
        aria-label="Plan B Vision Eyewears"
      >
        <GlassesMark className="h-5 w-auto" />
      </span>
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center rounded-3xl bg-brand-primary px-7 py-5 text-white sm:px-9 sm:py-6 ${className}`}
      role="img"
      aria-label="Plan B Vision Eyewears"
    >
      <LogoArt className="h-14 w-auto sm:h-16" />
    </div>
  );
}

/** The words, the rules and the B, in `currentColor`. */
export function LogoArt({ className = '' }) {
  return (
    <svg viewBox={LOGO_VIEWBOX} className={className} fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d={WORDMARK_PATH} />
      <path fillRule="evenodd" d={B_MARK_PATH} />
    </svg>
  );
}

/**
 * The sunglasses "B" on its own, in `currentColor`.
 * index.html's pre-JS splash inlines this same path — keep the two in step.
 */
export function GlassesMark({ className = '' }) {
  return (
    <svg viewBox={B_MARK_VIEWBOX} className={className} fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d={B_MARK_PATH} />
    </svg>
  );
}
