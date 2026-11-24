import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";

// ── Inline notice (callout) ──
// Body text stays in ink-2 for contrast in both themes; only the rule and the icon carry the tone.
const TONE = {
  info: { box: "border-primary/25 bg-primary-soft", icon: "text-primary", Icon: Info },
  warning: { box: "border-warning/35 bg-warning-dim", icon: "text-warning", Icon: AlertTriangle },
  danger: { box: "border-danger/35 bg-danger-dim", icon: "text-danger", Icon: ShieldAlert },
  success: { box: "border-success/30 bg-success-dim", icon: "text-success", Icon: CheckCircle2 },
};

export const Notice = ({ tone = "info", title, children, action, className }) => {
  const t = TONE[tone] ?? TONE.info;
  return (
    <div className={cn("flex items-start gap-2.5 rounded-[var(--radius-control)] border px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-2", t.box, className)}>
      <t.Icon size={15} aria-hidden="true" className={cn("mt-[2px] shrink-0", t.icon)} />
      <div className="min-w-0 flex-1">
        {title && <div className="mb-0.5 text-[13px] font-semibold text-ink">{title}</div>}
        {children}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
};
