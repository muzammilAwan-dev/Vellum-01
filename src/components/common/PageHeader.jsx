import { Link } from "react-router";
import { cn } from "@/lib/cn";

// ── Page header: breadcrumb, the page's one <h1>, intro, actions ──
// One source for the page name (the top bar shows the same words, as plain text).
// crumbs: [{ label, to? }] — the last crumb is the current page (not a link).
export const PageHeader = ({ crumbs = [], title, titleNote, intro, actions, children, className }) => (
  <header className={cn("mb-8", className)}>
    {crumbs.length > 0 && (
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] font-medium text-ink-3">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={c.label + i} className="flex min-w-0 items-center gap-1">
                {i > 0 && <span aria-hidden="true" className="px-0.5 text-ink-4 dark:text-ink-3">/</span>}
                {c.to && !last ? (
                  <Link to={c.to} className="inline-flex min-h-6 items-center rounded-sm px-0.5 transition-colors hover:text-ink hover:underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring/40">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={cn("truncate px-0.5", last && "text-ink-2")}>{c.label}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    )}
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 max-w-[720px]">
        <h1 className="font-serif text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink tablet:text-[34px] [overflow-wrap:anywhere]">
          {title}
          {titleNote && <span className="ml-3 align-middle font-sans text-[13px] font-medium tracking-normal">{titleNote}</span>}
        </h1>
        {intro && <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {children}
  </header>
);

// Page frame used by every admin page: same width and gutters everywhere.
export const PageFrame = ({ children, className }) => (
  <div className={cn("mx-auto w-full max-w-[1280px] px-5 py-6 tablet:px-10 tablet:py-8", className)}>{children}</div>
);
