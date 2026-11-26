import { useState } from "react";
import { Eye } from "lucide-react";
import { DraftReviewScreen } from "./DraftReviewScreen";
import { Chip, ChipRow, EmptyState, PageHeader, SearchField, StatusDot, Td, Th } from "@/components/common";
import { sumMarks, validateQuestions } from "@/lib/questions";
import { Button } from "@/components/ui/button";

// ═══════════════════════════════════════════════════════════════
// VARIANTS REVIEW SCREEN
// ═══════════════════════════════════════════════════════════════
export const VariantsReviewScreen = ({
  subjectId,
  config,
  variants,
  onVariantsChange,
  onBack,
  onPreview,
  onPublishAll,
  backLabel = "Back to tests",
  scope = "",
  title,
  readOnly = false,
  lockReason,
  lockSummary,
  publishDisabled = false,
  saveState,
}) => {
  const [openIndex, setOpenIndex] = useState(null);
  const [reviewed, setReviewed] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Taken from the variants themselves (not config.mix) so the numbers stay
  // right after the teacher adds, removes or re-marks questions.
  const marksPerVariant = sumMarks(variants[0]?.questions);
  const questionsPerVariant = variants[0]?.questions.length ?? 0;
  const invalidCount = variants.filter(
    (v) => validateQuestions(v.questions).length > 0,
  ).length;

  const openVariant = (i) => {
    setOpenIndex(i);
    setReviewed((prev) => new Set(prev).add(variants[i].studentName));
  };

  if (openIndex !== null) {
    const v = variants[openIndex];
    return (
      <DraftReviewScreen
        subjectId={subjectId}
        config={config}
        questions={v.questions}
        onQuestionsChange={(qs) => {
          const copy = [...variants];
          copy[openIndex] = { ...v, questions: qs };
          onVariantsChange(copy);
        }}
        onBack={() => setOpenIndex(null)}
        onPreview={onPreview ? () => onPreview(openIndex) : undefined}
        onSave={readOnly ? undefined : () => setOpenIndex(null)}
        scope={scope}
        readOnly={readOnly}
        lockReason={lockReason}
        lockSummary={lockSummary}
        saveState={saveState}
        backLabel="Back to student list"
        heading={`Review — ${v.studentName}`}
        crumbLabel={`Review draft · ${v.studentName}`}
      />
    );
  }

  const filtered = variants.filter((v) => {
    const matchesQuery = v.studentName
      .toLowerCase()
      .includes(query.toLowerCase());
    const isReviewed = reviewed.has(v.studentName);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "reviewed" && isReviewed) ||
      (statusFilter === "unreviewed" && !isReviewed);
    return matchesQuery && matchesStatus;
  });

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <PageHeader
        crumbs={[...(scope ? [{ label: scope }] : []), { label: "Tests", to: "/teacher/drafts" }, { label: title || "Student versions" }]}
        title={title ? `${title}: one version per student` : "Review each student's test"}
        intro={
          <>
            {variants.length} personalised versions · {questionsPerVariant} questions · {marksPerVariant} marks each · {reviewed.size} of {variants.length} spot-checked.
            Check a few, fix anything that looks off, then publish them all at once; you don't need to open every one.
            {invalidCount > 0 && <span className="font-medium text-warning"> {invalidCount} {invalidCount === 1 ? "version has" : "versions have"} issues that will block publishing.</span>}
          </>
        }
        actions={
          <>
            {onPreview && (
              <Button onClick={() => onPreview(0)} variant="outline">
                <Eye size={13} aria-hidden="true" /> Preview
              </Button>
            )}
            {onPublishAll && (
              <Button onClick={onPublishAll} disabled={publishDisabled}>
                Publish all {variants.length}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField label="Search by student" value={query} onChange={setQuery} placeholder="Search by student…" className="w-full narrow:w-[300px]" />
        <ChipRow>
          {["all", "reviewed", "unreviewed"].map((f) => (
            <Chip
              key={f}
              active={statusFilter === f}
              onClick={() => setStatusFilter(f)}
            >
              {f === "all"
                ? "All"
                : f === "reviewed"
                  ? "Reviewed"
                  : "Not reviewed"}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {/* Student list — table shell with card shadow */}
      <div className="overflow-hidden rounded-[var(--radius-container)] border border-rule bg-surface shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40" tabIndex={0} role="region" aria-label="Student versions">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-rule-2">
                <Th>Student</Th>
                <Th>Weak topic targeted</Th>
                <Th className="text-right max-lg:hidden">Questions</Th>
                <Th className="text-right max-lg:hidden">Marks</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-0">
                    <EmptyState
                      compact
                      title="No students match"
                      body="Try a different name or clear the filter."
                    />
                  </td>
                </tr>
              )}
              {filtered.map((v) => {
                const isReviewed = reviewed.has(v.studentName);
                const idx = variants.indexOf(v);
                return (
                  <tr
                    key={v.studentName}
                    onClick={() => openVariant(idx)}
                    className="cursor-pointer border-b border-rule transition-colors last:border-b-0 hover:bg-raised/50"
                  >
                    <Td className="text-[13.5px]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openVariant(idx);
                        }}
                        className="inline-flex min-h-8 items-center rounded-sm text-left font-medium text-ink hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        {v.studentName}
                      </button>
                    </Td>
                    <Td>
                      {v.weakTopic ? (
                        <span
                          title={
                            v.weakSource === "class"
                              ? `${v.weakTopic}: no graded tests for this student yet, so this is the class's weakest topic (${v.weakAccuracy}%)`
                              : `${v.weakTopic}: this student's lowest topic in graded tests (${v.weakAccuracy}%)`
                          }
                          className="inline-block max-w-[16rem] truncate rounded-full align-middle border border-warning/25 bg-warning-dim px-2 py-0.5 text-[12px] font-medium text-warning"
                        >
                          {v.weakTopic}
                          {v.weakSource === "class" && <span className="font-normal opacity-80"> · class</span>}
                        </span>
                      ) : (
                        <span className="text-ink-3" title="No topic is below target for this student">—</span>
                      )}
                    </Td>
                    <Td className="text-right font-mono tabular-nums max-lg:hidden">
                      {v.questions.length}
                    </Td>
                    <Td className="text-right font-mono tabular-nums max-lg:hidden">
                      {v.questions.reduce((s, q) => s + q.marks, 0)}
                    </Td>
                    <Td>
                      <StatusDot tone={isReviewed ? "success" : "warning"}>
                        {isReviewed ? "Reviewed" : "Not reviewed"}
                      </StatusDot>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="no-print sticky bottom-3 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-bento)] border border-rule bg-surface/95 px-4 py-3 shadow-[var(--shadow-raised)] backdrop-blur-sm">
        <Button onClick={onBack} variant="ghost">
          {backLabel}
        </Button>
        {onPublishAll && (
          <Button onClick={onPublishAll} disabled={publishDisabled} className="max-narrow:flex-auto">
            Publish all {variants.length}
          </Button>
        )}
      </div>
    </div>
  );
};
