import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import { TrendingUp, TrendingDown, Minus, Target, AlertTriangle, CheckCircle2, Send } from "lucide-react";
import { Bento, Chip, EmptyState, MetricCard, PageError, PageHeader, PageLoading, PrintHeader, SectionHeader, Scope, TableShell } from "@/components/common";
import { ActionMenu } from "@/components/ui/menu";
import { InteractiveDotPlot } from "@/components/common/charts/InteractiveDotPlot";
import { SmallMultiple } from "@/components/common/charts/SmallMultiple";
import { Button } from "@/components/ui/button";
import { ShareDialog } from "@/components/teacher-report/ShareDialog";
import { useApp } from "@/context/useApp";
import { useClassAnalytics } from "@/hooks/useAnalytics";
import { useInstitution } from "@/hooks/useInstitution";
import { topicInsights } from "@/lib/analytics";
import { downloadCsv } from "@/lib/csv";
import { TREND_LABEL } from "@/lib/studentHistory";

const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;
const TONE_TEXT = { danger: "text-danger", warning: "text-warning", success: "text-success" };
const TREND_VIEW = { up: [TrendingUp, "text-success"], down: [TrendingDown, "text-danger"], steady: [Minus, "text-ink-3"] };

const TrendCell = ({ trend }) => {
  if (!trend) return <span title="Needs at least 3 graded tests">—</span>;
  const [Icon, tone] = TREND_VIEW[trend];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium ${tone}`}>
      <Icon size={14} aria-hidden="true" />
      {TREND_LABEL[trend]}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════
// TEACHER ANALYTICS — the class + subject picture from real, fully graded
// attempts (GET /analytics/class).
// ═══════════════════════════════════════════════════════════════
export const AnalyticsOverview = ({ onStudentClick }) => {
  const { activeClassObj, activeSubject, scopeLoading } = useApp();
  // Row picks feed "Share report" (F12d); ids of other classes are ignored below.
  const [picked, setPicked] = useState(() => new Set());
  const [sharing, setSharing] = useState(false);
  // ?show=at-risk (from the home page) narrows the student list; kept in the URL so links work.
  const [params, setParams] = useSearchParams();
  const show = params.get("show") === "at-risk" ? "at-risk" : "all";
  const { data: institution } = useInstitution();
  const { data, isLoading, error, refetch } = useClassAnalytics({
    classId: activeClassObj?.id,
    subjectId: activeSubject?.id,
  });
  // Links from the home page (#topics) land on the section once it has rendered.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash && data) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash, data]);

  if (scopeLoading || (isLoading && activeClassObj && activeSubject)) return <PageLoading />;
  if (!activeClassObj || !activeSubject) {
    return <EmptyState title="Choose a class and subject" body="Pick them in the sidebar to see how the class is doing." />;
  }
  if (error) return <PageError error={error} onRetry={refetch} />;

  const { trend, topics, students, summary } = data;
  const empty = summary.tests === 0;
  const insights = topicInsights(topics, { students: summary.studentsTotal, target: summary.target });
  const firstSpread = trend[0]?.spread;
  const pickedCount = students.filter((s) => picked.has(s.id)).length;
  const allPicked = students.length > 0 && pickedCount === students.length;
  const togglePicked = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const atRisk = (s) => s.overall != null && s.overall < (summary.target ?? 75);
  const shown = show === "at-risk" ? students.filter(atRisk) : students;

  const exportCsv = () =>
    downloadCsv(
      `analytics-${activeClassObj.short}-${activeSubject.name}.csv`.replace(/\s+/g, "-").toLowerCase(),
      ["Student", "Roll", "Overall %", "Tests", "Trend", "Last test", "Last test %", "Topics below target", "Weakest topic", "Strongest topic", "Flags"],
      students.map((s) => [s.name, s.roll, s.overall ?? "", s.tests, s.trend ? TREND_LABEL[s.trend] : "", s.lastTest?.title ?? "", s.lastTest?.percent ?? "", s.belowTarget, s.weak ?? "", s.strong ?? "", s.flags]),
    );

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <PrintHeader institution={institution} title={`Class analytics · ${activeClassObj.short} · ${activeSubject.name}`} />
      <PageHeader
        crumbs={[{ label: <Scope /> }, { label: "Analytics" }]}
        title="Analytics"
        titleNote={!empty ? <span className="text-ink-3">Tests 1 to {summary.tests}</span> : null}
        intro={
          empty
            ? "Nothing to show yet. Results appear here once students have submitted and every mark is final."
            : "Everything the class has done in this subject, from fully marked tests only."
        }
        actions={
          students.length > 0 ? (
            <>
              <Button onClick={() => setSharing(true)}>
                <Send size={13} aria-hidden="true" /> Send parent reports
              </Button>
              <ActionMenu
                label="Export"
                items={[
                  { id: "pdf", label: "Print / save as PDF", onSelect: () => window.print() },
                  { id: "csv", label: "Download CSV", onSelect: exportCsv },
                ]}
              />
            </>
          ) : null
        }
      />

      {empty ? (
        <EmptyState
          title="No graded tests yet"
          body={
            summary.awaiting > 0
              ? `${summary.awaiting} submitted ${summary.awaiting === 1 ? "attempt is" : "attempts are"} waiting for your review in Grade review.`
              : "Publish a test and let students take it. Analytics count only fully marked attempts."
          }
        />
      ) : (
        <>
          <div className="bento mb-14">
            <MetricCard
              icon={TrendingUp}
              iconTone="primary"
              label="Class average"
              value={summary.classAverage}
              unit="%"
              delta={summary.changeSinceFirst != null ? `${signed(summary.changeSinceFirst)} since T1` : "First test"}
              deltaTone={summary.changeSinceFirst == null || summary.changeSinceFirst >= 0 ? "success" : "danger"}
            />
            <MetricCard
              icon={Target}
              iconTone="neutral"
              label="Spread (σ)"
              value={`±${summary.spread}`}
              delta={
                trend.length < 2 ? "First test"
                : summary.spread < firstSpread ? "Narrowing"
                : summary.spread > firstSpread ? "Widening"
                : "Steady"
              }
              deltaTone={trend.length < 2 || summary.spread <= firstSpread ? "success" : "warning"}
            />
            <MetricCard
              icon={AlertTriangle}
              iconTone={summary.belowTarget.length ? "warning" : "success"}
              label="Below target"
              value={summary.belowTarget.length}
              unit={`of ${summary.topicsTotal}`}
              delta={summary.belowTarget[0] ?? "All topics on target"}
              deltaTone={summary.belowTarget.length ? "warning" : "success"}
            />
            <MetricCard
              icon={CheckCircle2}
              iconTone="success"
              label="Tests graded"
              value={summary.tests}
              delta={summary.awaiting > 0 ? `${summary.awaiting} awaiting marks` : "All marked"}
              deltaTone={summary.awaiting > 0 ? "warning" : "success"}
            />
          </div>

          <section className="mb-14" id="topics">
            <SectionHeader label="Topic accuracy" meta="weakest first" />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Bento className="min-h-[340px]">
                <InteractiveDotPlot rows={topics} />
              </Bento>
              <Bento>
                <div className="flex flex-col gap-4">
                  {insights.map((it, i) => (
                    <div key={it.name} className={i ? "border-t border-rule pt-4" : ""}>
                      <div className="mb-1 text-[14px] font-semibold text-ink">{it.name}</div>
                      <div className="text-[13px] leading-relaxed text-ink-2">
                        {it.kind === "rest" ? "At or above" : it.kind === "weakest" ? "Weakest at" : "Sits at"}{" "}
                        <span className={`font-semibold ${TONE_TEXT[it.tone]}`}>{it.accuracy}%</span>. {it.detail}.
                      </div>
                    </div>
                  ))}
                </div>
              </Bento>
            </div>
          </section>

          <section className="mb-14">
            <SectionHeader label="How each topic moved" meta={`tests 1 to ${summary.tests}`} />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-px overflow-hidden rounded-[var(--radius-container)] border border-rule bg-rule">
              {[...topics].sort((a, b) => a.accuracy - b.accuracy).map((t) => <SmallMultiple key={t.name} topic={t} />)}
            </div>
          </section>
        </>
      )}

      <section className="mb-14">
        <SectionHeader label="Students" meta="sorted by overall" />
        <div className="no-print mb-3 flex flex-wrap items-center gap-2">
          <Chip active={show === "all"} onClick={() => setParams((p) => { p.delete("show"); return p; }, { replace: true })}>
            All <span className="tabular-nums">{students.length}</span>
          </Chip>
          <Chip active={show === "at-risk"} onClick={() => setParams((p) => { p.set("show", "at-risk"); return p; }, { replace: true })}>
            Under {summary.target ?? 75}% <span className="tabular-nums">{students.filter(atRisk).length}</span>
          </Chip>
          {pickedCount > 0 && (
            <div role="status" className="ml-auto flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
              <span className="font-semibold text-ink">{pickedCount} selected</span>
              <Button size="sm" onClick={() => setSharing(true)}>
                <Send size={13} aria-hidden="true" />
                Send reports to their parents
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
                Clear
              </Button>
            </div>
          )}
        </div>
        {sharing && <ShareDialog open onClose={() => setSharing(false)} classId={activeClassObj.id} subjectId={activeSubject.id} selectedIds={[...picked]} />}
        <TableShell stack label="Students">
          <thead>
            <tr className="border-b border-rule-2">
              <th className="px-3 py-2.5 text-left text-[12px] font-semibold text-ink-3 narrow:px-4">
                <label className="inline-flex min-h-8 cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all students"
                    checked={allPicked}
                    ref={(el) => {
                      if (el) el.indeterminate = pickedCount > 0 && !allPicked;
                    }}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(students.map((s) => s.id)))}
                    className="no-print size-5 cursor-pointer accent-[var(--color-primary)]"
                  />
                  Student
                </label>
              </th>
              <th className="px-4 py-2.5 text-right text-[12px] font-semibold text-ink-3">Overall</th>
              <th className="px-4 py-2.5 text-left text-[12px] font-semibold text-ink-3">Trend</th>
              <th className="px-4 py-2.5 text-left text-[12px] font-semibold text-ink-3 narrow:max-xl:hidden">Last test</th>
              <th className="px-4 py-2.5 text-right text-[12px] font-semibold text-ink-3">Below target</th>
              <th className="px-4 py-2.5 text-left text-[12px] font-semibold text-ink-3 narrow:max-xl:hidden">Weakest</th>
              <th className="px-4 py-2.5 text-left text-[12px] font-semibold text-ink-3 max-xl:hidden">Strongest</th>
              <th className="px-4 py-2.5 text-right text-[12px] font-semibold text-ink-3">Flags</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-[13px] text-ink-3">Nobody is under the target. Good news.</td>
              </tr>
            )}
            {shown.map((s) => (
              <tr key={s.id} className="border-b border-rule transition-colors last:border-b-0 hover:bg-raised/50">
                <td className="px-3 py-2 narrow:px-4">
                  <span className="inline-flex min-h-9 items-center gap-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${s.name}`}
                      checked={picked.has(s.id)}
                      onChange={() => togglePicked(s.id)}
                      className="no-print size-5 shrink-0 cursor-pointer accent-[var(--color-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => onStudentClick?.(s, shown.map((x) => x.id))}
                      className="inline-flex min-h-8 items-center rounded-sm text-left text-[13.5px] font-medium text-ink [overflow-wrap:anywhere] hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      {s.name}
                    </button>
                  </span>
                </td>
                <td data-label="Overall" className="px-4 py-3 text-right font-mono tabular-nums text-ink">{s.overall != null ? `${s.overall}%` : "—"}</td>
                <td data-label="Trend" className="px-4 py-3">
                  <TrendCell trend={s.trend} />
                </td>
                <td data-label="Last test" data-phone="hide" className="px-4 py-3 narrow:max-xl:hidden">
                  {s.lastTest ? (
                    <span title={s.lastTest.title} className="inline-block max-w-[14rem] truncate whitespace-nowrap align-middle text-[12.5px] text-ink-2">
                      <span className="font-mono tabular-nums text-ink">{s.lastTest.percent}%</span> · {s.lastTest.title}
                    </span>
                  ) : "—"}
                </td>
                <td data-label="Below target" className="px-4 py-3 text-right font-mono">
                  {s.belowTarget ? (
                    <span className="whitespace-nowrap rounded-full bg-danger-dim px-2 py-0.5 text-[12px] font-semibold text-danger">
                      {s.belowTarget} {s.belowTarget === 1 ? "topic" : "topics"}
                    </span>
                  ) : "—"}
                </td>
                <td data-label="Weakest" className="px-4 py-3 narrow:max-xl:hidden">
                  {s.weak ? (
                    <span title={s.weak} className="inline-block max-w-[14rem] truncate whitespace-nowrap rounded-full bg-danger-dim px-2 py-0.5 align-middle text-[12px] font-medium text-danger">{s.weak}</span>
                  ) : "—"}
                </td>
                <td data-label="Strongest" data-phone="hide" className="px-4 py-3 max-xl:hidden">
                  {s.strong ? (
                    <span title={s.strong} className="inline-block max-w-[14rem] truncate whitespace-nowrap rounded-full bg-success-dim px-2 py-0.5 align-middle text-[12px] font-medium text-success">{s.strong}</span>
                  ) : "—"}
                </td>
                <td data-label="Flags" data-phone={s.flags ? undefined : "hide"} className="px-4 py-3 text-right font-mono">
                  {s.flags ? <span className="whitespace-nowrap rounded-full bg-warning-dim px-2 py-0.5 text-[12px] font-semibold text-warning">{s.flags}</span> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </section>
    </div>
  );
};
