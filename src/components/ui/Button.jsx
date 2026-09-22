const VARIANTS = {
  primary: 'bg-brand-primary text-white hover:opacity-90',
  secondary: 'border border-line-hair bg-surface text-ink hover:bg-raised',
  ghost: 'text-ink-secondary hover:bg-raised hover:text-ink',
  danger: 'bg-status-critical text-white hover:opacity-90',
  quiet: 'border border-line-hair bg-transparent text-ink-secondary hover:text-ink',
};

const SIZES = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-md font-medium transition
        disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {Icon ? <Icon size={size === 'sm' ? 14 : 16} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
