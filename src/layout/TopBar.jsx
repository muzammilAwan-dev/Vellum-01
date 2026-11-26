import { Search } from "lucide-react";
import { useMatches } from "react-router";
import { useApp } from "@/context/useApp";
import { cn } from "@/lib/cn";
import { shortcutLabel } from "@/lib/platform";

// ═══════════════════════════════════════════════════════════════
// TOP BAR
//
// Sticky. Left: page title (from route handle). Right: search. On mobile this is hidden — MobileTopBar
// takes over.
//
// Page actions live in each page's own header (PageHeader), never here: one place per action,
// and no buttons that only look like they work.
// ═══════════════════════════════════════════════════════════════
export const TopBar = ({ onSearch }) => {
  const matches = useMatches();
  const { role } = useApp();

  const title = [...matches].reverse().find((m) => m.handle?.title)?.handle?.title || "";

  // Admin and teacher pages render their own <h1> (PageHeader); students still rely on this one.
  const TitleTag = role === "student" ? "h1" : "p";

  return (
    <header
      className={cn(
        "no-print sticky top-0 z-20 hidden h-16 shrink-0 items-center gap-3 border-b border-rule bg-bg/90 px-10 backdrop-blur-sm tablet:flex"
      )}
    >
      {/* Admin and teacher pages render their own <h1> (PageHeader), so the bar shows the same name
          as plain text: one h1 per page. Students still rely on this one until their U1 pass. */}
      <TitleTag className="truncate font-serif text-[19px] font-semibold tracking-[-0.015em] text-ink">
        {title}
      </TitleTag>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onSearch}
          className="flex h-10 min-w-[40px] items-center gap-2.5 rounded-full border border-rule-2 bg-surface px-3.5 text-[13px] text-ink-3 transition-colors hover:border-rule-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40 lg:w-[300px]"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Search size={15} aria-hidden="true" />
          {/* The name is the visible text (WCAG 2.5.3); below lg the text is visually hidden but still the name. */}
          <span className="sr-only lg:not-sr-only">Search anything</span>
          <kbd aria-hidden="true" className="ml-auto hidden rounded-md border border-rule-2 bg-raised px-1.5 py-0.5 text-[12px] font-semibold text-ink-3 lg:pointer-fine:inline">
            {shortcutLabel("K")}
          </kbd>
        </button>

      </div>
    </header>
  );
};
