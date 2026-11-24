import { AlertTriangle } from "lucide-react";
import { Link } from "react-router";

// Shared look with the Classes page: code badge, name, counts, teachers. The whole card is a link.
// `level`: the card title's heading level (2 on the Classes page, 3 under the home page's "Classes" heading).
export const ClassCard = ({ cls: c, children, level = 3 }) => {
  const H = `h${level}`;
  return (
  <div className="group relative flex h-full flex-col rounded-[var(--radius-bento)] border border-rule bg-surface p-5 shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-rule-3 hover:shadow-[var(--shadow-raised)]">
    <div className="flex items-center gap-3">
      <span className="grid h-9 min-w-11 shrink-0 place-items-center rounded-[10px] bg-primary-dim px-2 font-mono text-[12.5px] font-bold tracking-wider text-primary">{c.code}</span>
      <H className="min-w-0 flex-1 truncate font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">
        <Link to={`/admin/classes/${c.id}`} className="after:absolute after:inset-0 after:rounded-[var(--radius-bento)] after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary">
          {c.name}
        </Link>
      </H>
      {children && <div className="relative z-10 -my-1 -mr-2 shrink-0">{children}</div>}
    </div>
    <p className="mt-3 text-[13px] text-ink-3">
      <b className="font-semibold text-ink tabular-nums">{c.studentCount}</b> {c.studentCount === 1 ? "student" : "students"} ·{" "}
      <b className="font-semibold text-ink tabular-nums">{c.subjectCount}</b> {c.subjectCount === 1 ? "subject" : "subjects"}
    </p>
    <div className="mt-4 flex flex-wrap gap-1.5">
      {c.teachers.length === 0 ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-dim px-2.5 py-0.5 text-[12px] font-medium text-warning">
          <AlertTriangle size={12} aria-hidden="true" /> No teacher yet
        </span>
      ) : (
        c.teachers.map((t) => (
          <span key={t.id} title={t.name} className="inline-block max-w-[16rem] truncate rounded-full border border-rule-2 px-2.5 py-0.5 text-[12px] font-medium text-ink-2">
            {t.name}
          </span>
        ))
      )}
    </div>
  </div>
);
};
