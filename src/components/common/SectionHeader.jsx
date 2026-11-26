// ═══════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// The building blocks the new design language is made of. Every
// feature page composes these — no feature defines its own card,
// badge, or table shell.
// ═══════════════════════════════════════════════════════════════

// ── Semantic section header ──
// Sentence-case semibold title + optional right-side action.
// Not wrapped in a card; whitespace separates sections.
// The label is a real heading (h2 by default, `as` to change it), so screen-reader users can jump
// between sections; the meta text wraps instead of being cut off on phones.
export const SectionHeader = ({ label, meta, aside, action, onAction, as: Heading = "h2" }) => (
  <div className="mb-3 flex min-h-8 items-center justify-between gap-4">
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
      <Heading className="text-[14px] font-semibold text-ink">{label}</Heading>
      {meta && <div className="text-[12px] font-medium text-ink-3">{meta}</div>}
    </div>
    {aside}
    {action && (
      <button
        type="button"
        onClick={onAction}
        className="inline-flex min-h-8 shrink-0 items-center rounded-sm px-1 text-[12.5px] font-medium text-primary transition-colors hover:text-primary-2 hover:underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring/40 pointer-coarse:min-h-11"
      >
        {action}
      </button>
    )}
  </div>
);
