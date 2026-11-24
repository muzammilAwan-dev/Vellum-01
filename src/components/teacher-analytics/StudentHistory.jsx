import { useState } from "react";
import { Download } from "lucide-react";
import { EmptyState, PageError, SectionHeader, SkeletonCard, StatusDot, TableShell, Td, Th, inputClass } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useStudentHistory } from "@/hooks/useAnalytics";
import { downloadCsv } from "@/lib/csv";
import { dayEndMs, dayStartMs, formatDuration, TREND_LABEL } from "@/lib/studentHistory";
import { formatDateTime } from "@/lib/time";

const verdict = (p) => (p >= 80 ? ["success", "Strong"] : p >= 65 ? ["warning", "Solid"] : ["danger", "Needs work"]);
const FLAG_STYLE = { high: "bg-danger-dim text-danger", medium: "bg-warning-dim text-warning", low: "bg-raised text-ink-3" };
const TREND_TONE = { up: "text-success", down: "text-danger", steady: "text-ink-2" };

const FlagChips = ({ flags }) => {
  const shown = ["high", "medium", "low"].filter((k) => flags[k] > 0);
  if (!shown.length) return "—";
  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      {shown.map((k) => (
        <span key={k} className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold ${FLAG_STYLE[k]}`}>
          {flags[k]} {k}
        </span>
      ))}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════
// TEST HISTORY — every submitted test of one student, all subjects
// (GET /analytics/students/:id/history). Filters run on the server;
// tests still being marked are listed but never counted in averages.
// ═══════════════════════════════════════════════════════════════
export const StudentHistory = ({ studentId, studentName }) => {
  const [subject, setSubject] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading, error, refetch } = useStudentHistory(studentId, {
    subject,
    from: dayStartMs(from),
    to: dayEndMs(to),
  });
  // Keep the subject list while a filtered request is loading (the options would otherwise blink out).
  const [subjects, setSubjects] = useState([]);
  if (data && data.subjects !== subjects) setSubjects(data.subjects);
  const dirty = Boolean(subject || from || to);
  const clear = () => {
    setSubject("");
    setFrom("");
    setTo("");
  };

  const exportCsv = () =>
    downloadCsv(
      `history-${studentName}.csv`.replace(/\s+/g, "-").toLowerCase(),
      ["Test", "Subject", "Submitted", "Status", "Marks", "Out of", "Percent", "Class average %", "Minutes taken", "Submitted by", "High flags", "Medium flags", "Low flags"],
      data.rows.map((r) => [
        r.test,
        r.subject,
        new Date(r.at).toISOString(),
        r.status === "final" ? "Final" : "Awaiting marks",
        r.marks ?? "",
        r.max,
        r.percent ?? "",
        r.classAverage ?? "",
        r.timeTakenSec == null ? "" : Math.round((r.timeTakenSec / 60) * 10) / 10,
        r.submitReason ?? "",
        r.flags.high,
        r.flags.medium,
        r.flags.low,
      ]),
    );

  const summary = data?.summary;
  return (
    <section className="mb-14" aria-labelledby="history-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div id="history-heading">
          <SectionHeader label="Test history · all subjects" />
        </div>
        <Button variant="outline" size="sm" className="no-print mb-3" onClick={exportCsv} disabled={!data || data.rows.length === 0}>
          <Download size={13} />
          Export CSV
        </Button>
      </div>

      <div className="no-print mb-4 grid gap-3 narrow:grid-cols-2 tablet:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Select
          aria-label="Subject"
          value={subject}
          onChange={setSubject}
          options={[{ value: "", label: "All subjects" }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <div className="flex items-center gap-2">
          <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          <span className="text-ink-3">–</span>
          <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </div>
        <Button variant="ghost" onClick={clear} disabled={!dirty}>
          Clear
        </Button>
      </div>

      {error ? (
        <PageError error={error} onRetry={refetch} />
      ) : isLoading || !data ? (
        <SkeletonCard />
      ) : data.rows.length === 0 ? (
        <EmptyState
          title={dirty ? "No tests match these filters" : "No submitted tests yet"}
          body={dirty ? "Try another subject or a wider date range." : "Every test this student submits appears here, with its marks once they are final."}
          action={dirty ? "Clear filters" : undefined}
          onAction={dirty ? clear : undefined}
        />
      ) : (
        <>
          <p className="mb-3 text-[13px] leading-relaxed text-ink-2" aria-live="polite">
            {summary.count} {summary.count === 1 ? "test" : "tests"}
            {summary.final > 0 && (
              <>
                {" · average "}
                <span className="font-semibold text-ink">{summary.average}%</span>
                {" · best "}
                {summary.best}%{" · lowest "}
                {summary.lowest}%
              </>
            )}
            {summary.trend && (
              <>
                {" · "}
                <span className={`font-semibold ${TREND_TONE[summary.trend]}`}>{TREND_LABEL[summary.trend]}</span>
              </>
            )}
            {summary.pending > 0 && <span className="text-ink-3">{` · ${summary.pending} still being marked, not counted`}</span>}
          </p>
          <TableShell>
            <thead>
              <tr className="border-b border-rule-2">
                <Th>Test</Th>
                <Th className="max-tablet:hidden">Subject</Th>
                <Th className="max-narrow:hidden">Date</Th>
                <Th className="text-right">Score</Th>
                <Th className="text-right max-tablet:hidden">Class avg</Th>
                <Th className="text-right max-tablet:hidden">Time</Th>
                <Th className="text-right">Flags</Th>
                <Th>Result</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const [tone, label] = r.status === "pending" ? ["warning", "Awaiting marks"] : verdict(r.percent);
                return (
                  <tr key={r.id} className="border-b border-rule transition-colors last:border-b-0 hover:bg-raised/50">
                    <Td className="text-[13.5px] font-medium text-ink">
                      {r.test}
                      <span className="block text-[12px] font-normal text-ink-3 tablet:hidden">{r.subject}</span>
                    </Td>
                    <Td className="max-tablet:hidden">{r.subject}</Td>
                    <Td className="whitespace-nowrap font-mono text-[12px] max-narrow:hidden">{formatDateTime(r.at)}</Td>
                    <Td className="whitespace-nowrap text-right font-mono tabular-nums text-ink">
                      {r.status === "pending" ? "—" : `${r.marks} / ${r.max}`}
                      {r.percent != null && <span className="ml-1.5 text-ink-3">{r.percent}%</span>}
                    </Td>
                    <Td className="text-right font-mono tabular-nums max-tablet:hidden">{r.classAverage != null ? `${r.classAverage}%` : "—"}</Td>
                    <Td className="whitespace-nowrap text-right font-mono tabular-nums max-tablet:hidden">{formatDuration(r.timeTakenSec)}</Td>
                    <Td className="text-right font-mono">
                      <FlagChips flags={r.flags} />
                    </Td>
                    <Td>
                      <StatusDot tone={tone}>{label}</StatusDot>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        </>
      )}
    </section>
  );
};
