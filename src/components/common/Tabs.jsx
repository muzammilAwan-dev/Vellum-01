import { useId, useRef } from "react";
import { cn } from "@/lib/cn";

// ── In-page tabs (WAI-ARIA tabs, automatic activation) ──
// Same underline look as the Audit route tabs, so the app has one tab pattern.
// tabs: [{ id, label, count? }]; render the panel with <TabPanel> using the same id.
export const Tabs = ({ label, tabs, value, onChange, idBase, className }) => {
  const auto = useId();
  const base = idBase ?? auto;
  const refs = useRef([]);
  const at = Math.max(0, tabs.findIndex((t) => t.id === value));
  const go = (i) => {
    const n = (i + tabs.length) % tabs.length;
    refs.current[n]?.focus();
    onChange(tabs[n].id);
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); go(at + 1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); go(at - 1); }
        if (e.key === "Home") { e.preventDefault(); go(0); }
        if (e.key === "End") { e.preventDefault(); go(tabs.length - 1); }
      }}
      className={cn("flex gap-1 overflow-x-auto border-b border-rule [scrollbar-width:none]", className)}
    >
      {tabs.map((t, i) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={on}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              "-mb-px inline-flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 px-4 text-[13.5px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 pointer-coarse:min-h-12",
              on ? "border-primary text-primary" : "border-transparent text-ink-3 hover:text-ink",
            )}
          >
            {t.label}
            {t.count != null && (
              <span className={cn("rounded-full px-1.5 text-[12px] tabular-nums", on ? "bg-primary-dim text-primary" : "bg-raised text-ink-3")}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export const TabPanel = ({ idBase, id, children, className }) => (
  <div role="tabpanel" id={`${idBase}-panel-${id}`} aria-labelledby={`${idBase}-tab-${id}`} className={className}>
    {children}
  </div>
);
