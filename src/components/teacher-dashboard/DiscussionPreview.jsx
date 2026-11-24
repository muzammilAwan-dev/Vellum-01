import { useApp } from "@/context/useApp";
import { useThreads } from "@/hooks/useThreads";
import { cn } from "@/lib/cn";
import { sortThreads } from "@/lib/discussion";

// ═══════════════════════════════════════════════════════════════
// DISCUSSION PREVIEW — the three most recently active unresolved threads of the
// class chosen in the sidebar (same data as the Discussion page).
// ═══════════════════════════════════════════════════════════════
const TAG_STYLE = {
  Question: "border-warning/25 bg-warning-dim text-warning",
  Discussion: "border-primary/25 bg-primary-dim text-primary",
  Resource: "border-success/25 bg-success-dim text-success",
  Announcement: "border-danger/25 bg-danger-dim text-danger",
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
            className="flex w-full flex-col items-start gap-1.5 rounded-lg px-2 py-3 text-left transition-colors hover:bg-raised"
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
