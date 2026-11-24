import { useEffect, useLayoutEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// MODAL ACCESSIBILITY HOOK
// Escape closes, Tab stays inside, focus moves in on open and returns on close,
// the page behind does not scroll. Works for stacked dialogs (a confirm opened
// from a settings dialog): only the top one reacts to keys.
//
// `onClose` may be a new function on every render; it is read through a ref so
// typing in a field (which re-renders the parent) never re-runs the open logic.
// Pass `dismissible: false` to ignore Escape (one-time secrets close with a button).
// ═══════════════════════════════════════════════════════════════
const stack = [];
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const visible = (el) => el.offsetParent !== null || el.getClientRects().length > 0;

// Where focus was before the latest move. A field with autoFocus takes focus while the dialog
// is committed, before this hook's effect runs, so "the active element" is already inside it.
let focusNow = null;
let focusBefore = null;
if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("focusin", (e) => {
    if (e.target === focusNow) return;
    focusBefore = focusNow;
    focusNow = e.target;
  }, true);
}

export const useModalA11y = (open, onClose, { dismissible = true } = {}) => {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  const dismissRef = useRef(dismissible);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    dismissRef.current = dismissible;
  });

  useEffect(() => {
    if (!open) return undefined;
    const token = {};
    stack.push(token);
    const inside = ref.current?.contains(document.activeElement);
    const previousActive = inside ? focusBefore : document.activeElement;
    const isTop = () => stack[stack.length - 1] === token;

    const onKeyDown = (e) => {
      if (!isTop()) return;
      if (e.key === "Escape") {
        if (!dismissRef.current) return;
        // A menu or select inside the dialog handles its own Escape first.
        if (e.defaultPrevented) return;
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key === "Tab" && ref.current) {
        const focusable = [...ref.current.querySelectorAll(FOCUSABLE)].filter(visible);
        if (!focusable.length) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const inside = ref.current.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || !inside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const t = setTimeout(() => {
      const root = ref.current;
      if (!root || root.contains(document.activeElement)) return; // autoFocus already placed it
      const target =
        root.querySelector("[data-autofocus]") ||
        [...root.querySelectorAll("input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled])")].find(visible) ||
        [...root.querySelectorAll(FOCUSABLE)].filter(visible).find((el) => !el.classList.contains("modal-x")) ||
        root;
      target?.focus?.();
    }, 30);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearTimeout(t);
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) document.body.style.overflow = prevOverflow === "hidden" ? "" : prevOverflow;
      if (previousActive instanceof HTMLElement && previousActive.isConnected) previousActive.focus();
    };
  }, [open]);

  return ref;
};
