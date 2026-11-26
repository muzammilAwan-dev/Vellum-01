import { useState, Fragment } from "react";
import { EmptyState, RowToggle, TableShell, Td, Th } from "@/components/common";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

// ═══════════════════════════════════════════════════════════════
// MANUAL GRADING QUEUE
// Written answers from tests published with AI grading off. `items` are
// grade-queue items (api/grades.js) with `manual: true`; `onSave` saves one
// mark: onSave(item, marks, remark, final).
// ═══════════════════════════════════════════════════════════════
export const ManualGradingQueue = ({ items, onSave }) => {
  const [expanded, setExpanded] = useState(null);
  const [scores, setScores] = useState({});
  const [remarks, setRemarks] = useState({});
  const [busy, setBusy] = useState(false);

  const queue = items.filter((g) => g.status !== "reviewed");
  const doneCount = items.length - queue.length;
  const flagged = queue.filter((g) => g.flags > 0).length;
  const tests = new Set(items.map((g) => g.testId)).size;

  const save = async (g, final) => {
    const raw = scores[g.id] ?? (g.score ?? "");
    if (raw === "" || Number.isNaN(Number(raw))) return;
    setBusy(true);
    try {
      await onSave(g, Number(raw), remarks[g.id] ?? g.feedback ?? "", final);
      // The next answer still waiting opens by itself.
      if (final) {
        const i = queue.findIndex((r) => r.id === g.id);
        setExpanded(queue[i + 1]?.id ?? null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* One summary line instead of four tiles. */}
      <p className="mb-5 text-[13px] text-ink-2">
        <span className="font-medium text-ink">{queue.length} waiting</span> · {doneCount} marked · {items.length} written{" "}
        {items.length === 1 ? "answer" : "answers"} across {tests} {tests === 1 ? "test" : "tests"}
        {flagged > 0 && <span className="text-warning"> · {flagged} with flagged events</span>}
      </p>

      <section className="mb-8">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3 border-b border-rule-2 pb-3.5">
          <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-ink">
            Manual queue
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] text-ink-3">
              Tests published with AI grading off
            </span>
          </div>
        </div>

        {queue.length === 0 ? (
          <EmptyState
            title="All caught up"
            body="Every written answer has been graded. Nothing in the manual queue."
          />
        ) : (
          <TableShell stack label="Answers to mark">
            <thead>
              <tr className="border-b border-rule-2">
                <Th>Student and question</Th>
                <Th hideMid>Roll no</Th>
                <Th hideMid>Test</Th>
                <Th className="text-right">Max marks</Th>
                <Th className="text-right">Flags</Th>
              </tr>
            </thead>
            <tbody>
              {queue.map((g) => {
                const isOpen = expanded === g.id;
                const displayed = scores[g.id] ?? g.score ?? "";
                return (
                  <Fragment key={g.id}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : g.id)}
                      className={cn(
                        "cursor-pointer border-b border-rule transition-colors last:border-b-0 hover:bg-raised/50",
                        isOpen && "bg-raised/60",
                      )}
                    >
                      <Td className="text-[13.5px]">
                        <RowToggle open={isOpen} onToggle={() => setExpanded(isOpen ? null : g.id)} controls={`manual-${g.id}`}>
                          {g.student}
                        </RowToggle>
                        <div className="ml-5 mt-0.5 text-[12.5px] leading-snug text-ink-3">
                          {(g.question ?? "").length > 70 ? g.question.slice(0, 70).trimEnd() + "…" : g.question}
                        </div>
                      </Td>
                      <Td label="Roll no" hideMid className="whitespace-nowrap font-mono text-[12px]">{g.roll}</Td>
                      <Td label="Test" hideMid>{g.test}</Td>
                      <Td label="Max marks" className="text-right font-mono tabular-nums">
                        {g.maxScore}
                      </Td>
                      <Td label="Flags" className="text-right font-mono">
                        {g.flags ? (
                          <span className="whitespace-nowrap rounded-full bg-warning-dim px-2 py-0.5 text-[12px] font-semibold text-warning">
                            {g.flags}
                          </span>
                        ) : (
                          "—"
                        )}
                      </Td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td
                          colSpan={5}
                          id={`manual-${g.id}`}
                          className="border-b border-rule bg-surface p-4 narrow:p-6 tablet:p-8"
                        >
                          <div className="mx-auto max-w-[800px]">
                            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <div className="font-display text-[18px] font-semibold tracking-[-0.01em] text-ink">
                                  {g.student}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-2 text-[12.5px] text-ink-3">
                                  <span className="font-mono">
                                    Roll {g.roll}
                                  </span>
                                  <span className="text-ink-3">·</span>
                                  <span>{g.test}</span>
                                  <span className="text-ink-3">·</span>
                                  <span>{g.submittedAt ? new Date(g.submittedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""}</span>
                                </div>
                              </div>
                              <span className="whitespace-nowrap rounded-full border border-rule-2 bg-raised px-2.5 py-1 text-[12px] font-medium text-ink-3">
                                Manual grading
                              </span>
                            </div>

                            <div className="mb-5 rounded-[var(--radius-container)] border border-rule bg-sunken px-4 py-3.5">
                              <div className="mb-1.5 text-[12px] font-semibold text-ink-3">
                                Question
                              </div>
                              <div className="font-display text-[15px] leading-snug text-ink-2">
                                {g.question}
                              </div>
                              <div className="mb-1.5 mt-4 text-[12px] font-semibold text-ink-3">
                                Student's answer
                              </div>
                              <div className="border-l-2 border-primary pl-3 font-display text-[16px] leading-relaxed text-ink">
                                {g.answer}
                              </div>
                            </div>

                            <div className="mb-4 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
                              <label htmlFor={`manual-mark-${g.id}`} className="text-[12.5px] font-medium text-ink-3">
                                Your mark
                              </label>
                              <input
                                id={`manual-mark-${g.id}`}
                                type="text"
                                inputMode="decimal"
                                placeholder="—"
                                value={displayed}
                                onChange={(e) => {
                                  const v = e.target.value.replace(
                                    /[^0-9.]/g,
                                    "",
                                  );
                                  setScores((prev) => ({ ...prev, [g.id]: v }));
                                }}
                                className="w-[80px] rounded-[var(--radius-control)] border border-rule-2 bg-sunken px-3 py-2 text-center font-display text-[17px] font-semibold tabular-nums text-ink outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                              />
                              <span className="text-[13.5px] text-ink-3">
                                / {g.maxScore}
                              </span>
                            </div>

                            <label htmlFor={`manual-remark-${g.id}`} className="mb-1.5 block text-[12px] font-semibold text-ink-3">
                              Feedback for the student <span className="font-normal">(optional)</span>
                            </label>
                            <textarea
                              id={`manual-remark-${g.id}`}
                              rows={2}
                              placeholder="What was good, what to fix next time"
                              value={remarks[g.id] ?? g.feedback ?? ""}
                              onChange={(e) =>
                                setRemarks((prev) => ({
                                  ...prev,
                                  [g.id]: e.target.value,
                                }))
                              }
                              className="mb-4 w-full resize-y rounded-[var(--radius-control)] border border-rule-2 bg-sunken px-3 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none transition-all placeholder:text-ink-3 focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />

                            <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
                              <Button onClick={() => save(g, true)} disabled={busy || displayed === ""}>
                                Save mark
                              </Button>
                              <Button
                                onClick={() => save(g, false)}
                                disabled={busy || displayed === ""}
                                variant="outline"
                              >
                                Save as draft
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </section>
    </div>
  );
};
