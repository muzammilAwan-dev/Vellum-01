import { useId } from "react";
import { useModalA11y } from "@/hooks/useModalA11y";

// ── Modal shell with glass surface ──
// A real dialog: role="dialog", aria-modal, named by its title, Escape closes, Tab stays
// inside, focus returns to whatever opened it. On phones it docks to the bottom as a sheet.
// closeOnBackdrop={false}: neither a click outside nor Escape closes it (for one-time
// secrets; the footer button does).
// `description` (optional) is read out with the title.
export const ModalShell = ({ open, onClose, title, description, children, maxWidth = "480px", footer, closeOnBackdrop = true }) => {
  const ref = useModalA11y(open, onClose, { dismissible: closeOnBackdrop });
  const titleId = useId();
  const descId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-100 grid animate-fade-in place-items-center bg-[oklch(0.15_0.06_272_/_0.55)] p-5 backdrop-blur-md max-narrow:place-items-end max-narrow:p-0" onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth }}
        className="glass-strong flex max-h-[calc(100dvh-48px)] w-full animate-qin flex-col overflow-hidden rounded-[var(--radius-modal)] shadow-[var(--shadow-modal)] max-narrow:max-h-[92dvh] max-narrow:rounded-b-none"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-rule px-6 py-4 max-narrow:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-[18px] font-semibold tracking-[-0.015em] text-ink">{title}</h2>
            {description && <p id={descId} className="mt-1 text-[13px] leading-relaxed text-ink-3">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="modal-x -mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6 max-narrow:px-5">{children}</div>
        {footer && <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-rule px-6 py-4 narrow:flex-row narrow:justify-end max-narrow:px-5 max-narrow:pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
};
