import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/common";
import { dayKey, groupEvents } from "@/lib/adminHome";
import { describeEvent, EVENT_LABEL } from "@/lib/auditEvents";
import { cn } from "@/lib/cn";

const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const Who = ({ actor }) => (
  <>
    <span className="font-medium text-ink">{actor?.name || "—"}</span>
    {actor?.role && actor.role !== "system" && <span className="text-ink-3"> · {actor.role}</span>}
  </>
);

// One event (or a run of identical bulk actions shown as one expandable row).
const Row = ({ group, names, showSeq }) => {
  const [open, setOpen] = useState(false);
  const many = group.events.length > 1;
  const first = group.events[0];
  const seqs = many ? `#${group.events[group.events.length - 1].seq}–${first.seq}` : `#${first.seq}`;
  return (
    <li className="border-b border-rule last:border-b-0">
      <div className="grid gap-x-4 gap-y-1 px-4 py-3 tablet:grid-cols-[72px_minmax(0,220px)_minmax(0,1fr)_auto] tablet:items-baseline tablet:px-5">
        <span className="font-mono text-[12.5px] tabular-nums text-ink-3 max-tablet:order-3 max-tablet:text-[12px]">{time(first.at)}</span>
        <span className="text-[13.5px] font-medium text-ink">
          {EVENT_LABEL(group.type)}
          {many && <span className="ml-2 rounded-full bg-raised px-2 py-px text-[12px] font-semibold tabular-nums text-ink-2">×{group.events.length}</span>}
        </span>
        <span className="min-w-0 text-[13px] leading-relaxed text-ink-2">
          {many ? (
            <>
              {group.type === "grade.approve" ? `${group.events.length} marks approved in one bulk action.` : `${group.events.length} events in one bulk action.`}{" "}
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className="inline-flex min-h-6 items-center gap-0.5 rounded-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <ChevronRight size={13} aria-hidden="true" className={cn("transition-transform", open && "rotate-90")} />
                {open ? "Hide" : "Show"} each
              </button>
            </>
          ) : (
            describeEvent(first, names)
          )}
          <span className="mt-0.5 block text-[12.5px] text-ink-3">
            <Who actor={group.actor} />
          </span>
        </span>
        {showSeq && <span className="font-mono text-[12px] tabular-nums text-ink-3 max-tablet:hidden">{seqs}</span>}
      </div>
      {many && open && (
        <ul className="mb-3 ml-4 border-l-2 border-rule-2 pl-4 tablet:ml-[108px]">
          {group.events.map((e) => (
            <li key={e.seq} className="flex flex-wrap gap-x-3 py-1 text-[12.5px] text-ink-2">
              <span className="font-mono tabular-nums text-ink-3">#{e.seq}</span>
              {describeEvent(e, names)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

/** The event log grouped by day, newest first; runs of bulk approvals collapse into one row. */
export const EventList = ({ events, names, compact = false }) => {
  if (events.length === 0) return <EmptyState compact title="No events match" body="Try widening the filters or the dates." />;
  const days = [];
  for (const e of events) {
    const k = dayKey(e.at);
    if (days[days.length - 1]?.key !== k) days.push({ key: k, at: e.at, events: [] });
    days[days.length - 1].events.push(e);
  }
  return (
    <div className="overflow-hidden rounded-[var(--radius-container)] border border-rule bg-surface shadow-[var(--shadow-card)]">
      {days.map((d) => (
        <section key={d.key} aria-label={dayLabel(d.at)}>
          <h3 className="border-b border-rule bg-sunken px-4 py-2 text-[12.5px] font-semibold text-ink-2 tablet:px-5">
            {dayLabel(d.at)}
          </h3>
          <ul>
            {groupEvents(d.events).map((g) => (
              <Row key={g.key} group={g} names={names} showSeq={!compact} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};
