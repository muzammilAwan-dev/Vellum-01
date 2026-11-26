import { useState, useMemo, Fragment } from "react";
import { Chip, PageError, PageHeader, PageLoading, RowToggle, Scope, SearchField, Segmented, StatusDot, TableShell, Td, Th } from "@/components/common";
import { GradingDetailPanel } from "@/components/teacher-grade-review/GradingDetailPanel";
import { ManualGradingQueue } from "@/components/teacher-grade-review/ManualGradingQueue";
import { useToast } from "@/context/useToast";
import { approveGrades, reviewGrade } from "@/api/grades";
import { useGradeQueue } from "@/hooks/useGrading";
import { usePersistentState } from "@/hooks/usePersistentState";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

const CONF_RANK = { low: 0, med: 1, high: 2 };

const CONF_LABEL = { low: "Low", med: "Medium", high: "High" };

const TeacherGradeReview = () => {
  const toast = useToast();
  const [view, setView] = useState("review"); // "review" (AI drafts) | "manual"
  const { data: queue = [], isLoading, error, refetch } = useGradeQueue();
  const aiItems = useMemo(() => queue.filter((g) => !g.manual), [queue]);
  const manualItems = useMemo(() => queue.filter((g) => g.manual), [queue]);
  const manualPending = manualItems.filter((g) => g.status !== "reviewed").length;
  const [search, setSearch] = usePersistentState(
    "vellum.gradeReview.search",
    "",
  );
  const [filter, setFilter] = usePersistentState(
    "vellum.gradeReview.filter",
    "pending",
  );
  const [sortBy] = usePersistentState(
    "vellum.gradeReview.sortBy",
    "confidence",
  );
  const [sortDir] = usePersistentState(
    "vellum.gradeReview.sortDir",
    "asc",
  );
  const [groupBy, setGroupBy] = usePersistentState(
    "vellum.gradeReview.groupBy",
    "answers",
  );
  // "answers" = one row per answer (worst confidence first); "question" = the same answers grouped
  // under each question (fastest way to mark: one rubric in your head at a time); "student".
  const grouping = ["answers", "question", "student"].includes(groupBy) ? groupBy : "answers";
  const [expanded, setExpanded] = useState(null);
  const [approving, setApproving] = useState(false);

  const isReviewed = (g) => g.status === "reviewed";

  const filtered = useMemo(() => {
    let rows = [...aiItems];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.student.toLowerCase().includes(q) ||
          r.roll.toLowerCase().includes(q) ||
          r.test.toLowerCase().includes(q) ||
          (r.question ?? "").toLowerCase().includes(q),
      );
    }
    if (filter === "pending") rows = rows.filter((r) => !isReviewed(r));
    if (filter === "low") rows = rows.filter((r) => r.confidence === "low");
    if (filter === "high") rows = rows.filter((r) => r.confidence === "high");
    if (filter === "reviewed") rows = rows.filter(isReviewed);
    if (filter === "flagged") rows = rows.filter((r) => r.flags > 0);
    rows.sort((a, b) => {
      let va, vb;
      if (sortBy === "confidence") {
        va = CONF_RANK[a.confidence];
        vb = CONF_RANK[b.confidence];
      } else if (sortBy === "student") {
        va = a.student;
        vb = b.student;
      } else if (sortBy === "score") {
        va = a.score;
        vb = b.score;
      } else {
        va = a.test;
        vb = b.test;
      }
      if (typeof va === "string")
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return rows;
  }, [aiItems, search, filter, sortBy, sortDir]);

  const groupedRows = useMemo(() => {
    if (grouping !== "student") return null;
    const map = new Map();
    filtered.forEach((g) => {
      const key = g.student + "::" + g.test;
      if (!map.has(key))
        map.set(key, {
          key,
          student: g.student,
          roll: g.roll,
          test: g.test,
          date: g.date,
          rows: [],
        });
      map.get(key).rows.push(g);
    });
    return [...map.values()].map((grp) => {
      const totalScore = grp.rows.reduce((s, r) => s + (r.score ?? 0), 0);
      const totalMax = grp.rows.reduce((s, r) => s + r.maxScore, 0);
      const totalFlags = grp.rows.reduce((s, r) => s + r.flags, 0);
      const worstConfidence = grp.rows.reduce(
        (worst, r) =>
          CONF_RANK[r.confidence] < CONF_RANK[worst] ? r.confidence : worst,
        "high",
      );
      const reviewedCount = grp.rows.filter(isReviewed).length;
      return {
        ...grp,
        totalScore,
        totalMax,
        totalFlags,
        worstConfidence,
        reviewedCount,
        allReviewed: reviewedCount === grp.rows.length,
      };
    });
  }, [filtered, grouping]);

  // By question: same rows, ordered by test then question, with a header row per question.
  const byQuestion = useMemo(() => {
    if (grouping !== "question") return null;
    const groups = new Map();
    filtered.forEach((g) => {
      const key = g.testId + "::" + g.questionId;
      if (!groups.has(key)) groups.set(key, { key, test: g.test, question: g.question, topic: g.topic, max: g.maxScore, rows: [] });
      groups.get(key).rows.push(g);
    });
    return [...groups.values()];
  }, [filtered, grouping]);

  const pendingTotal = aiItems.filter((g) => !isReviewed(g)).length;
  const lowTotal = aiItems.filter((g) => g.confidence === "low" && !isReviewed(g)).length;
  const reviewedTotal = aiItems.filter(isReviewed).length;
  const flaggedTotal = aiItems.filter((g) => g.flags > 0 && !isReviewed(g)).length;
  const progressPct = aiItems.length ? Math.round((reviewedTotal / aiItems.length) * 100) : 0;
  const testCount = new Set(aiItems.map((g) => g.testId)).size;
  const approvable = aiItems.filter((g) => g.status === "pending" && g.confidence === "high");

  // Saves one mark. Throws are shown as a toast and re-thrown so a panel
  // keeps its inputs instead of closing.
  const saveMark = async (g, marks, remark, final = true, reason = "") => {
    try {
      await reviewGrade(g.attemptId, g.questionId, { marks, feedback: remark, final, reason });
      toast.push(
        final ? `${g.student} graded at ${marks} / ${g.maxScore}` : "Saved as a draft",
        final ? "success" : "info",
      );
      return true;
    } catch (err) {
      toast.push(err?.message || "Couldn't save that mark — try again", "error");
      return false;
    }
  };
  // After a final mark, the next answer still waiting opens by itself (grade without hunting).
  const ordered = grouping === "question" ? (byQuestion ?? []).flatMap((q) => q.rows) : filtered;
  const nextAfter = (g) => {
    const i = ordered.findIndex((r) => r.id === g.id);
    return ordered.slice(i + 1).find((r) => !isReviewed(r)) ?? null;
  };
  const handleSave = async (g, score, remark, final, reason) => {
    if ((await saveMark(g, score, remark, final, reason)) && final) setExpanded(nextAfter(g)?.id ?? null);
  };
  const handleSaveGrouped = (g, score, remark, final, reason) =>
    saveMark(g, score, remark, final, reason);

  const bulkApprove = async () => {
    setApproving(true);
    try {
      const { approved } = await approveGrades(
        approvable.map((g) => ({ attemptId: g.attemptId, questionId: g.questionId })),
      );
      toast.push(`Approved ${approved} high-confidence ${approved === 1 ? "grade" : "grades"}`, "success");
    } catch (err) {
      toast.push(err?.message || "Couldn't approve — try again", "error");
    } finally {
      setApproving(false);
    }
  };

  if (isLoading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={refetch} />;

  const confDot = (c) => cn("size-1.5 shrink-0 rounded-full", c === "high" ? "bg-success" : c === "med" ? "bg-warning" : "bg-danger");
  const flagCell = (n) =>
    n ? (
      <span className="whitespace-nowrap rounded-full bg-warning-dim px-2 py-0.5 text-[12px] font-semibold text-warning">
        {n} <span className="sr-only">{n === 1 ? "flag" : "flags"}</span>
      </span>
    ) : (
      <span aria-label="No flags">—</span>
    );
  const snippet = (t = "", n = 70) => (t.length > n ? t.slice(0, n).trimEnd() + "…" : t);

  // One answer row (used by "Answers" and "By question").
  const answerRow = (g, { showQuestion }) => {
    const isOpen = expanded === g.id;
    const panelId = `grade-panel-${g.id}`;
    return (
      <Fragment key={g.id}>
        <tr
          onClick={() => setExpanded(isOpen ? null : g.id)}
          className={cn("cursor-pointer border-b border-rule transition-colors last:border-b-0 hover:bg-raised/50", isOpen && "bg-raised/60")}
        >
          <Td className="text-[13.5px]">
            <RowToggle open={isOpen} onToggle={() => setExpanded(isOpen ? null : g.id)} controls={panelId}>
              {g.student}
            </RowToggle>
            {showQuestion && <div className="ml-5 mt-0.5 text-[12.5px] leading-snug text-ink-3">{snippet(g.question)}</div>}
          </Td>
          <Td label="Roll no" hideMid hidePhone className="whitespace-nowrap font-mono text-[12px]">{g.roll}</Td>
          {showQuestion && <Td label="Test" hideMid>{g.test}</Td>}
          <Td label="AI mark" className="whitespace-nowrap text-right font-mono tabular-nums text-ink">
            {g.score} / {g.maxScore}
          </Td>
          <Td label="Confidence">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-ink-2">
              <span aria-hidden="true" className={confDot(g.confidence)} />
              {CONF_LABEL[g.confidence]}
            </span>
          </Td>
          <Td label="Status">
            <StatusDot tone={isReviewed(g) ? "success" : "warning"}>{isReviewed(g) ? "Reviewed" : "Pending"}</StatusDot>
          </Td>
          <Td label="Flags" hidePhone={!g.flags} className="text-right font-mono">{flagCell(g.flags)}</Td>
        </tr>
        {isOpen && (
          <tr>
            <td colSpan={7} className="p-0" id={panelId}>
              <GradingDetailPanel
                g={g}
                nextLabel={nextAfter(g) ? "Accept & next" : "Accept"}
                onClose={() => setExpanded(null)}
                onSave={(score, remark, final, reason) => handleSave(g, score, remark, final, reason)}
              />
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  const rows = grouping === "student" ? groupedRows : grouping === "question" ? byQuestion : filtered;

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <PageHeader
        crumbs={[{ label: <Scope /> }, { label: "Grade review" }]}
        title="Grade review"
        intro={
          view === "review"
            ? aiItems.length === 0
              ? "No AI-graded answers yet. They appear here once students submit."
              : pendingTotal === 0
                ? "Every AI-graded answer is reviewed. Students see a mark once you've approved it."
                : `${pendingTotal} AI-graded ${pendingTotal === 1 ? "answer is" : "answers are"} waiting for you across ${testCount} ${testCount === 1 ? "test" : "tests"}${lowTotal ? `, ${lowTotal} with low confidence (check those first)` : ""}. Students only see a mark once you've approved it.`
            : "These tests have AI grading off, so every written answer waits here for your mark."
        }
        actions={
          view === "review" && approvable.length > 0 ? (
            <Button onClick={bulkApprove} disabled={approving}>
              {approving ? "Approving…" : `Approve ${approvable.length} high-confidence`}
            </Button>
          ) : null
        }
      >
        <Segmented
          className="mt-5"
          label="Which answers"
          value={view}
          onChange={(v) => {
            setView(v);
            setExpanded(null);
          }}
          options={[
            { value: "review", label: "AI-graded", count: pendingTotal || undefined },
            { value: "manual", label: "Manual queue", count: manualPending || undefined },
          ]}
        />
      </PageHeader>

      {view === "manual" && <ManualGradingQueue items={manualItems} onSave={saveMark} />}

      {view === "review" && (
        <>
          {/* Progress: one line, not four tiles (the chips below carry the counts). */}
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-2">
            <span className="font-medium text-ink">
              {reviewedTotal} of {aiItems.length} reviewed
            </span>
            <div
              className="h-1.5 w-[160px] max-w-full overflow-hidden rounded-full bg-rule"
              role="progressbar"
              aria-label="Answers reviewed"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-success transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-ink-3">{progressPct}%</span>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SearchField
              label="Search answers"
              value={search}
              onChange={setSearch}
              placeholder="Student, roll no, test or question…"
              className="w-full narrow:w-[300px]"
            />
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show">
              <Chip active={filter === "pending"} onClick={() => setFilter("pending")}>
                Pending <span className="tabular-nums">{pendingTotal}</span>
              </Chip>
              <Chip active={filter === "low"} onClick={() => setFilter("low")}>
                Low confidence <span className="tabular-nums">{lowTotal}</span>
              </Chip>
              <Chip active={filter === "flagged"} onClick={() => setFilter("flagged")}>
                Flagged <span className="tabular-nums">{flaggedTotal}</span>
              </Chip>
              <Chip active={filter === "reviewed"} onClick={() => setFilter("reviewed")}>
                Reviewed <span className="tabular-nums">{reviewedTotal}</span>
              </Chip>
              <Chip active={filter === "all"} onClick={() => setFilter("all")}>
                All
              </Chip>
            </div>
            <Segmented
              size="sm"
              className="xl:ml-auto"
              label="Group answers"
              value={grouping}
              onChange={(v) => {
                setGroupBy(v);
                setExpanded(null);
              }}
              options={[
                { value: "answers", label: "Answers" },
                { value: "question", label: "By question" },
                { value: "student", label: "By student" },
              ]}
            />
          </div>

          <TableShell stack label="Answers to review">
            <thead>
              <tr className="border-b border-rule-2">
                <Th>{grouping === "student" ? "Student" : "Student and question"}</Th>
                <Th hideMid>Roll no</Th>
                {grouping !== "question" && <Th hideMid>Test</Th>}
                <Th className="text-right">{grouping === "student" ? "AI total" : "AI mark"}</Th>
                <Th>Confidence</Th>
                <Th>Status</Th>
                <Th className="text-right">Flags</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-[13px] text-ink-3">
                    {filter === "pending" && !search.trim() ? "Nothing waiting. Every answer here is reviewed." : "No answers match these filters."}
                  </td>
                </tr>
              )}

              {grouping === "answers" && filtered.map((g) => answerRow(g, { showQuestion: true }))}

              {grouping === "question" &&
                byQuestion.map((q) => (
                  <Fragment key={q.key}>
                    <tr className="border-b border-rule bg-sunken">
                      <td colSpan={7} className="px-3 py-3 narrow:px-4">
                        <div className="text-[12px] font-semibold text-ink-3">
                          {q.test} · {q.topic ? `${q.topic} · ` : ""}
                          {q.max} {q.max === 1 ? "mark" : "marks"} · {q.rows.length} {q.rows.length === 1 ? "answer" : "answers"}
                        </div>
                        <div className="mt-0.5 text-[14px] font-medium leading-snug text-ink">{q.question}</div>
                      </td>
                    </tr>
                    {q.rows.map((g) => answerRow(g, { showQuestion: false }))}
                  </Fragment>
                ))}

              {grouping === "student" &&
                groupedRows.map((grp) => {
                  const isOpen = expanded === grp.key;
                  const panelId = `grade-group-${grp.key.replace(/[^a-z0-9]/gi, "-")}`;
                  return (
                    <Fragment key={grp.key}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : grp.key)}
                        className={cn("cursor-pointer border-b border-rule transition-colors last:border-b-0 hover:bg-raised/50", isOpen && "bg-raised/60")}
                      >
                        <Td className="text-[13.5px]">
                          <RowToggle open={isOpen} onToggle={() => setExpanded(isOpen ? null : grp.key)} controls={panelId}>
                            {grp.student}
                          </RowToggle>
                        </Td>
                        <Td label="Roll no" hideMid hidePhone className="whitespace-nowrap font-mono text-[12px]">{grp.roll}</Td>
                        <Td label="Test" hideMid>{grp.test}</Td>
                        <Td label="AI total" className="whitespace-nowrap text-right font-mono tabular-nums text-ink">
                          {grp.totalScore} / {grp.totalMax}
                        </Td>
                        <Td label="Confidence">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-ink-2">
                            <span aria-hidden="true" className={confDot(grp.worstConfidence)} />
                            {CONF_LABEL[grp.worstConfidence]}
                          </span>
                        </Td>
                        <Td label="Status">
                          <StatusDot tone={grp.allReviewed ? "success" : "warning"}>
                            {grp.allReviewed ? "Reviewed" : `${grp.reviewedCount} / ${grp.rows.length} reviewed`}
                          </StatusDot>
                        </Td>
                        <Td label="Flags" className="text-right font-mono">{flagCell(grp.totalFlags)}</Td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} id={panelId} className="border-b border-rule bg-surface p-0">
                            <div className="px-4 pt-5 font-display text-[13.5px] font-semibold text-ink-2 narrow:px-6 tablet:px-12">
                              {grp.student}'s submission · {grp.rows.length} {grp.rows.length === 1 ? "answer" : "answers"} to mark
                            </div>
                            {grp.rows.map((g, i) => (
                              <div key={g.id}>
                                <div className="px-4 pt-4 text-[12px] font-semibold text-ink-3 narrow:px-6 tablet:px-12">
                                  Answer {i + 1} of {grp.rows.length}
                                </div>
                                <GradingDetailPanel
                                  g={g}
                                  showClose={false}
                                  nextLabel="Accept"
                                  onClose={() => {}}
                                  onSave={(score, remark, final, reason) => handleSaveGrouped(g, score, remark, final, reason)}
                                />
                              </div>
                            ))}
                            <div className="flex justify-end px-4 py-5 narrow:px-6 tablet:px-12">
                              <Button onClick={() => setExpanded(null)} variant="outline">
                                Close submission
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
            </tbody>
          </TableShell>

          <p className="mt-4 text-[12.5px] text-ink-3">
            When students see results depends on each test's release setting.
          </p>
        </>
      )}
    </div>
  );
};

export default TeacherGradeReview;
