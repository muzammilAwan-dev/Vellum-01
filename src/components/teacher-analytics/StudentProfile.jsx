import { useState } from "react";
import { Download, FileText, Send, TrendingUp, Users, Target } from "lucide-react";
import { Bento, EmptyState, MetricCard, PageError, PageLoading, PrintHeader, SectionHeader, Scope } from "@/components/common";
import { SmallMultiple } from "@/components/common/charts/SmallMultiple";
import { Trend } from "@/components/common/charts/Trend";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/useApp";
import { useStudentAnalytics } from "@/hooks/useAnalytics";
import { useInstitution } from "@/hooks/useInstitution";
import { ShareDialog } from "@/components/teacher-report/ShareDialog";
import { ParentContactCard } from "@/components/guardian/ParentContact";
import { StudentHistory } from "./StudentHistory";

// ═══════════════════════════════════════════════════════════════
// STUDENT PROFILE — one student within the chosen class + subject
// (GET /analytics/students/:id), from fully graded attempts.
// ═══════════════════════════════════════════════════════════════
export const StudentProfile = ({ studentId, onBack, onReport }) => {
  const { activeClassObj, activeSubject, scopeLoading } = useApp();
  const { data: institution } = useInstitution();
  const [sharing, setSharing] = useState(false);
  const { data, isLoading, error, refetch } = useStudentAnalytics(studentId, {
    classId: activeClassObj?.id,
    subjectId: activeSubject?.id,
  });

  if (scopeLoading || (isLoading && activeClassObj && activeSubject)) return <PageLoading />;
  if (!activeClassObj || !activeSubject) {
    return <EmptyState title="Choose a class and subject" body="Pick them in the sidebar to see this student." action="Back to analytics" onAction={onBack} />;
  }
  if (error?.status === 404) {
    return <EmptyState title="Student not found" body="They may be in a different class or subject than the one selected." action="Back to analytics" onAction={onBack} />;
  }
  if (error) return <PageError error={error} onRetry={refetch} />;

  const { student, trend, topics, summary } = data;
  const last = trend[trend.length - 1];
  const sentence = last
    ? `Overall ${summary.average}% across ${summary.tests} ${summary.tests === 1 ? "test" : "tests"}.${
        summary.weakest ? ` Strongest in ${summary.strongest.name}. Needs work on ${summary.weakest.name}.` : ""
      }`
    : "No fully graded tests yet for this student.";

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <PrintHeader institution={institution} title={`Student report · ${student.name}`} />
      <Button onClick={onBack} variant="ghost" size="sm" className="no-print mb-3">
        ← Back to analytics
      </Button>

      <div className="mb-5 flex items-center gap-2 text-[13px] font-medium text-ink-3">
        <Scope /> <span className="text-ink-3">/</span> Students <span className="text-ink-3">/</span> {student.name}
      </div>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-[28px] font-semibold tablet:text-[34px] leading-[1.1] tracking-[-0.02em] text-ink">
            {student.name} <span className="text-ink-3">· {student.cls}</span>
          </h1>
          <p className="mt-2 max-w-[680px] text-[14px] leading-relaxed text-ink-2">{sentence}</p>
          {summary.awaiting > 0 && (
            <p className="mt-1 text-[13px] text-ink-3">
              {summary.awaiting === 1 ? "1 attempt is" : `${summary.awaiting} attempts are`} still being marked and isn't counted yet.
            </p>
          )}
        </div>
        <div className="no-print flex shrink-0 flex-wrap gap-2">
          {onReport && (
            <Button onClick={onReport}>
              <FileText size={13} />
              Make parent report
            </Button>
          )}
          <Button onClick={() => setSharing(true)} variant="outline">
            <Send size={13} />
            Share report
          </Button>
          <Button onClick={() => window.print()} variant="outline">
            <Download size={13} />
            Print / save as PDF
          </Button>
        </div>
      </div>

      {!last ? (
        <EmptyState title="No graded tests yet" body="Their scores and topic profile appear once an attempt is fully marked." />
      ) : (
        <>
          <div className="bento mb-14">
            <MetricCard
              variant="featured"
              span="sm:col-span-2"
              icon={TrendingUp}
              iconTone="primary"
              label="Overall"
              value={summary.average}
              unit="%"
              delta={`Class avg ${last.class}%`}
              deltaTone={summary.aheadOfClass >= 0 ? "success" : "danger"}
            />
            <MetricCard
              icon={Users}
              iconTone="neutral"
              label="Tests counted"
              value={summary.tests}
              delta={summary.awaiting > 0 ? `${summary.awaiting} awaiting marks` : "All marked"}
              deltaTone={summary.awaiting > 0 ? "warning" : "success"}
            />
            {summary.strongest && (
              <MetricCard
                icon={Target}
                iconTone="success"
                label="Strongest topic"
                value={<span className="text-[16px]">{summary.strongest.name}</span>}
                delta={`${summary.strongest.accuracy}% accuracy`}
                deltaTone="success"
              />
            )}
          </div>

          <section className="mb-14">
            <SectionHeader label={`Score trajectory · T1 → T${trend.length} · vs class average`} />
            <Bento>
              <div className="mb-1 text-[13px] font-semibold text-ink">Student (solid) · Class average (dashed)</div>
              <div className="mb-5 text-[13px] text-ink-3">
                {trend.length > 1
                  ? `Ahead of the class on ${summary.testsAhead} of ${trend.length} tests; ${
                      summary.aheadOfClass === 0 ? "level with it now"
                      : `${Math.abs(summary.aheadOfClass)} ${Math.abs(summary.aheadOfClass) === 1 ? "point" : "points"} ${summary.aheadOfClass > 0 ? "ahead" : "behind"} now`
                    }.`
                  : "First graded test."}
              </div>
              <Trend
                data={trend}
                focal={last.you}
                series={[
                  { key: "you", color: "var(--color-primary)", width: 2.4, label: student.name },
                  { key: "class", color: "var(--color-ink-3)", width: 1.4, dash: "4 4", label: "Class average" },
                ]}
              />
            </Bento>
          </section>

          <section className="mb-14">
            <SectionHeader label="Topic profile · accuracy per topic" />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-px overflow-hidden rounded-[var(--radius-container)] border border-rule bg-rule">
              {[...topics].sort((a, b) => a.accuracy - b.accuracy).map((t) => <SmallMultiple key={t.name} topic={t} />)}
            </div>
          </section>
        </>
      )}

      <ParentContactCard studentId={studentId} />
      {sharing && <ShareDialog open onClose={() => setSharing(false)} classId={activeClassObj.id} subjectId={activeSubject.id} studentId={studentId} />}

      <StudentHistory studentId={studentId} studentName={student.name} />
    </div>
  );
};
