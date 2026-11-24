import { useRef } from "react";
import { cn } from "@/lib/cn";

// ── Segmented control: one choice out of a few, shown side by side ──
// role="radiogroup" with roving focus (arrow keys move and select, like native radios).
// options: [{ value, label, count?, disabled? }]
export const Segmented = ({ label, value, onChange, options, size = "md", className }) => {
  const refs = useRef([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const current = Math.max(0, options.findIndex((o) => o.value === value));
  const move = (dir) => {
    const at = enabled.indexOf(current);
    const next = enabled[(at + dir + enabled.length) % enabled.length];
    refs.current[next]?.focus();
    onChange(options[next].value);
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(1); }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      }}
      className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-[var(--radius-control)] border border-rule-2 bg-sunken p-1 [scrollbar-width:none]", className)}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius-control)-4px)] px-3 font-medium transition-colors",
              size === "sm" ? "min-h-8 text-[12.5px]" : "min-h-9 text-[13px] pointer-coarse:min-h-10",
              "focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-45",
              on ? "bg-surface text-ink shadow-[var(--shadow-card)] dark:bg-raised" : "text-ink-3 hover:text-ink",
            )}
          >
            {o.label}
            {o.count != null && (
              <span className="tabular-nums text-[12px] text-ink-3">{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};
