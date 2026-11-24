import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

// Menu button (WAI-ARIA APG "menu button"): the trigger opens a list of actions,
// focus moves into the list, arrows/Home/End move, Esc closes and returns focus.
// The list is portalled and fixed-positioned so tables and modals never clip it.
//
// items: [{ id, label, onSelect, danger?, disabled?, separatorBefore? }]
const GAP = 4;
const WIDTH = 184;

export function ActionMenu({ label, items, className }) {
  const uid = useId();
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const itemRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  const openMenu = () => {
    if (!triggerRef.current || enabled.length === 0) return;
    const r = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const want = items.length * 40 + 16;
    const below = vh - r.bottom - GAP - 8;
    const up = below < want && r.top - GAP - 8 > below;
    setPos({
      right: Math.max(8, vw - r.right),
      width: Math.min(WIDTH, vw - 16),
      maxHeight: Math.max(120, up ? r.top - GAP - 8 : below),
      ...(up ? { bottom: vh - r.top + GAP } : { top: r.bottom + GAP }),
    });
    setOpen(true);
  };

  const close = (refocus) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (open) itemRefs.current[enabled[0]]?.focus();
    // enabled is derived from items on each render; only (re)focus on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || listRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onScroll = (e) => {
      if (listRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const focusAt = (pos0) => itemRefs.current[enabled[pos0]]?.focus();

  const onListKeyDown = (e) => {
    const current = enabled.findIndex((i) => itemRefs.current[i] === document.activeElement);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusAt((current + 1) % enabled.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusAt((current - 1 + enabled.length) % enabled.length);
        break;
      case "Home":
        e.preventDefault();
        focusAt(0);
        break;
      case "End":
        e.preventDefault();
        focusAt(enabled.length - 1);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case "Tab":
        close(true); // focus returns to the trigger, then Tab moves on from there
        break;
      default:
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${uid}-menu` : undefined}
        onClick={(e) => {
          e.stopPropagation(); // rows are clickable; the menu must not open the row
          if (open) close(false);
          else openMenu();
        }}
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-raised hover:text-ink focus-visible:ring-4 focus-visible:ring-ring/25 pointer-coarse:size-11",
          open && "bg-raised text-ink",
          className,
        )}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            id={`${uid}-menu`}
            role="menu"
            aria-label={label}
            onKeyDown={onListKeyDown}
            onClick={(e) => e.stopPropagation()} // portal events still bubble through React ancestors (the row)
            style={pos}
            className="fixed z-110 animate-fade-in overflow-y-auto overscroll-contain rounded-[var(--radius-control)] border border-rule-2 bg-floating p-1 shadow-[var(--shadow-modal)]"
          >
            {items.map((it, i) => (
              <div key={it.id}>
                {it.separatorBefore && i > 0 && <div role="separator" className="my-1 h-px bg-rule" />}
                <button
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={it.disabled}
                  onClick={() => {
                    close(true);
                    it.onSelect?.();
                  }}
                  className={cn(
                    "flex min-h-10 w-full items-center rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-left text-[13.5px] font-medium text-ink transition-colors hover:bg-raised focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-12 pointer-coarse:text-[15px]",
                    it.danger && "text-danger hover:bg-danger-dim focus-visible:bg-danger-dim",
                  )}
                >
                  {it.label}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
