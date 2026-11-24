import { cn } from "@/lib/cn";

// On/off switch (WAI-ARIA "switch"). The off state must stay visible against the card
// (WCAG 1.4.11, 3:1): a solid ink-3 outline and knob, not a pale fill on a pale card.
// On: filled with primary, white knob, plus a check mark so state is not colour alone.
export const Switch = ({ checked, onChange, labelId, descId, label, disabled, className }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={labelId}
    aria-label={labelId ? undefined : label}
    aria-describedby={descId}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors duration-200 pointer-coarse:h-7 pointer-coarse:w-12",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
      checked ? "border-primary bg-primary" : "border-ink-3 bg-surface",
      className,
    )}
  >
    <span
      aria-hidden="true"
      className={cn(
        "grid size-4 place-items-center rounded-full transition-transform duration-200 pointer-coarse:size-5",
        checked ? "translate-x-[22px] bg-on-primary text-primary pointer-coarse:translate-x-[22px]" : "translate-x-[3px] bg-ink-3",
      )}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.2l2.3 2.3 4.7-4.9" />
        </svg>
      )}
    </span>
  </button>
);
