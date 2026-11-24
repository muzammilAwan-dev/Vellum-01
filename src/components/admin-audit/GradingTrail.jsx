import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { EmptyState } from "@/components/common";
import { AUDIT_TYPES } from "@/lib/audit";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/time";

const CONFIDENCE = { low: "Low confidence", med: "Medium confidence", high: "High confidence" };

const Marks = ({ label, value, max, note }) => (
  <div className="min-w-0">
    <div className="text-[12px] font-semibold text-ink-3">{label}</div>
    <div className="mt-0.5 font-mono text-[18px] font-semibold tabular-nums text-ink">
      {value == null ? "—" : value}
      <span className="text-[13px] font-normal text-ink-3"> / {max}</span>
    </div>
    {note && <div className="mt-0.5 text-[12px] text-ink-3">{note}</div>}
  </div>
);

const Chip = ({ tone = "neutral", children }) => (
  <span
    className={cn(
      "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] font-medium",
      tone === "warning" && "border-warning/30 bg-warning-dim text-warning",
      tone === "primary" && "border-primary/25 bg-primary-soft text-primary",
      tone === "neutral" && "border-rule bg-raised text-ink-2",
    )}
  >
    {children}
  </span>
);

const deltaText = (d) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "0");

const HistoryList = ({ history, max }) =>
  history.length === 0 ? (
    <p className="text-[12.5px] text-ink-3">Nothing was recorded for this answer.</p>
  ) : (
    <ol className="flex flex-col gap-2.5">
      {history.map((h) => (
        <li key={h.seq} className="rounded-[var(--radius-control)] border border-rule bg-sunken px-3 py-2.5 text-[12.5px]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-ink">{AUDIT_TYPES[h.type] ?? h.type}</span>
            <span className="text-ink-3">
              by {h.actorName || "System"}
              {h.actorRole && h.actorRole !== "system" ? ` (${h.actorRole})` : ""}
            </span>
            <span className="font-mono text-ink-3">{formatDateTime(h.at)}</span>
            {h.afterRelease && <Chip tone="warning">After release</Chip>}
          </div>
          {(h.beforeMarks != null || h.afterMarks != null) && (
            <div className="mt-1 font-mono tabular-nums text-ink-2">
              {h.beforeMarks == null ? "no mark" : `${h.beforeMarks}`} → {h.afterMarks == null ? "no mark" : `${h.afterMarks}`} / {max}
              {h.status ? <span className="font-sans text-ink-3"> · {h.status === "final" ? "final" : "not final"}</span> : null}
            </div>
          )}
          {h.reason && <div className="mt-1 text-ink-2">Reason: “{h.reason}”</div>}
        </li>
      ))}
    </ol>
  );

const TrailRow = ({ row }) => {
  const [open, setOpen] = useState(false);
  const panelId = `trail-${row.id}`;
  const finalNote = row.final.status === "final" ? (row.final.byName ? `Confirmed by ${row.final.byName}` : "Final") : "Awaiting teacher";
  return (
    <li className="rounded-[var(--radius-container)] border border-rule bg-surface p-4 shadow-[var(--shadow-card)] tablet:p-5">
      <div className="grid gap-4 tablet:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] tablet:gap-6">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-ink">{row.student.name}</div>
          <div className="mt-1 line-clamp-3 text-[12.5px] leading-snug text-ink-3">{row.questionText}</div>
          <div className="mt-3 text-[12px] font-semibold text-ink-3">Student's answer</div>
          <div className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-[var(--radius-control)] border border-rule bg-sunken px-3 py-2.5 text-[13.5px] leading-relaxed text-ink">
            {row.studentAnswer || <span className="text-ink-3">(No answer given)</span>}
          </div>
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-4">
            <Marks
              label="AI draft"
              value={row.ai?.marks}
              max={row.max}
              note={row.ai ? (row.ai.confidence ? CONFIDENCE[row.ai.confidence] : "AI marked") : "AI grading was off"}
            />
            <Marks label="Final" value={row.final.marks} max={row.max} note={finalNote} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {row.delta !== null && row.delta !== 0 && <Chip tone="primary">{deltaText(row.delta)} vs AI</Chip>}
            {row.overridden && <Chip tone="primary">Overridden</Chip>}
            {row.afterRelease && <Chip tone="warning">Changed after release</Chip>}
            {row.pending && <Chip>Not final yet</Chip>}
            {!row.changed && !row.overridden && !row.pending && <Chip>Matches AI</Chip>}
          </div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-[12.5px] font-medium text-primary hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-ring/40 pointer-coarse:min-h-11"
          >
            <ChevronDown aria-hidden="true" size={14} className={cn("transition-transform motion-reduce:transition-none", open && "rotate-180")} />
            {open ? "Hide history" : `History (${row.history.length})`}
          </button>
        </div>
      </div>

      {open && (
        <div id={panelId} className="mt-4 border-t border-rule pt-4">
          {row.ai?.feedback && (
            <p className="mb-3 text-[12.5px] leading-relaxed text-ink-2">
              <span className="font-semibold text-ink-3">AI feedback: </span>
              {row.ai.feedback}
            </p>
          )}
          <HistoryList history={row.history} max={row.max} />
        </div>
      )}
    </li>
  );
};

export const GradingTrail = ({ rows, onClear }) =>
  rows.length === 0 ? (
    <EmptyState compact title="No answers match" body="Try a different filter or clear the search." action="Show all" onAction={onClear} />
  ) : (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <TrailRow key={r.id} row={r} />
      ))}
    </ul>
  );
