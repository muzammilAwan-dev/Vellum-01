import { cn } from "@/lib/cn";

// ── Status indicator — dot + text, no pill background ──
// "live" is its own tone (a running test is good news, not an error): primary, gently pulsing.
const DOT_COLOR = { success: "bg-success", warning: "bg-warning", danger: "bg-danger", primary: "bg-primary", muted: "bg-ink-3", live: "bg-primary motion-safe:animate-beacon" };

const DOT_TEXT = { success: "text-success", warning: "text-warning", danger: "text-danger", primary: "text-primary", muted: "text-ink-3", live: "font-semibold text-primary" };

export const StatusDot = ({ tone = "success", children }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium">
    <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", DOT_COLOR[tone])} />
    <span className={DOT_TEXT[tone]}>{children}</span>
  </span>
);
