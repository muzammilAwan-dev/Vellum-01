import { cn } from "@/lib/cn";

// ═══════════════════════════════════════════════════════════════
// LOADING BUTTON
// ═══════════════════════════════════════════════════════════════
export const LoadingButton = ({
  loading,
  children,
  variant = "primary",
  className,
  ...props
}) => {
  const variants = {
    primary:
      "bg-primary text-on-primary shadow-[var(--shadow-primary)] hover:bg-primary-2 hover:shadow-[var(--shadow-glow)] disabled:bg-raised disabled:text-ink-3 disabled:shadow-none disabled:opacity-100 disabled:ring-1 disabled:ring-inset disabled:ring-rule-2",
    secondary:
      "border border-rule-2 bg-surface text-ink hover:border-rule-3 hover:bg-raised",
    ghost: "text-ink-2 hover:bg-raised hover:text-ink",
    danger:
      "bg-danger text-on-danger shadow-[var(--shadow-danger)] hover:opacity-90",
  };
  return (
    <button
      disabled={loading || props.disabled}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] px-4 py-2 text-[13px] font-semibold transition-all duration-300 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 pointer-coarse:min-h-11",
        variants[variant],
        className,
      )}
      {...props}
    >
      {loading && (
        <span aria-hidden="true" className="size-3 animate-spin-fast rounded-full border-2 border-current border-t-transparent" />
      )}
      <span className="inline-flex items-center gap-1.5">{children}</span>
    </button>
  );
};
