import { AlertTriangle, Eye, Lock, Save } from "lucide-react";
import { useState } from "react";
import { QuestionEditor, QuestionView } from "./QuestionEditor";
import { SwapQuestionModal } from "./SwapQuestionModal";
import { PageHeader, SectionHeader } from "@/components/common";
import { useToast } from "@/context/useToast";
import { AutoSaveIndicator } from "@/components/take-test/AutoSaveIndicator";
import { createId } from "@/lib/id";
import { normalizeQuestion, sumMarks, validateQuestions } from "@/lib/questions";
import { Button } from "@/components/ui/button";

// ═══════════════════════════════════════════════════════════════
// REVIEW SCREEN
// ═══════════════════════════════════════════════════════════════
export const DraftReviewScreen = ({
  subjectId,
  config,
  questions,
  onQuestionsChange,
  onBack,
  onPublish,
  onPreview,
  onSave,
  saveState,
  backLabel = "Back to tests",
  heading = "Review the draft",
  crumbLabel = "Review draft",
  scope = "",
  title,
  readOnly = false,
  lockReason = "Read-only — students have already been given this test.",
  lockSummary = "This test is no longer a draft, so it can't be edited.",
  lockedActions = [],
}) => {
  const toast = useToast();
  const [swapIndex, setSwapIndex] = useState(null);
  const totalMarks = sumMarks(questions);
  const issues = validateQuestions(questions);
  const webCount = questions.filter((q) => q.sources?.some((x) => x.kind === "web")).length;

  const update = (i, next) => {
    const copy = [...questions];
    copy[i] = next;
    onQuestionsChange(copy);
  };
  const remove = (i) => {
    onQuestionsChange(questions.filter((_, j) => j !== i));
    toast.push("Question removed", "info");
  };
  const duplicate = (i) => {
    const copy = [...questions];
    copy.splice(i + 1, 0, { ...questions[i], id: createId() });
    onQuestionsChange(copy);
    toast.push("Question duplicated", "info");
  };
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const copy = [...questions];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onQuestionsChange(copy);
  };

  const issueAt = new Set(issues.filter((i) => i.index >= 0).map((i) => i.index));
  const jump = (i) => document.getElementById(`q-${i + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const summary = `${questions.length} ${questions.length === 1 ? "question" : "questions"} · ${totalMarks} marks · ${config.duration} min · ${config.mode === "personal" ? "a version per student" : "the same paper for the whole class"}.`;

  const editActions = (
    <>
      {saveState && <AutoSaveIndicator state={saveState} errorText="Couldn't save, retrying. Your edits are kept on this page." />}
      {onPreview && (
        <Button onClick={onPreview} variant="outline">
          <Eye size={13} aria-hidden="true" /> Preview
        </Button>
      )}
      {onSave && (
        <Button onClick={() => onSave()} variant="outline">
          <Save size={13} aria-hidden="true" /> Save draft
        </Button>
      )}
      {onPublish && <Button onClick={onPublish}>Publish</Button>}
    </>
  );
  const readActions = (
    <>
      {onPreview && (
        <Button onClick={onPreview} variant="outline">
          <Eye size={13} aria-hidden="true" /> Preview
        </Button>
      )}
      {lockedActions.map((a) => (
        <Button key={a.id} onClick={a.onClick} variant={a.primary ? "default" : "outline"}>
          {a.label}
        </Button>
      ))}
    </>
  );

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <PageHeader
        crumbs={[...(scope ? [{ label: scope }] : []), { label: "Tests", to: "/teacher/drafts" }, { label: title || crumbLabel }]}
        title={title && heading === "Review the draft" ? title : heading}
        intro={
          <>
            {summary}{" "}
            {webCount > 0 && (
              <span className="font-medium text-warning">
                {webCount} {webCount === 1 ? "question uses" : "questions use"} a web source: check {webCount === 1 ? "it" : "them"}.{" "}
              </span>
            )}
            {readOnly ? lockSummary : "Edit any question, answer or mark. Mark the correct option on each multiple choice so auto-grading knows what to look for."}
          </>
        }
        actions={readOnly ? readActions : editActions}
      />

      <section className="mb-10">
        <SectionHeader label="Questions" />
        {readOnly && (
          <div className="mb-4 flex items-start gap-2 rounded-[var(--radius-control)] border border-rule-2 bg-raised px-4 py-3 text-[13px] text-ink-2">
            <Lock size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
            {lockReason}
          </div>
        )}
        {!readOnly && issues.length > 0 && (
          <div role="status" className="mb-4 flex items-start gap-2 rounded-[var(--radius-control)] border border-warning/25 bg-warning-dim px-4 py-3 text-[13px] text-warning">
            <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              {issues.length} {issues.length === 1 ? "issue" : "issues"} to fix before publishing:{" "}
              {issues
                .slice(0, 3)
                .map((i) => (i.index >= 0 ? `Q${i.index + 1} ${i.message}` : i.message))
                .join("; ")}
              {issues.length > 3 ? "…" : "."}
            </span>
          </div>
        )}

        {/* Question index: jump straight to Q9 on a long paper; questions with problems are marked. */}
        {questions.length > 4 && (
          <nav aria-label="Jump to a question" className="mb-4 flex flex-wrap gap-1.5">
            {questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                onClick={() => jump(i)}
                aria-label={`Question ${i + 1}${issueAt.has(i) ? " (needs a fix)" : ""}`}
                className={
                  "grid size-9 place-items-center rounded-[var(--radius-control)] border text-[12.5px] font-semibold tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 " +
                  (issueAt.has(i) ? "border-warning/50 bg-warning-dim text-warning" : "border-rule-2 bg-surface text-ink-2 hover:border-rule-3 hover:text-ink")
                }
              >
                {i + 1}
              </button>
            ))}
          </nav>
        )}

        <div className="flex flex-col gap-3.5">
          {questions.map((q, i) =>
            readOnly ? (
              <QuestionView key={q.id} q={q} index={i} />
            ) : (
              <QuestionEditor
                key={q.id}
                q={q}
                index={i}
                total={questions.length}
                onUpdate={(next) => update(i, next)}
                onDelete={remove}
                onDuplicate={duplicate}
                onMove={move}
                onSwap={subjectId ? setSwapIndex : undefined}
              />
            ),
          )}
        </div>
      </section>

      {/* Sticky action bar: Save and Publish stay in reach on a long paper. */}
      <div className="no-print sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-bento)] border border-rule bg-surface/95 px-4 py-3 shadow-[var(--shadow-raised)] backdrop-blur-sm max-narrow:px-3 max-narrow:py-2.5">
        {/* Phones: one compact row (Save + Publish); Back and Preview are in the header. */}
        <Button onClick={onBack} variant="ghost" className="max-narrow:hidden">
          {backLabel}
        </Button>
        <div className="flex flex-wrap gap-2 max-narrow:w-full max-narrow:flex-nowrap max-narrow:[&>*]:flex-1">
          {readOnly ? readActions : (
            <>
              {onPreview && (
                <Button onClick={onPreview} variant="outline" className="max-narrow:hidden">
                  Preview as student
                </Button>
              )}
              {onSave && (
                <Button onClick={() => onSave()} variant="outline">
                  Save draft
                </Button>
              )}
              {onPublish && <Button onClick={onPublish}>Publish test</Button>}
            </>
          )}
        </div>
      </div>

      <SwapQuestionModal
        open={swapIndex !== null}
        onClose={() => setSwapIndex(null)}
        subjectId={subjectId}
        question={swapIndex !== null ? questions[swapIndex] : null}
        usedBankIds={questions.map((q) => q.bankId).filter(Boolean)}
        onPick={(b) => {
          update(
            swapIndex,
            normalizeQuestion({
              ...b,
              id: createId(),
              bankId: b.id,
              sources: [{ kind: "bank", label: "Your question bank", snippet: `Swapped in — used in ${b.used} test${b.used === 1 ? "" : "s"} so far.` }],
            }),
          );
          setSwapIndex(null);
          toast.push("Question swapped", "info");
        }}
      />
    </div>
  );
};
