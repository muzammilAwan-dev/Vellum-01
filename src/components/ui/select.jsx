import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputClasses } from "@/components/ui/input";

// Select-only combobox (WAI-ARIA APG). Focus stays on the trigger and the
// highlighted option is announced through aria-activedescendant. The list is
// portalled to <body> and positioned with fixed coordinates so a modal body's
// overflow never clips it, and it never draws outside the viewport (the native
// popup did, in the phone screenshots).
//
// options: [{ value, label, disabled? }]   (labels are plain strings)
// onChange receives the option's value, not an event.
const GAP = 6;
const MIN_W = 160;
const MAX_H = 288;

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  id,
  className,
  disabled = false,
  "aria-label": ariaLabel,
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const typed = useRef({ text: "", timer: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;
  const firstEnabled = options.findIndex((o) => !o.disabled);
  const lastEnabled = options.findLastIndex((o) => !o.disabled);

  const openList = () => {
    if (disabled || options.length === 0 || !triggerRef.current) return;
    // Safari does not focus a button on click; keyboard control needs focus.
    triggerRef.current.focus();
    const r = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, MIN_W), vw - 16);
    const left = Math.max(8, Math.min(r.left, vw - width - 8));
    const below = vh - r.bottom - GAP - 8;
    const above = r.top - GAP - 8;
    const want = Math.min(MAX_H, options.length * 44 + 8);
    const up = below < want && above > below;
    setPos({
      left,
      width,
      maxHeight: Math.max(120, Math.min(MAX_H, up ? above : below)),
      ...(up ? { bottom: vh - r.top + GAP } : { top: r.bottom + GAP }),
    });
    setActive(selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : firstEnabled);
    setOpen(true);
  };

  const choose = (i) => {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange?.(o.value);
    setOpen(false);
  };

  const move = (from, dir) => {
    let j = from + dir;
    while (j >= 0 && j < options.length && options[j].disabled) j += dir;
    return j >= 0 && j < options.length ? j : from;
  };

  const typeahead = (ch) => {
    const t = typed.current;
    clearTimeout(t.timer);
    t.text += ch.toLowerCase();
    t.timer = setTimeout(() => {
      t.text = "";
    }, 600);
    const start = t.text.length === 1 ? active + 1 : active;
    for (let i = 0; i < options.length; i++) {
      const j = (start + i) % options.length;
      if (!options[j].disabled && String(options[j].label).toLowerCase().startsWith(t.text)) {
        setActive(j);
        return;
      }
    }
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openList();
      }
      return; // Enter / Space open through the click event
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => move(a, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => move(a, -1));
        break;
      case "Home":
        e.preventDefault();
        setActive(firstEnabled);
        break;
      case "End":
        e.preventDefault();
        setActive(lastEnabled);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeahead(e.key);
    }
  };

  // Close on outside press, on any scroll outside the list, and on resize
  // (the list is positioned once, at open time).
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

  useEffect(() => {
    if (open && active >= 0) {
      document.getElementById(`${uid}-o${active}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, active, uid]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${uid}-o${active}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        data-slot="select"
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => {
          if (e.key === " ") e.preventDefault(); // Firefox fires click on Space keyup
        }}
        onBlur={() => setOpen(false)}
        className={cn(
          inputClasses,
          "flex min-h-11 cursor-pointer items-center justify-between gap-2 py-2 text-left pointer-coarse:min-h-12",
          className,
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            // Keep focus on the trigger while pressing an option.
            onMouseDown={(e) => e.preventDefault()}
            style={pos}
            className="fixed z-110 animate-fade-in overflow-y-auto overscroll-contain rounded-[var(--radius-control)] border border-rule-2 bg-floating p-1 shadow-[var(--shadow-modal)]"
          >
            {options.map((o, i) => (
              <div
                key={o.value}
                id={`${uid}-o${i}`}
                role="option"
                aria-selected={i === selectedIndex}
                aria-disabled={o.disabled || undefined}
                onClick={() => choose(i)}
                onMouseMove={() => active !== i && setActive(i)}
                className={cn(
                  "flex min-h-10 cursor-pointer items-center gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-[14px] text-ink pointer-coarse:min-h-12 pointer-coarse:text-[16px]",
                  i === active && "bg-raised",
                  i === selectedIndex && "font-medium text-primary",
                  o.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {i === selectedIndex && <Check aria-hidden="true" className="size-4 shrink-0" />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
