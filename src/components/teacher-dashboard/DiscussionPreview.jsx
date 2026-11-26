import { useApp } from "@/context/useApp";
import { useThreads } from "@/hooks/useThreads";
import { cn } from "@/lib/cn";
import { sortThreads } from "@/lib/discussion";

// ═══════════════════════════════════════════════════════════════
// DISCUSSION PREVIEW — the three most recently active unresolved threads of the
// class chosen in the sidebar (same data as the Discussion page).
// ═══════════════════════════════════════════════════════════════
// Same contrast-safe tags as the Discussion page (solid surface, coloured text and border).
const TAG_STYLE = {
  Question: "border-warning/40 bg-surface text-warning dark:bg-raised",
  Discussion: "border-primary/40 bg-surface text-primary dark:bg-raised",
  Resource: "border-success/40 bg-surface text-success dark:bg-raised",
  Announcement: "border-danger/40 bg-surface text-danger dark:bg-raised",
};

export const DiscussionPreview = ({ onOpenAll }) => {
  const { activeClassObj } = useApp();
  const { data } = useThreads({ classId: activeClassObj?.id, enabled: Boolean(activeClassObj) });
  const recent = sortThreads((data ?? []).filter((t) => !t.resolved)).slice(0, 3);
  if (!recent.length) {
    return <p className="py-6 text-[13px] leading-relaxed text-ink-3">No open threads. Questions from students show up here.</p>;
  }
  return (
    <ul className="-mx-2 flex flex-col">
      {recent.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={onOpenAll}
            className="flex w-full flex-col items-start gap-1.5 rounded-lg px-2 py-3 text-left transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span className={cn("whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] font-semibold", TAG_STYLE[t.tag] || "border-rule-2 bg-raised text-ink-3")}>
              {t.tag}
            </span>
            <span className="line-clamp-2 text-[13.5px] font-medium leading-snug text-ink">{t.title}</span>
            <span className="text-[12px] text-ink-3">
              {t.author} · {t.replies.length} {t.replies.length === 1 ? "reply" : "replies"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
};
