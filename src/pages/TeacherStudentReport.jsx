import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft, ArrowRight, Printer } from "lucide-react";
import { EmptyState, PageError, PageHeader, PageLoading, Scope } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ReportOptions } from "@/components/teacher-report/ReportOptions";
import { ReportSheet } from "@/components/teacher-report/ReportSheet";
import { createReport, markReportExported } from "@/api/reports";
import { useApp } from "@/context/useApp";
import { useToast } from "@/context/useToast";
import { useReportData, useStudentHistory } from "@/hooks/useAnalytics";
import { useInstitution } from "@/hooks/useInstitution";
import { usePersistentState } from "@/hooks/usePersistentState";
import { DEFAULT_REPORT_OPTIONS, buildReport, draftComment, reportContentHash, reportFileName, resolvePeriod } from "@/lib/report";
import { dayEndMs, dayStartMs } from "@/lib/studentHistory";

// ═══════════════════════════════════════════════════════════════
// /teacher/analytics/:studentId/report — build one student's report and save it as a PDF
// (the browser's print dialog: "Save as PDF" keeps Urdu and English text exactly as shown).
// ═══════════════════════════════════════════════════════════════
const Report = ({ studentId }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user } = useApp();
  const { data: institution } = useInstitution();
  const [options, setOptions] = usePersistentState("vellum.report.options", DEFAULT_REPORT_OPTIONS);
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [pickedTest, setPickedTest] = useState("");
  const [comment, setComment] = useState("");
  const [drafted, setDrafted] = useState(false);
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(Date.now);

  const isTest = options.preset === "test";
  const period = useMemo(() => resolvePeriod(options.period, { from: dayStartMs(custom.from), to: dayEndMs(custom.to) }, now), [options.period, custom.from, custom.to, now]);
  const rangeProblem = !isTest && options.period === "custom" && !period && (custom.from || custom.to) ? "Pick a start and an end date, start first." : "";

  // The tests that can be reported on one by one (only final results; the server also checks release).
  const history = useStudentHistory(studentId, { subject: options.subject });
  const finalTests = useMemo(() => (history.data?.rows ?? []).filter((r) => r.status === "final"), [history.data]);
  const testId = finalTests.some((t) => t.testId === pickedTest) ? pickedTest : (finalTests[0]?.testId ?? "");

  const params = isTest
    ? testId ? { studentId, preset: "test", testId, subjectId: options.subject } : null
    : period ? { studentId, preset: "weekly", period: options.period, from: period.from, to: period.to, subjectId: options.subject } : null;
  const { data, isLoading, error, refetch } = useReportData(params);

  const report = useMemo(
    () =>
      data
        ? buildReport({
            student: data.student,
            institution: institution ? { name: institution.name, shortName: institution.shortName, city: institution.city, logo: institution.logo } : null,
            preset: options.preset,
            period: isTest ? null : { key: options.period, from: period.from, to: period.to },
            subjectName: data.subjectName,
            rows: data.rows,
            topics: data.topics,
            questions: data.questions,
            excluded: data.excluded,
            options: { sections: options.sections, comment, language: options.language },
            now: issued?.generatedAt ?? now,
          })
        : null,
    [data, institution, options, isTest, period, comment, issued, now],
  );
  const hash = useMemo(() => (report ? reportContentHash(report) : null), [report]);

  const order = location.state?.order ?? [];
  const nextId = order[order.indexOf(studentId) + 1];

  const savePdf = async () => {
    if (!report || report.empty) return;
    setBusy(true);
    try {
      const made = await createReport({ ...params, options: { sections: options.sections, comment, language: options.language } });
      flushSync(() => setIssued({ id: made.id, contentHash: made.contentHash, generatedAt: made.generatedAt })); // the footer now carries the report id
      const before = document.title;
      document.title = reportFileName(report).replace(/\.pdf$/, "");
      window.addEventListener("afterprint", () => (document.title = before), { once: true });
      window.print();
      await markReportExported(made.id, "pdf");
      toast.push("In the print window choose “Save as PDF” (not Microsoft Print to PDF) and turn off Headers and footers", "info");
    } catch (err) {
      toast.push(err?.message || "Couldn't prepare the report", "error");
    } finally {
      setBusy(false);
    }
  };

  const back = () => navigate(`/teacher/analytics/${encodeURIComponent(studentId)}`, { state: location.state });
  const notice = data && (data.excluded.pending > 0 || data.excluded.unreleased > 0);

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 tablet:px-8 tablet:py-8">
      <PageHeader
        className="no-print"
        crumbs={[{ label: <Scope /> }, { label: "Analytics", to: "/teacher/analytics" }, { label: data?.student?.name ?? "Student", to: `/teacher/analytics/${encodeURIComponent(studentId)}` }, { label: "Parent report" }]}
        title={data?.student?.name ? `Parent report: ${data.student.name}` : "Parent report"}
        intro="Choose what the report covers, check the preview, then save it as a PDF to send."
        actions={
          <>
            <Button variant="ghost" onClick={back}><ArrowLeft size={14} aria-hidden="true" />Back to student</Button>
            {nextId && (
              <Button variant="outline" onClick={() => navigate(`/teacher/analytics/${encodeURIComponent(nextId)}/report`, { state: location.state })}>
                Next student<ArrowRight size={14} aria-hidden="true" />
              </Button>
            )}
            <Button onClick={savePdf} disabled={!report || report.empty || busy}><Printer size={14} aria-hidden="true" />Save PDF</Button>
          </>
        }
      />
      {report?.empty && (
        // Say why "Save PDF" is off, and offer the fix in one tap.
        <p role="status" className="no-print mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-control)] border border-warning/30 bg-warning-dim px-4 py-2.5 text-[13px] font-medium text-warning">
          Nothing to report for this choice yet, so there is no PDF to save.
          {!isTest && options.period !== "thisMonth" && (
            <Button size="sm" variant="outline" onClick={() => setOptions({ ...options, period: "thisMonth" })}>Show this month</Button>
          )}
          {!isTest && finalTests.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setOptions({ ...options, preset: "test" })}>Report on one test</Button>
          )}
        </p>
      )}

      <div className="grid gap-6 print:block lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <aside className="no-print" aria-label="Report options">
          <h2 className="mb-4 text-[14px] font-semibold text-ink">What the report covers</h2>
          <ReportOptions
            options={options}
            onOptions={setOptions}
            subjects={data?.subjects ?? history.data?.subjects ?? []}
            tests={finalTests}
            testId={testId}
            onTestId={setPickedTest}
            customFrom={custom.from}
            customTo={custom.to}
            onCustom={setCustom}
            comment={comment}
            onComment={(v) => { setComment(v); setDrafted(false); }}
            drafted={drafted}
            canDraft={Boolean(report && !report.empty)}
            onDraft={() => { setComment(draftComment(report, options.language === "ur" ? "ur" : "en")); setDrafted(true); }}
            rangeProblem={rangeProblem}
          />
        </aside>

        <div className="min-w-0">
          {notice && (
            <p className="no-print mb-3 rounded-md border border-rule-2 bg-raised px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">
              Left out: {data.excluded.pending > 0 && `${data.excluded.pending} ${data.excluded.pending === 1 ? "test" : "tests"} still being marked`}
              {data.excluded.pending > 0 && data.excluded.unreleased > 0 && " and "}
              {data.excluded.unreleased > 0 && `${data.excluded.unreleased} ${data.excluded.unreleased === 1 ? "result" : "results"} not released to the student yet`}. A report shows confirmed, released marks only.
            </p>
          )}
          {error ? (
            <PageError error={error} onRetry={refetch} />
          ) : !params ? (
            <EmptyState title={isTest ? "No test to report on" : "Choose a period"} body={isTest ? "Pick a test once this student has a confirmed result." : "Pick the dates the report should cover."} />
          ) : isLoading || !report ? (
            <PageLoading />
          ) : (
            <ReportSheet report={report} hash={hash} issued={issued} teacher={user?.name} />
          )}
        </div>
      </div>
    </div>
  );
};

// A new student starts with an empty comment and no saved report.
const TeacherStudentReport = () => {
  const { studentId } = useParams();
  return <Report key={studentId} studentId={studentId} />;
};

export default TeacherStudentReport;
