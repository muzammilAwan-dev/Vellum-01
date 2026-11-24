import { useState, useMemo, Fragment } from "react";
import { typeLabel } from "@/lib/questions";
import { ArrowDown, ArrowUp, ArrowUpDown, Search as SearchIcon } from "lucide-react";
import { deleteBankQuestion } from "@/api/bank";
import { Conn, EmptyState, MetricCard, PageError, PageLoading, TableShell, Td, Th, Scope } from "@/components/common";
import { BankQuestionModal } from "./BankQuestionModal";
import { useApp } from "@/context/useApp";
import { useToast } from "@/context/useToast";
import { useBank } from "@/hooks/useBank";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

const FILTER_SELECT = "h-10 min-h-0 w-auto max-w-full py-0 text-[12.5px] font-medium pointer-coarse:h-12";
const SOURCE_OPTIONS = [
  { value: "all", label: "Any source" },
  { value: "past-paper", label: "Past papers" },
  { value: "generated", label: "AI-generated" },
  { value: "manual", label: "Added by you" },
];

const SOURCE = {
  "past-paper": { label: "Past paper", cls: "bg-raised text-ink-3" },
  generated: { label: "Generated", cls: "border border-success/25 bg-success-dim text-success" },
  manual: { label: "Added by you", cls: "border border-primary/25 bg-primary-dim text-primary" },
};

// ═══════════════════════════════════════════════════════════════
// QUESTION BANK
// ═══════════════════════════════════════════════════════════════
export const QuestionBank = ({ subjectId, onAddToDraft }) => {
  const toast = useToast();
  const { setConfirmState } = useApp();
  const { data, isLoading, error, refetch } = useBank(subjectId);
  const allQuestions = data ?? [];
  const [editor, setEditor] = useState(null); // { question?, duplicate? } | null
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortBy, setSortBy] = useState("used");
  const [sortDir, setSortDir] = useState("desc");
  const [selected, setSelected] = useState(new Set());
  const [expanded, setExpanded] = useState(null);

  const topics = useMemo(
    () => Array.from(new Set(allQuestions.map((q) => q.topic))),
    [data], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const filtered = useMemo(() => {
    let rows = [...allQuestions];
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      rows = rows.filter(
        (q) =>
          q.text.toLowerCase().includes(s) || q.topic.toLowerCase().includes(s),
      );
    }
    if (topicFilter !== "all")
      rows = rows.filter((q) => q.topic === topicFilter);
    if (sourceFilter !== "all")
      rows = rows.filter((q) => q.source === sourceFilter);
    rows.sort((a, b) => {
      let va, vb;
      if (sortBy === "used") {
        va = a.used;
        vb = b.used;
      } else if (sortBy === "marks") {
        va = a.marks;
        vb = b.marks;
      } else if (sortBy === "topic") {
        va = a.topic;
        vb = b.topic;
      } else {
        va = a.text;
        vb = b.text;
      }
      if (typeof va === "string")
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return rows;
  }, [data, search, topicFilter, sourceFilter, sortBy, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("desc");
    }
  };
  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((q) => q.id)));
  };
  const handleAddSelected = () => {
    if (selected.size === 0) return;
    onAddToDraft?.([...selected]);
  };
  const remove = (q) =>
    setConfirmState({
      title: "Delete this question?",
      message: "It leaves the bank. Tests that already used it keep their own copy.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          await deleteBankQuestion(q.id);
          setSelected((prev) => {
            const next = new Set(prev);
            next.delete(q.id);
            return next;
          });
          toast.push("Question deleted", "info");
        } catch (err) {
          toast.push(err.message || "Couldn't delete the question", "error");
        }
      },
    });

  if (isLoading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={refetch} />;

  const sortArrow = (k) =>
    sortBy === k ? (
      <span aria-hidden className="ml-1 inline-flex align-middle text-primary">
        {sortDir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
      </span>
    ) : (
      <span aria-hidden className="ml-1 inline-flex align-middle opacity-40">
        <ArrowUpDown size={13} />
      </span>
    );

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <div className="mb-5 flex items-center gap-2 text-[13px] font-medium text-ink-3">
        <Scope /> <span className="text-ink-3">/</span> Question bank
      </div>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-[28px] font-semibold tablet:text-[34px] leading-[1.1] tracking-[-0.02em] text-ink">
            Question <span className="text-ink-3">bank</span>
          </h1>
          <p className="mt-2 max-w-[680px] text-[14px] leading-relaxed text-ink-2">
            Every question you've approved — from past papers and from drafts —
            tagged and ready to reuse. Publishing a test adds its new questions here.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setEditor({})}>Add a question</Button>
          <Conn state="live" />
        </div>
      </div>

      <div className="bento mb-10">
        <MetricCard
          label="Total questions"
          value={allQuestions.length}
          delta="All sources"
          deltaTone="success"
        />
        <MetricCard
          label="From past papers"
          value={allQuestions.filter((q) => q.source === "past-paper").length}
          delta="Directly reused"
          deltaTone="success"
        />
        <MetricCard
          label="Generated"
          value={allQuestions.filter((q) => q.source === "generated").length}
          delta={`${allQuestions.filter((q) => q.source === "manual").length} added by you`}
          deltaTone="success"
        />
        <MetricCard
          variant="featured"
          label="Most reused"
          value={allQuestions.length ? Math.max(...allQuestions.map((q) => q.used)) : 0}
          unit="×"
          delta="High-signal question"
          deltaTone="success"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-[240px] flex-1 items-center gap-2.5 rounded-[var(--radius-control)] border border-rule-2 bg-surface px-3.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 narrow:max-w-[360px]">
          <SearchIcon size={14} className="shrink-0 text-ink-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search question text or topic…"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
        <Select
          aria-label="Filter by topic"
          value={topicFilter}
          onChange={setTopicFilter}
          options={[{ value: "all", label: "All topics" }, ...topics.map((t) => ({ value: t, label: t }))]}
          className={FILTER_SELECT}
        />
        <Select
          aria-label="Filter by source"
          value={sourceFilter}
          onChange={setSourceFilter}
          options={SOURCE_OPTIONS}
          className={FILTER_SELECT}
        />
        <div className="ml-auto font-mono text-[12px] tabular-nums text-ink-3">
          {filtered.length} shown
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-primary/30 bg-primary-soft px-4 py-2.5 text-[13px] font-medium text-primary shadow-[var(--shadow-primary)]">
          <span>{selected.size} selected</span>
          <Button
            onClick={handleAddSelected} size="sm"
          >
            Add to draft
          </Button>
          <Button
            onClick={() => setSelected(new Set())} variant="ghost" size="sm"
          >
            Clear
          </Button>
        </div>
      )}

      <TableShell>
        <thead>
          <tr className="border-b border-rule-2">
            <Th className="w-9">
              <input
                type="checkbox"
                checked={
                  selected.size === filtered.length && filtered.length > 0
                }
                onChange={selectAll}
                aria-label="Select all"
                className="size-4 appearance-none rounded-sm border border-rule-2 bg-bg transition-colors checked:border-primary checked:bg-primary"
              />
            </Th>
            <Th>
              <button
                onClick={() => toggleSort("text")}
                className="inline-flex items-center"
              >
                Question {sortArrow("text")}
              </button>
            </Th>
            <Th>
              <button
                onClick={() => toggleSort("topic")}
                className="inline-flex items-center"
              >
                Topic {sortArrow("topic")}
              </button>
            </Th>
            <Th>Source</Th>
            <Th className="text-right">
              <button
                onClick={() => toggleSort("marks")}
                className="inline-flex items-center"
              >
                Marks {sortArrow("marks")}
              </button>
            </Th>
            <Th className="text-right">
              <button
                onClick={() => toggleSort("used")}
                className="inline-flex items-center"
              >
                Used {sortArrow("used")}
              </button>
            </Th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="p-0">
                <EmptyState
                  compact
                  title={allQuestions.length ? "No questions found" : "Your bank is empty"}
                  body={
                    allQuestions.length
                      ? "Try a different search, or broaden the filters."
                      : "Questions you publish in a test are saved here automatically — or add one by hand."
                  }
                  action={allQuestions.length ? "Clear filters" : "Add a question"}
                  onAction={() => {
                    if (!allQuestions.length) return setEditor({});
                    setSearch("");
                    setTopicFilter("all");
                    setSourceFilter("all");
                  }}
                />
              </td>
            </tr>
          )}
          {filtered.map((q) => {
            const isOpen = expanded === q.id;
            const isSelected = selected.has(q.id);
            return (
              <Fragment key={q.id}>
                <tr
                  onClick={() => setExpanded(isOpen ? null : q.id)}
                  className={cn(
                    "cursor-pointer border-b border-rule transition-colors last:border-b-0 hover:bg-raised/50",
                    isOpen && "bg-raised/60",
                  )}
                >
                  <Td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => toggleSelect(q.id, e)}
                      aria-label={`Select question ${q.id}`}
                      className="size-4 appearance-none rounded-sm border border-rule-2 bg-bg transition-colors checked:border-primary checked:bg-primary"
                    />
                  </Td>
                  <Td className="text-[13.5px] font-medium text-ink">
                    {q.text.length > 90 ? q.text.slice(0, 90) + "…" : q.text}
                  </Td>
                  <Td>
                    <span title={q.topic} className="inline-block max-w-[16rem] truncate rounded-full align-middle border border-primary/25 bg-primary-dim px-2 py-0.5 text-[12px] font-medium text-primary">
                      {q.topic}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        "whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium",
                        (SOURCE[q.source] ?? SOURCE.generated).cls,
                      )}
                    >
                      {(SOURCE[q.source] ?? SOURCE.generated).label}
                    </span>
                  </Td>
                  <Td className="text-right font-mono tabular-nums">
                    {q.marks}
                  </Td>
                  <Td className="text-right font-mono tabular-nums">
                    {q.used}×
                  </Td>
                </tr>
                {isOpen && (
                  <tr>
                    <td
                      colSpan={6}
                      className="border-b border-rule bg-surface p-6 tablet:p-8"
                    >
                      <div className="mx-auto max-w-[900px]">
                        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="font-display text-[18px] font-semibold tracking-[-0.01em] text-ink">
                              Question preview
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 font-mono text-[12px] text-ink-3">
                              <span>{typeLabel(q.type)}</span>
                              <span className="text-ink-3">·</span>
                              <span>{q.topic}</span>
                              <span className="text-ink-3">·</span>
                              <span>{q.marks} marks</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button onClick={() => setEditor({ question: q })} variant="outline" size="sm">
                              Edit
                            </Button>
                            <Button onClick={() => setEditor({ question: q, duplicate: true })} variant="outline" size="sm">
                              Duplicate
                            </Button>
                            <Button onClick={() => remove(q)} variant="ghost" size="sm">
                              Delete
                            </Button>
                            <Button onClick={() => onAddToDraft?.([q.id])} size="sm">
                              Add to draft
                            </Button>
                          </div>
                        </div>

                        <div className="mb-4 rounded-[var(--radius-container)] border border-rule bg-sunken px-4 py-3.5">
                          <div className="mb-1.5 text-[12px] font-semibold text-ink-3">
                            Question
                          </div>
                          <div className="font-display text-[17px] leading-snug text-ink">
                            {q.text}
                          </div>
                        </div>

                        {q.options && (
                          <div className="mb-4 grid grid-cols-1 gap-1.5 tablet:grid-cols-2">
                            {q.options.map((o, j) => (
                              <div
                                key={j}
                                className="flex items-baseline gap-2.5 rounded-[var(--radius-control)] border border-rule bg-bg px-3 py-2 text-[13.5px] text-ink-2"
                              >
                                <span className="font-mono text-[12px] font-bold text-ink-3">
                                  {String.fromCharCode(65 + j)}
                                </span>
                                <span>{o}</span>
                                {j === q.correctIndex && (
                                  <span className="ml-auto whitespace-nowrap rounded-full bg-success-dim px-2 py-0.5 text-[11px] font-semibold text-success">
                                    Correct
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {q.expectedAnswer && (
                          <div className="mb-4 rounded-[var(--radius-container)] border border-rule bg-sunken px-4 py-3.5">
                            <div className="mb-1.5 text-[12px] font-semibold text-ink-3">Expected answer</div>
                            <div className="text-[13.5px] leading-relaxed text-ink-2">{q.expectedAnswer}</div>
                          </div>
                        )}
                        {q.rubric?.length > 0 && (
                        <div className="rounded-[var(--radius-container)] border border-rule bg-sunken px-4 py-3.5">
                          <div className="mb-2 text-[12px] font-semibold text-ink-3">
                            Rubric
                          </div>
                          {q.rubric.map((r, j) => (
                            <div
                              key={j}
                              className="flex items-center justify-between border-b border-rule py-1.5 text-[13px] last:border-b-0"
                            >
                              <span className="text-ink-2">{r.label}</span>
                              <span className="font-mono text-[12px] font-semibold tabular-nums text-ink">
                                {r.points} pts
                              </span>
                            </div>
                          ))}
                        </div>
                        )}

                        <div className="mt-4 flex flex-wrap gap-2 font-mono text-[12px] text-ink-3">
                          <span>Last used: {q.lastUsed ? formatDateTime(q.lastUsed) : "never"}</span>
                          <span className="text-ink-3">·</span>
                          <span>
                            Used in {q.used} test{q.used !== 1 ? "s" : ""}
                          </span>
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

      <BankQuestionModal
        open={!!editor}
        onClose={() => setEditor(null)}
        subjectId={subjectId}
        question={editor?.question ?? null}
        duplicate={!!editor?.duplicate}
      />
    </div>
  );
};
