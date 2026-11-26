import { Check, Repeat } from "lucide-react";
import { Bento } from "@/components/common";
import { AutoTextarea } from "@/components/common/AutoTextarea";
import { cn } from "@/lib/cn";
import { isChoice, typeLabel } from "@/lib/questions";
import { ActionMenu } from "@/components/ui/menu";

const letter = (i) => String.fromCharCode(65 + i);
const pts = (n) => `${n} ${n === 1 ? "pt" : "pts"}`;

// Where a question came from (material, bank, web). Shared by the editor and the read-only view.
const Sources = ({ sources }) =>
  sources?.length > 0 ? (
    <div className="mt-4 border-t border-rule pt-3.5">
      <div className="mb-2 text-[12px] font-semibold text-ink-3">Where this came from</div>
      <div className="flex flex-col gap-2">
        {sources
          .slice()
          .sort((a, b) => (a.kind === "web") - (b.kind === "web"))
          .map((src, i) => (
            <div
              key={i}
              className={cn(
                "rounded-[var(--radius-control)] border px-3.5 py-2.5 text-[12.5px] leading-relaxed",
                src.kind === "web" ? "border-warning/30 bg-warning-dim/40" : "border-rule bg-bg",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold",
                    src.kind === "web" ? "bg-warning-dim text-warning" : "bg-primary-dim text-primary",
                  )}
                >
                  {src.kind === "web" ? "From the web" : src.kind === "bank" ? "From your question bank" : "From your material"}
                </span>
                {src.kind === "web" && src.url ? (
                  <a href={src.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline decoration-rule-2 underline-offset-2 hover:text-primary">
                    {src.label}
                  </a>
                ) : (
                  <span className="font-medium text-ink">{src.label}</span>
                )}
              </div>
              <p className="mt-1 text-ink-2">{src.snippet}</p>
              {src.kind === "web" && <p className="mt-1 text-[12px] text-ink-3">Not your own material: check it before publishing.</p>}
            </div>
          ))}
      </div>
    </div>
  ) : null;

const Rubric = ({ rubric }) =>
  rubric?.length > 0 ? (
    <div>
      <div className="mb-1.5 text-[12px] font-semibold text-ink-3">Rubric ({pts(rubric.reduce((s, r) => s + r.points, 0))})</div>
      <ul className="rounded-[var(--radius-control)] border border-rule bg-bg px-3.5 py-1.5">
        {rubric.map((r, i) => (
          <li key={i} className="flex items-start justify-between gap-3 border-b border-rule py-1.5 text-[13px] last:border-b-0">
            <span className="text-ink-2">{r.label}</span>
            <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-ink">{pts(r.points)}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

const Head = ({ q, index, children }) => (
  <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
    <h3 className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] font-medium text-ink-2">
      <span className="font-mono text-[13px] font-bold tabular-nums text-primary">Q{index + 1}</span>
      <span>{typeLabel(q.type)}</span>
      {q.topic && (
        <span title={q.topic} className="inline-block max-w-[16rem] truncate rounded-full border border-primary/25 bg-primary-soft px-2 py-0.5 align-middle text-[12px] font-medium text-primary">
          {q.topic}
        </span>
      )}
    </h3>
    {children}
  </div>
);

// ═══════════════════════════════════════════════════════════════
// READ-ONLY QUESTION (a published test): plain text, the key highlighted, no controls that
// look like they work. Students already have this paper.
// ═══════════════════════════════════════════════════════════════
export const QuestionView = ({ q, index }) => {
  const isMCQ = isChoice(q);
  return (
    <Bento className="!p-5 max-narrow:!p-4">
      <Head q={q} index={index}>
        <span className="text-[12.5px] font-medium tabular-nums text-ink-3">{q.marks} {q.marks === 1 ? "mark" : "marks"}</span>
      </Head>
      <p className="whitespace-pre-wrap font-display text-[16px] leading-snug text-ink">{q.text}</p>
      {isMCQ && q.options && (
        <ol className="mt-4 flex flex-col gap-2">
          {q.options.map((opt, i) => {
            const isCorrect = q.correctIndex === i;
            return (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-2.5 rounded-[var(--radius-control)] border px-3 py-2.5 text-[14px]",
                  isCorrect ? "border-success/50 bg-success-dim text-ink" : "border-rule bg-bg text-ink-2",
                )}
              >
                <span className={cn("w-4 shrink-0 text-center text-[13px] font-bold", isCorrect ? "text-success" : "text-ink-3")}>{letter(i)}</span>
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{opt}</span>
                {isCorrect && (
                  <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-success">
                    <Check size={12} aria-hidden="true" /> Correct
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {!isMCQ && (
        <div className="mt-4 flex flex-col gap-3.5">
          {q.expectedAnswer && (
            <div>
              <div className="mb-1.5 text-[12px] font-semibold text-ink-3">Expected answer</div>
              <p className="whitespace-pre-wrap rounded-[var(--radius-control)] border border-rule bg-bg px-3 py-2.5 text-[13.5px] leading-relaxed text-ink-2">{q.expectedAnswer}</p>
            </div>
          )}
          <Rubric rubric={q.rubric} />
        </div>
      )}
      <Sources sources={q.sources} />
    </Bento>
  );
};

// ═══════════════════════════════════════════════════════════════
// QUESTION EDITOR (a draft). Every field is labelled for screen readers ("Question 3, option B"),
// text boxes grow with their text, and the rarely used actions sit in one "More" menu.
// ═══════════════════════════════════════════════════════════════
export const QuestionEditor = ({ q, index, total, onUpdate, onDelete, onDuplicate, onMove, onSwap }) => {
  const isMCQ = isChoice(q);
  const n = index + 1;
  const updateField = (patch) => onUpdate({ ...q, ...patch });
  const updateOption = (i, val) => {
    const opts = [...q.options];
    opts[i] = val;
    updateField({ options: opts });
  };

  return (
    <Bento className="!p-5 max-narrow:!p-4" id={`q-${index + 1}`}>
      <Head q={q} index={index}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
            <input
              value={q.marks}
              inputMode="numeric"
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, "");
                updateField({ marks: v === "" ? 1 : Math.max(1, parseInt(v, 10)) });
              }}
              className="h-9 w-12 rounded-[var(--radius-control)] border border-rule-2 bg-bg text-center font-mono text-[16px] font-semibold tabular-nums text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 narrow:text-[13.5px]"
              aria-label={`Question ${n} marks`}
            />
            marks
          </label>
          {onSwap && (
            <button
              type="button"
              onClick={() => onSwap(index)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-rule-2 px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-rule-3 hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <Repeat size={13} aria-hidden="true" /> Swap
              <span className="sr-only"> question {n} with one from your bank</span>
            </button>
          )}
          <ActionMenu
            label={`More actions for question ${n}`}
            items={[
              { id: "up", label: "Move up", onSelect: () => onMove(index, -1), disabled: index === 0 },
              { id: "down", label: "Move down", onSelect: () => onMove(index, 1), disabled: index === total - 1 },
              { id: "dup", label: "Duplicate", onSelect: () => onDuplicate(index) },
              { id: "del", label: "Delete", onSelect: () => onDelete(index), danger: true, separatorBefore: true },
            ]}
          />
        </div>
      </Head>

      <AutoTextarea
        value={q.text}
        onChange={(e) => updateField({ text: e.target.value })}
        minRows={2}
        aria-label={`Question ${n} text`}
        className="w-full rounded-[var(--radius-control)] border border-rule bg-bg px-3.5 py-3 font-display text-[16px] leading-snug text-ink outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
      />

      {isMCQ && q.options && (
        <fieldset className="mt-4 min-w-0">
          <legend className="mb-2.5 flex w-full flex-wrap items-baseline justify-between gap-x-3 text-[12px] font-semibold text-ink-3">
            <span>Options</span>
            <span className="font-normal text-ink-3">Tap a circle to mark the correct answer</span>
          </legend>
          {q.options.map((opt, i) => {
            const isCorrect = q.correctIndex === i;
            return (
              <div
                key={i}
                className={cn(
                  "mb-2 grid grid-cols-[28px_16px_minmax(0,1fr)] items-start gap-2.5 rounded-[var(--radius-control)] border px-3 py-1.5 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 narrow:grid-cols-[28px_16px_minmax(0,1fr)_auto]",
                  isCorrect ? "border-success/50 bg-success-dim" : "border-rule bg-bg",
                )}
              >
                <button
                  type="button"
                  aria-pressed={isCorrect}
                  onClick={() => updateField({ correctIndex: i })}
                  aria-label={`Option ${letter(i)} is the correct answer`}
                  className={cn(
                    "mt-1 grid size-7 place-items-center rounded-full border-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
                    isCorrect ? "border-success" : "border-rule-3 hover:border-ink-3",
                  )}
                >
                  <span className={cn("size-3 rounded-full transition-colors", isCorrect && "bg-success")} />
                </button>
                <span aria-hidden="true" className={cn("mt-2 text-center text-[13px] font-bold", isCorrect ? "text-success" : "text-ink-3")}>
                  {letter(i)}
                </span>
                <AutoTextarea
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  aria-label={`Question ${n}, option ${letter(i)}`}
                  className="min-w-0 bg-transparent py-1.5 text-[16px] leading-snug text-ink outline-none narrow:text-[14px]"
                />
                {isCorrect && (
                  <span className="col-start-3 mb-1 inline-flex w-fit items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-success narrow:col-start-4 narrow:mt-2">
                    <Check size={12} aria-hidden="true" /> Correct
                  </span>
                )}
              </div>
            );
          })}
          <div className="mt-2.5 text-[12px] text-ink-3">Used by auto-grading. Students never see this marker.</div>
        </fieldset>
      )}

      {!isMCQ && (
        <div className="mt-4 flex flex-col gap-3.5">
          <div>
            <label htmlFor={`expected-${q.id}`} className="mb-1.5 block text-[12px] font-semibold text-ink-3">
              Expected answer / model response
            </label>
            <AutoTextarea
              id={`expected-${q.id}`}
              value={q.expectedAnswer ?? ""}
              onChange={(e) => updateField({ expectedAnswer: e.target.value })}
              placeholder="What a full-mark answer should say. Used by the AI grader and shown to you during review."
              minRows={3}
              className="w-full rounded-[var(--radius-control)] border border-rule bg-bg px-3 py-2.5 text-[16px] leading-relaxed text-ink outline-none transition-all placeholder:text-ink-3 focus:border-primary focus:ring-2 focus:ring-primary/20 narrow:text-[13.5px]"
            />
          </div>
          <Rubric rubric={q.rubric} />
        </div>
      )}

      <Sources sources={q.sources} />
    </Bento>
  );
};
