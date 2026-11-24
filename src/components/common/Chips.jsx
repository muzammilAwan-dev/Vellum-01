import { cn } from "@/lib/cn";

export const ChipRow = ({ children }) => <div className="flex flex-wrap gap-1.5">{children}</div>;

// `check`: multi-select chips show a tick when on, so the state is not colour alone.
export const Chip = ({ active, onClick, children, dashed, check }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active === undefined ? undefined : !!active}
    className={cn(
      "inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring/40",
      dashed && "border-dashed",
      active
        ? "border-primary bg-primary text-on-primary shadow-[var(--shadow-primary)]"
        : "border-rule-2 text-ink-2 hover:border-rule-3 hover:bg-raised hover:text-ink"
    )}
  >
    {check && active && (
      <svg viewBox="0 0 12 12" aria-hidden="true" className="-ml-1 size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6.2l2.3 2.3 4.7-4.9" />
      </svg>
    )}
    {children}
  </button>
);

// ── Filter rail — Tesla-style full-width button dropdowns ──
// Replaces scattered chips. Each filter is a self-contained button
// that shows label above value. Click opens dropdown menu.
export const FilterButton = ({ label, value, onClick, active }) => (
  <button
    onClick={onClick}
    className={cn(
      "group inline-flex min-w-[140px] flex-col items-start gap-0.5 rounded-[var(--radius-control)] border bg-surface px-3.5 py-2 text-left transition-all duration-200",
      active
        ? "border-primary/40 bg-primary-soft"
        : "border-rule-2 hover:border-rule-3 hover:bg-raised"
    )}
  >
    <span className="text-[12px] font-semibold text-ink-3">
      {label}
    </span>
    <span className="flex w-full items-center justify-between gap-2 text-[13px] font-medium text-ink">
      <span className="truncate">{value}</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3 transition-transform group-hover:translate-y-0.5">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  </button>
);
