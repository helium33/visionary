/**
 * ---------------------------------------------------------------------------
 * PLAN B VISION EYEWEARS — brand mark.
 * ---------------------------------------------------------------------------
 * Recreated in Tailwind + SVG rather than shipped as an image asset, per the
 * brief: a solid brand-primary card, white content, "PLAN" left of a huge
 * stylized "B" (two glasses-lens rings stacked on a vertical spine — the
 * rings meet exactly where the spine ends, so the shape reads as one glyph,
 * not three separate pieces), "VISION" right of it with "EYEWEARS" tracked
 * out in smaller caps beneath.
 *
 * Two sizes, not one scalable one: the full lockup below needs real width to
 * read (three text blocks either side of a tall mark), and the 56px sidebar
 * header row this app already has doesn't have it. Rather than one component
 * straining to serve both, `compact` renders just the glasses-B mark as a
 * small badge — AppShell puts the "Visionary" wordmark beside it as plain
 * text, the same layout the sidebar already had.
 */
export function BrandLogo({ compact = false, className = '' }) {
  if (compact) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-md bg-brand-primary p-1 text-white ${className}`}
        role="img"
        aria-label="Plan B Vision Eyewears"
      >
        <GlassesMark className="h-5 w-3" />
      </span>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-3 rounded-3xl bg-brand-primary px-6 py-4 text-white sm:gap-4 sm:px-8 ${className}`}
      role="img"
      aria-label="Plan B Vision Eyewears"
    >
      <div className="flex flex-col items-center gap-1.5">
        <span className="h-px w-10 bg-white/70 sm:w-12" aria-hidden="true" />
        <span className="text-xl font-extrabold tracking-wide sm:text-2xl">PLAN</span>
        <span className="h-px w-10 bg-white/70 sm:w-12" aria-hidden="true" />
      </div>

      <GlassesMark className="h-12 w-7 shrink-0 sm:h-14 sm:w-8" />

      <div className="flex flex-col items-start">
        <span className="text-xl font-extrabold tracking-wide sm:text-2xl">VISION</span>
        <span className="text-[0.6rem] font-semibold tracking-[0.3em] text-white/90">EYEWEARS</span>
      </div>
    </div>
  );
}

/**
 * The "B": two lens rings on a vertical spine, tangent where the spine ends.
 * index.html's pre-JS splash inlines this same SVG — keep the two in step.
 */
export function GlassesMark({ className = '' }) {
  return (
    <svg viewBox="0 0 34 56" className={className} fill="none" aria-hidden="true">
      <rect x="3" y="3" width="5" height="50" rx="2.5" fill="currentColor" />
      <circle cx="17" cy="15.5" r="12.5" stroke="currentColor" strokeWidth="4" />
      <circle cx="17" cy="40.5" r="12.5" stroke="currentColor" strokeWidth="4" />
    </svg>
  );
}
