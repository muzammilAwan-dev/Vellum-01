import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

// ── Table primitives ──
// `hideMid`: a secondary column, hidden between `narrow` (520) and `xl` (1280) where the sidebar
// leaves too little room. On phones (stacked rows) it shows again as a labelled line.
export const Th = ({ children, className, hideMid, ...props }) => (
  <th {...props} className={cn("whitespace-nowrap px-3 py-2.5 narrow:px-4 text-left text-[12px] font-semibold text-ink-3", hideMid && "narrow:max-xl:hidden", className)}>
    {children}
  </th>
);

// `label`: shown before the value when rows stack on phones (TableShell `stack`).
// Cells without a label take the whole line (the row's title, its actions).
// `hidePhone`: left out of the stacked card on phones (a detail that only makes the card longer).
export const Td = ({ children, className, label, hideMid, hidePhone, ...props }) => (
  <td {...props} data-label={label} data-phone={hidePhone ? "hide" : undefined} className={cn("px-3 py-3 align-middle narrow:px-4 text-[13px] text-ink-2", hideMid && "narrow:max-xl:hidden", className)}>
    {children}
  </td>
);

// Stacked rows under `narrow` (520 px): each row becomes a small card, the header row is kept
// for screen readers only, and labelled cells read "Marks   12/16". Wider screens get the table,
// in a scroll box that keyboard users can reach (tabIndex + region name, WCAG 2.1.1).
const STACK = cn(
  "max-narrow:block max-narrow:[&_thead]:sr-only max-narrow:[&_tbody]:block",
  "max-narrow:[&_tbody>tr]:block max-narrow:[&_tbody>tr]:border-b max-narrow:[&_tbody>tr]:border-rule max-narrow:[&_tbody>tr]:px-1 max-narrow:[&_tbody>tr]:py-2.5 max-narrow:[&_tbody>tr:last-child]:border-b-0",
  "max-narrow:[&_tbody>tr>td]:flex max-narrow:[&_tbody>tr>td]:min-h-9 max-narrow:[&_tbody>tr>td]:items-center max-narrow:[&_tbody>tr>td]:justify-between max-narrow:[&_tbody>tr>td]:gap-3 max-narrow:[&_tbody>tr>td]:py-1 max-narrow:[&_tbody>tr>td]:text-right",
  // Unlabelled cells (the row's title, its actions) are plain blocks: their content keeps its own layout.
  "max-narrow:[&_tbody>tr>td:not([data-label])]:block max-narrow:[&_tbody>tr>td:not([data-label])]:text-left",
  "max-narrow:[&_tbody>tr>td[data-phone=hide]]:hidden",
  "max-narrow:[&_tbody>tr>td[data-label]]:before:shrink-0 max-narrow:[&_tbody>tr>td[data-label]]:before:text-left max-narrow:[&_tbody>tr>td[data-label]]:before:text-[12px] max-narrow:[&_tbody>tr>td[data-label]]:before:font-medium max-narrow:[&_tbody>tr>td[data-label]]:before:text-ink-3 max-narrow:[&_tbody>tr>td[data-label]]:before:content-[attr(data-label)]",
  "max-narrow:[&_tbody>tr>td:empty]:hidden max-narrow:[&_tbody>tr>td[colspan]]:block max-narrow:[&_tbody>tr>td[colspan]]:px-0",
);

export const TableShell = ({ children, className, label, stack = false }) => (
  <div className={cn("overflow-hidden rounded-[var(--radius-container)] border border-rule bg-surface shadow-[var(--shadow-card)]", className)}>
    <div
      className="overflow-x-auto focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
      tabIndex={label ? 0 : undefined}
      role={label ? "region" : undefined}
      aria-label={label}
    >
      <table className={cn("w-full border-collapse", stack && STACK)}>{children}</table>
    </div>
  </div>
);

// ── Row toggle: the keyboard way into an expandable row ──
// A row may still open on a mouse click anywhere, but this button (in the row's first cell) is
// what keyboard and screen-reader users reach: it says whether the detail is open.
export const RowToggle = ({ open, onToggle, controls, children, className }) => (
  <button
    type="button"
    aria-expanded={open}
    aria-controls={open ? controls : undefined}
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    className={cn(
      "inline-flex min-h-8 min-w-0 items-center gap-1.5 rounded-sm text-left font-medium text-ink transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40",
      className,
    )}
  >
    <ChevronRight size={14} aria-hidden="true" className={cn("shrink-0 text-ink-3 transition-transform motion-reduce:transition-none", open && "rotate-90 text-primary")} />
    <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
  </button>
);
