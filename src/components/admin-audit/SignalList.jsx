import { Link } from "react-router";
import { cn } from "@/lib/cn";

const TONE = {
  high: "border-danger/30 bg-danger-dim text-danger",
  medium: "border-warning/30 bg-warning-dim text-warning",
  low: "border-rule bg-raised text-ink-2",
};
const WORD = { high: "High", medium: "Medium", low: "Low" };

export const SeverityPill = ({ level, children }) => (
  <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] font-medium", TONE[level])}>
    {children ?? WORD[level]}
  </span>
);

/** Clues, not proof: each signal states what was counted and which events it rests on. */
export const SignalList = ({ signals, testTitles = {} }) =>
  signals.length === 0 ? (
    <p className="rounded-[var(--radius-container)] border border-rule bg-surface px-4 py-5 text-[13.5px] text-ink-2">
      Nothing stands out for this teacher.
    </p>
  ) : (
    <ul className="flex flex-col gap-3">
      {signals.map((s) => (
        <li key={s.id} className="rounded-[var(--radius-container)] border border-rule bg-surface p-4 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityPill level={s.severity} />
            <span className="text-[14px] font-semibold text-ink">{s.label}</span>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{s.text}</p>
          <p className="mt-2 text-[12px] text-ink-3">
            Based on {s.evidence.length === 1 ? "event" : "events"} #{s.evidence.slice(0, 8).join(", #")}
            {s.evidence.length > 8 ? ` and ${s.evidence.length - 8} more` : ""}
            {s.testId && testTitles[s.testId] && (
              <>
                {" · "}
                <Link to={`/admin/audit/tests/${s.testId}`} className="text-primary hover:underline">
                  Open {testTitles[s.testId]}
                </Link>
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
