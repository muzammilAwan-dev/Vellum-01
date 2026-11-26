import { Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { QUESTION_TYPES } from "@/lib/questions";

// ═══════════════════════════════════════════════════════════════
// QUESTION MIX BUILDER
// ═══════════════════════════════════════════════════════════════
// Labels come from the shared question schema; only builder-specific
// defaults (starting marks, max count) live here.
const BUILDER_DEFAULTS = {
  mcq: { defaultMarks: 2, max: 40 },
  truefalse: { defaultMarks: 1, max: 20 },
  short: { defaultMarks: 4, max: 20 },
  long: { defaultMarks: 10, max: 10 },
  numerical: { defaultMarks: 5, max: 15 },
};
const QUESTION_TYPE_META = Object.fromEntries(
  Object.entries(BUILDER_DEFAULTS).map(([type, d]) => [
    type,
    { label: QUESTION_TYPES[type].label, short: QUESTION_TYPES[type].short, ...d },
  ]),
);

export const QuestionMixBuilder = ({ rows, onChange, targetMarks }) => {
  const totalQuestions = rows.reduce((s, r) => s + r.count, 0);
  const totalMarks = rows.reduce((s, r) => s + r.count * r.marks, 0);

  const update = (type, patch) =>
    onChange(rows.map((r) => (r.type === type ? { ...r, ...patch } : r)));
  const addRow = (type) =>
    onChange([
      ...rows,
      { type, count: 5, marks: QUESTION_TYPE_META[type].defaultMarks },
    ]);
  const removeRow = (type) => onChange(rows.filter((r) => r.type !== type));
  const available = Object.keys(QUESTION_TYPE_META).filter(
    (t) => !rows.some((r) => r.type === t),
  );

  // A container query (not the viewport) decides the row layout: in a narrow column each type takes
  // two lines (name, subtotal, remove / then the count and marks controls), so nothing is squeezed.
  const marksMatch = targetMarks == null || totalMarks === targetMarks;
  const marksOff = targetMarks != null ? totalMarks - targetMarks : 0;

  return (
    <div className="@container overflow-hidden rounded-[var(--radius-container)] border border-rule-2 bg-sunken shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between border-b border-rule px-4 py-3 font-mono text-[12px] font-semibold text-ink-2">
        <span>Question types</span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 tabular-nums",
            marksMatch
              ? "bg-success-dim text-success"
              : "bg-warning-dim text-warning",
          )}
        >
          {totalQuestions} questions · {totalMarks} marks
        </span>
      </div>

      <div className="flex flex-col divide-y divide-rule">
        {rows.map((r) => {
          const meta = QUESTION_TYPE_META[r.type];
          return (
            <div
              key={r.type}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2.5 px-4 py-3 transition-colors hover:bg-surface/50 @[34rem]:grid-cols-[minmax(0,130px)_minmax(0,1fr)_52px_36px]"
            >
              <div className="col-start-1 row-start-1 flex min-w-0 flex-col gap-0.5">
                <span className="font-mono text-[12px] font-bold tracking-wider text-primary">
                  {meta.short}
                </span>
                <span className="truncate text-[12.5px] text-ink-2">
                  {meta.label}
                </span>
              </div>

              <div className="col-span-3 row-start-2 flex min-w-0 flex-wrap items-center gap-2.5 @[34rem]:col-span-1 @[34rem]:col-start-2 @[34rem]:row-start-1">
                <div className="inline-flex h-9 items-stretch overflow-hidden rounded-[var(--radius-control)] border border-rule-2 bg-surface">
                  <button
                    type="button"
                    onClick={() =>
                      update(r.type, { count: Math.max(0, r.count - 1) })
                    }
                    disabled={r.count <= 0}
                    aria-label={`Fewer ${meta.label} questions`}
                    className="grid w-9 place-items-center text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 disabled:text-ink-3 pointer-coarse:w-11"
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={r.count}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "");
                      update(r.type, {
                        count:
                          v === "" ? 0 : Math.min(meta.max, parseInt(v, 10)),
                      });
                    }}
                    aria-label={`Number of ${meta.label.toLowerCase()} questions`}
                    className="w-12 border-x border-rule bg-transparent text-center font-mono text-[16px] font-semibold tabular-nums text-ink outline-none focus:bg-bg focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 narrow:text-[13px]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      update(r.type, { count: Math.min(meta.max, r.count + 1) })
                    }
                    disabled={r.count >= meta.max}
                    aria-label={`More ${meta.label} questions`}
                    className="grid w-9 place-items-center text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 disabled:text-ink-3 pointer-coarse:w-11"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <span aria-hidden="true" className="font-mono text-[13px] text-ink-3">×</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={r.marks}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, "");
                    update(r.type, {
                      marks:
                        v === ""
                          ? 1
                          : Math.max(1, Math.min(50, parseInt(v, 10))),
                    });
                  }}
                  aria-label={`Marks per ${meta.label.toLowerCase()} question`}
                  className="h-9 w-12 rounded-[var(--radius-control)] border border-rule-2 bg-surface text-center font-mono text-[16px] font-semibold tabular-nums text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 narrow:text-[13px]"
                />
                <span aria-hidden="true" className="text-[12px] text-ink-3">marks each</span>
              </div>

              <div className="col-start-2 row-start-1 text-right font-mono text-[14px] font-semibold tabular-nums text-ink @[34rem]:col-start-3">
                {r.count * r.marks}
                <span className="sr-only"> marks</span>
              </div>

              <button
                type="button"
                onClick={() => removeRow(r.type)}
                aria-label={`Remove ${meta.label}`}
                className="col-start-3 row-start-1 grid size-9 place-items-center rounded text-ink-3 transition-colors hover:bg-danger-dim hover:text-danger focus-visible:ring-2 focus-visible:ring-ring/40 @[34rem]:col-start-4"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {available.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-rule bg-surface/60 px-4 py-3">
          <span className="mr-1 text-[12px] text-ink-3">Add type:</span>
          {available.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addRow(t)}
              className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-rule-2 px-3 text-[12px] font-medium text-ink-2 transition-colors hover:border-solid hover:border-ink-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <Plus size={12} aria-hidden="true" /> {QUESTION_TYPE_META[t].label}
            </button>
          ))}
        </div>
      )}

      {targetMarks != null && (
        <div
          className={cn(
            "border-t border-rule px-4 py-2.5 text-[12.5px] font-medium",
            marksMatch
              ? "bg-success-dim text-success"
              : "bg-warning-dim text-warning",
          )}
        >
          {marksMatch
            ? `Total matches your target of ${targetMarks} marks.`
            : marksOff > 0
              ? `${marksOff} marks over your target of ${targetMarks}.`
              : `${Math.abs(marksOff)} marks under your target of ${targetMarks}.`}
        </div>
      )}
    </div>
  );
};
