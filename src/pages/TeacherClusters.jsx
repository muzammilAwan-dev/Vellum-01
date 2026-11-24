import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";
import {
  Bento, Chip, ChipRow, Conn, EmptyState, MetricCard, PageError, PageLoading, Scope, SectionHeader,
} from "@/components/common";
import { QuestionSplitModal } from "@/components/teacher-clusters/QuestionSplitModal";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/useApp";
import { useClusters } from "@/hooks/useClusters";
import { cn } from "@/lib/cn";

// Grouping strictness → the server's similarity threshold.
const STRICTNESS = [
  { id: "loose", label: "Looser", threshold: 0.2 },
  { id: "balanced", label: "Balanced", threshold: 0.3 },
  { id: "strict", label: "Stricter", threshold: 0.6 },
];

const weightOf = (c, paperTotal) => {
  const share = paperTotal ? c.paperCount / paperTotal : 0;
  if (c.paperCount >= 2 && share >= 0.6) return { tone: "danger", label: "High weight" };
  if (c.paperCount >= 2 && share >= 0.4) return { tone: "warning", label: "Medium" };
  return { tone: "muted", label: c.paperCount === 1 ? "Seen once" : "Low" };
};

const yearRange = (papers) => {
  const ys = papers.map((p) => p.year).filter(Boolean).sort();
  if (!ys.length) return "Years not set";
  return ys[0] === ys[ys.length - 1] ? `${ys[0]}` : `${ys[0]} – ${ys[ys.length - 1]}`;
};

// ═══════════════════════════════════════════════════════════════
// RECURRING QUESTIONS (clusters)
// ═══════════════════════════════════════════════════════════════
const TeacherClusters = () => {
  const navigate = useNavigate();
  const { activeSubject } = useApp();
  const [strictness, setStrictness] = useState("balanced");
  const [openId, setOpenId] = useState(null);
  const [splitPaper, setSplitPaper] = useState(null);
  const threshold = STRICTNESS.find((s) => s.id === strictness).threshold;
  const { data, isLoading, error, refetch } = useClusters(activeSubject.id, threshold);

  if (isLoading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={refetch} />;

  const { papers, clusters, questionCount } = data;
  const top = clusters[0];

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <div className="mb-5 flex items-center gap-2 text-[13px] font-medium text-ink-3">
        <Scope /> <span className="text-ink-3">/</span> Recurring questions
      </div>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-[28px] font-semibold tablet:text-[34px] leading-[1.1] tracking-[-0.02em] text-ink">
            Recurring <span className="text-ink-3">questions</span>
          </h1>
          <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-ink-2">
            {papers.length
              ? `Across ${papers.length} past ${papers.length === 1 ? "paper" : "papers"} we found ${questionCount} questions, grouped by meaning. A group's size biases the next test toward topics that matter.`
              : "Past papers show which questions keep coming back. Upload some and they'll be grouped here."}
          </p>
        </div>
        <Conn state="live" />
      </div>

      {papers.length === 0 ? (
        <EmptyState
          title="No past papers yet"
          body={`Tag an upload as a past paper on the Materials screen and ${activeSubject.name}'s recurring questions will appear here. Tests still work without them.`}
          action="Upload past papers"
          onAction={() => navigate("/teacher/materials")}
        />
      ) : (
        <>
          <div className="bento mb-10">
            <MetricCard label="Past papers" value={papers.length} delta={yearRange(papers)} deltaTone="success" />
            <MetricCard label="Questions found" value={questionCount} delta={`Across ${papers.length} ${papers.length === 1 ? "paper" : "papers"}`} deltaTone="success" />
            <MetricCard label="Groups" value={clusters.length} delta={STRICTNESS.find((s) => s.id === strictness).label + " grouping"} deltaTone="success" />
            <MetricCard
              variant="featured"
              label="Strongest signal"
              value={top ? top.paperCount : 0}
              unit="×"
              delta={top ? top.label : "—"}
              deltaTone="success"
            />
          </div>

          <section className="mb-10">
            <SectionHeader
              label="Groups · most recurring first"
              action="Draft a test →"
              onAction={() => navigate("/teacher/drafts/new")}
            />
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="text-[12.5px] font-medium text-ink-3">Grouping</span>
              <ChipRow>
                {STRICTNESS.map((s) => (
                  <Chip key={s.id} active={strictness === s.id} onClick={() => setStrictness(s.id)}>
                    {s.label}
                  </Chip>
                ))}
              </ChipRow>
            </div>

            {clusters.length === 0 && (
              <EmptyState
                compact
                title="No questions found in these papers"
                body="The papers were read but no numbered questions were detected. Open a paper below and add the questions by hand."
              />
            )}

            <div className="flex flex-col gap-2">
              {clusters.map((c) => {
                const w = weightOf(c, papers.length);
                const open = openId === c.id;
                return (
                  <Bento key={c.id} className="!p-0">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : c.id)}
                      className="group flex w-full items-center gap-4 px-5 py-4 text-left"
                    >
                      <div className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-primary-dim font-mono text-[12px] font-bold tracking-wider text-primary">
                        {c.paperCount}×
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14.5px] font-medium text-ink">{c.label}</div>
                        <div className="mt-0.5 truncate text-[12.5px] italic text-ink-3">"{c.sample}"</div>
                      </div>
                      <div className="hidden shrink-0 font-mono text-[12.5px] tabular-nums text-ink-3 tablet:block">
                        <b className="font-semibold text-ink">{c.count}</b> {c.count === 1 ? "variant" : "variants"} ·{" "}
                        {c.paperCount} {c.paperCount === 1 ? "paper" : "papers"}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium",
                          w.tone === "danger" && "bg-danger-dim text-danger",
                          w.tone === "warning" && "bg-warning-dim text-warning",
                          w.tone === "muted" && "bg-raised text-ink-3",
                        )}
                      >
                        {w.label}
                      </span>
                      <ChevronRight
                        size={16}
                        className={cn("shrink-0 text-ink-3 transition-transform group-hover:text-primary", open && "rotate-90")}
                      />
                    </button>
                    {open && (
                      <ul className="divide-y divide-rule border-t border-rule px-5">
                        {[...c.questions]
                          .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
                          .map((q) => (
                            <li key={q.id} className="py-3 text-[13.5px] leading-relaxed text-ink-2">
                              <span className="mr-2 font-mono text-[12px] font-semibold text-ink-3">
                                {q.year ?? q.paperName}
                              </span>
                              {q.text}
                            </li>
                          ))}
                      </ul>
                    )}
                  </Bento>
                );
              })}
            </div>
          </section>

          <section className="mb-10">
            <SectionHeader label="Papers" meta="Check how each was split into questions" />
            <div className="flex flex-col divide-y divide-rule rounded-[var(--radius-container)] border border-rule bg-surface">
              {papers.map((p) => (
                <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-ink">{p.name}</div>
                    <div className="font-mono text-[12px] text-ink-3">
                      {p.year ?? "Year not set"} · {p.questionCount} {p.questionCount === 1 ? "question" : "questions"}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSplitPaper(p)}>
                    Review split
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <QuestionSplitModal open={!!splitPaper} onClose={() => setSplitPaper(null)} paper={splitPaper} />
    </div>
  );
};

export default TeacherClusters;
