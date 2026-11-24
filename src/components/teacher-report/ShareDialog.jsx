import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { MessageCircle, Printer } from "lucide-react";
import { ModalShell } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createReportBatch } from "@/api/reports";
import { useToast } from "@/context/useToast";
import { useClassAnalytics } from "@/hooks/useAnalytics";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useProfile } from "@/hooks/useProfile";
import { DEFAULT_REPORT_OPTIONS, PERIOD_PRESETS, REPORT_PRESETS, resolvePeriod } from "@/lib/report";
import { QUEUE_MAX, SHARE_PERIODS, resolveAudience, saveQueue, validateShare } from "@/lib/shareQueue";
import { normalizeSummaryPrefs } from "@/lib/summary";

const Label = ({ children }) => <div className="mb-1.5 text-[12.5px] font-semibold text-ink-2">{children}</div>;

/**
 * "Share report": who, which report, then Save PDF (the report builder, one student after another) or
 * Send on WhatsApp (the queue). Opened from a student page (that student), from the class table (the
 * ticked rows, or the whole class). Nothing is sent by Vellum.
 */
export const ShareDialog = ({ open, onClose, classId, subjectId, studentId = null, selectedIds = [] }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const { data } = useClassAnalytics({ classId, subjectId });
  const { data: profile } = useProfile();
  const [options, setOptions] = usePersistentState("vellum.report.options", DEFAULT_REPORT_OPTIONS);
  const classIds = useMemo(() => (data?.students ?? []).map((s) => s.id), [data]);
  const picked = selectedIds.filter((id) => classIds.includes(id));
  const [audience, setAudience] = useState(studentId ? "student" : picked.length ? "selected" : "class");
  const [preset, setPreset] = useState(options.preset === "test" ? "test" : "weekly");
  const [period, setPeriod] = useState(SHARE_PERIODS.includes(options.period) ? options.period : "last7");
  const [testPick, setTestPick] = useState("");
  const [busy, setBusy] = useState(false);

  const tests = [...(data?.trend ?? [])].reverse(); // newest first
  const testId = tests.some((t) => t.testId === testPick) ? testPick : (tests[0]?.testId ?? "");
  const ids = resolveAudience({ audience, studentId, selectedIds: picked, classIds });
  const problem = validateShare({ ids, preset, period, testId });
  const audiences = [
    studentId && { id: "student", label: "This student" },
    { id: "selected", label: `Selected students (${picked.length})`, disabled: picked.length === 0 },
    { id: "class", label: `Whole class (${classIds.length})`, disabled: classIds.length === 0 },
  ].filter(Boolean);

  const savePdf = () => {
    if (problem) return;
    setOptions({ ...options, preset, period: preset === "weekly" ? period : options.period, subject: "" });
    onClose();
    navigate(`/teacher/analytics/${encodeURIComponent(ids[0])}/report`, { state: { order: ids } });
  };

  const sendOnWhatsApp = async () => {
    if (problem) return;
    setBusy(true);
    try {
      const span = preset === "weekly" ? resolvePeriod(period) : null;
      const language = normalizeSummaryPrefs(profile?.prefs?.parentSummary).language;
      const batch = await createReportBatch({ studentIds: ids, preset, period, from: span?.from, to: span?.to, testId: preset === "test" ? testId : "", language });
      if (batch.reports.length === 0) {
        toast.push("None of these students has confirmed marks for this choice", "info");
        return;
      }
      onClose();
      saveQueue({ batch, request: { preset, period, from: span?.from, to: span?.to, testId: preset === "test" ? testId : "" }, done: {} });
      navigate("/teacher/analytics/share");
    } catch (err) {
      toast.push(err?.message || "Couldn't prepare the reports", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Share report"
      maxWidth="520px"
      footer={
        <>
          <Button type="button" variant="outline" disabled={!!problem || busy} onClick={savePdf}><Printer size={14} />Save PDF</Button>
          <Button type="button" disabled={!!problem || busy} onClick={sendOnWhatsApp}><MessageCircle size={14} />Send on WhatsApp</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>Who</Label>
          <div role="radiogroup" aria-label="Who" className="space-y-1">
            {audiences.map((a) => (
              <label key={a.id} className="flex min-h-9 items-center gap-2 text-[14px] text-ink pointer-coarse:min-h-11">
                <input type="radio" name="share-audience" checked={audience === a.id} disabled={a.disabled} onChange={() => setAudience(a.id)} className="size-4 accent-[var(--color-primary)]" />
                <span className={a.disabled ? "text-ink-3" : ""}>{a.label}</span>
              </label>
            ))}
          </div>
          {ids.length > QUEUE_MAX && <p role="alert" className="mt-1 text-[12px] text-danger">Up to {QUEUE_MAX} students at a time: tick fewer rows.</p>}
        </div>
        <div>
          <Label>Report type</Label>
          <div className="flex gap-2" role="group" aria-label="Report type">
            {REPORT_PRESETS.map((p) => (
              <Button key={p.id} type="button" size="sm" variant={preset === p.id ? "default" : "outline"} aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</Button>
            ))}
          </div>
        </div>
        {preset === "weekly" ? (
          <div>
            <Label>Period</Label>
            <Select aria-label="Period" value={period} onChange={setPeriod} options={PERIOD_PRESETS.filter((p) => SHARE_PERIODS.includes(p.id)).map((p) => ({ value: p.id, label: p.label }))} />
          </div>
        ) : (
          <div>
            <Label>Test</Label>
            {tests.length === 0 ? (
              <p className="text-[13px] text-ink-3">No marked tests in this class and subject yet.</p>
            ) : (
              <Select aria-label="Test" value={testId} onChange={setTestPick} options={tests.map((t) => ({ value: t.testId, label: t.label }))} />
            )}
          </div>
        )}
        <p className="text-[12px] leading-relaxed text-ink-3">
          A report uses confirmed, released marks only. Students with nothing to report are left out. <Link to="/teacher/profile" onClick={onClose} className="underline underline-offset-2">Change the message wording</Link>
        </p>
      </div>
    </ModalShell>
  );
};
