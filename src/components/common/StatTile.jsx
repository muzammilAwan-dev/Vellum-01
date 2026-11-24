import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/cn";

// ── Stat tile: label, one number, one caption ──
// The caption explains the number and sits under it (never squeezed into a corner chip).
// `tone` colours only the caption's dot + text: neutral (default), good, attention, danger.
// Green ("good") means "nothing to do", never a count of problems.
// `to` turns the whole tile into a link (with a visible arrow).
const CAPTION = {
  neutral: { dot: "bg-ink-4 dark:bg-ink-3", text: "text-ink-3" },
  good: { dot: "bg-success", text: "text-success" },
  attention: { dot: "bg-warning", text: "text-warning" },
  danger: { dot: "bg-danger", text: "text-danger" },
};

export const StatTile = ({ icon: Icon, label, value, unit, caption, tone = "neutral", to, className }) => {
  const c = CAPTION[tone] ?? CAPTION.neutral;
  const body = (
    <>
      <div className="flex items-start gap-2.5">
        {Icon && (
          <span className={cn("grid size-8 shrink-0 max-narrow:hidden place-items-center rounded-lg", tone === "danger" ? "bg-danger-dim text-danger" : tone === "attention" ? "bg-warning-dim text-warning" : "bg-primary-dim text-primary")}>
            <Icon size={16} aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 flex-1 self-center text-[13px] font-medium leading-snug text-ink-2">{label}</span>
        {to && <ArrowUpRight size={15} aria-hidden="true" className="shrink-0 text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />}
      </div>
      <div className="mt-4 flex items-baseline gap-1 font-display text-[30px] font-bold leading-none tracking-[-0.03em] tabular-nums text-ink max-narrow:text-[26px]">
        {value}
        {unit && <span className="text-[14px] font-medium tracking-normal text-ink-3">{unit}</span>}
      </div>
      {caption && (
        <div className={cn("mt-2.5 flex items-start gap-1.5 text-[12.5px] font-medium leading-snug", c.text)}>
          <span aria-hidden="true" className={cn("mt-[6px] size-1.5 shrink-0 rounded-full", c.dot)} />
          <span className="min-w-0">{caption}</span>
        </div>
      )}
    </>
  );
  const base = "group relative flex min-w-0 flex-col rounded-[var(--radius-bento)] border border-rule bg-surface p-5 shadow-[var(--shadow-card)] max-narrow:p-4";
  return to ? (
    <Link to={to} className={cn(base, "transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-rule-3 hover:shadow-[var(--shadow-raised)] focus-visible:ring-2 focus-visible:ring-ring/50", className)}>
      {body}
    </Link>
  ) : (
    <div className={cn(base, className)}>{body}</div>
  );
};

// Tiles flow into as many columns as fit (no empty slot when there are 3).
export const StatGrid = ({ children, className }) => (
  <div className={cn("grid grid-cols-2 gap-3 tablet:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] tablet:gap-4 max-tablet:[&>*:last-child:nth-child(odd)]:col-span-2", className)}>{children}</div>
);
