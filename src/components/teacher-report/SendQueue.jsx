import { useMemo, useState } from "react";
import { WhatsAppText } from "@/components/common/WhatsAppText";
import { ChevronDown, Copy, ExternalLink, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ParentContactBody } from "@/components/guardian/ParentContact";
import { inputClass } from "@/components/common";
import { markReportExported } from "@/api/reports";
import { useApp } from "@/context/useApp";
import { useToast } from "@/context/useToast";
import { useReportData } from "@/hooks/useAnalytics";
import { useGuardian } from "@/hooks/useGuardian";
import { cn } from "@/lib/cn";
import { toWaLink } from "@/lib/contact";
import { COMMENT_MAX, REPORT_SECTIONS, buildReport } from "@/lib/report";
import { SHARE_NOTICE, SKIP_REASONS, doneLabel, loadQueue, progressLabel, queueRowState, saveQueue } from "@/lib/shareQueue";
import { buildSummaryText } from "@/lib/summary";

const ALL_SECTIONS = Object.fromEntries(REPORT_SECTIONS.map((s) => [s.id, true]));

const Row = ({ item, request, style, teacherName, done, onDone }) => {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const params = { studentId: item.studentId, preset: request.preset, period: request.period, from: request.from, to: request.to, testId: request.testId, subjectId: "" };
  const { data, error } = useReportData(params);
  const { data: guardian } = useGuardian(item.studentId);

  const built = useMemo(() => {
    if (!data || !guardian) return null;
    const report = buildReport({
      student: data.student,
      preset: request.preset,
      period: request.preset === "test" ? null : { key: request.period, from: request.from, to: request.to },
      subjectName: data.subjectName,
      rows: data.rows,
      topics: data.topics,
      questions: data.questions,
      excluded: data.excluded,
      options: { sections: ALL_SECTIONS, comment: note, language: style.language === "both" ? "en" : style.language },
      now: item.generatedAt,
    });
    return buildSummaryText(report, style, { parentName: guardian.name, teacherName });
  }, [data, guardian, note, request, style, teacherName, item.generatedAt]);

  const state = queueRowState({ phone: guardian?.phone, built });
  const record = async (how) => {
    onDone(item.reportId, { at: Date.now(), how });
    try {
      await markReportExported(item.reportId, how === "copied" ? "copy" : "whatsapp");
    } catch {
      toast.push("Couldn't record this in the audit log", "error");
    }
  };
  const openWhatsApp = () => {
    window.open(toWaLink(guardian.phone, built.text), "_blank", "noopener"); // must run inside the click
    record("opened");
  };
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(built.text);
      toast.push("Message copied. Paste it into WhatsApp.", "success");
      record("copied");
    } catch {
      toast.push("Couldn't copy. Select the text in the preview and copy it.", "error");
      setOpen(true);
    }
  };

  const name = data?.student?.name;
  const finished = doneLabel(done);
  return (
    <li className="border-b border-rule last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0 flex-1 basis-48">
          <div className="truncate text-[14px] font-medium text-ink" dir="auto">{name ?? (error ? "Couldn't load" : "Loading…")}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3">
            <span dir="auto">{guardian?.name || (guardian ? "No parent name" : "")}</span>
            {guardian?.masked && <span dir="ltr">{guardian.masked}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {finished && <span role="status" className="text-[12.5px] font-medium text-success">{finished}</span>}
          {state === "ready" && <Button type="button" size="sm" variant={finished ? "outline" : "default"} onClick={openWhatsApp}><ExternalLink size={13} />{finished ? "Open again" : "Open WhatsApp"}</Button>}
          {state === "too-long" && <Button type="button" size="sm" variant="outline" onClick={copyText}><Copy size={13} />Copy text</Button>}
          {state === "no-number" && <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}><UserPlus size={13} />Add number</Button>}
          <Button type="button" size="sm" variant="ghost" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} message for ${name ?? "student"}`} onClick={() => setOpen((v) => !v)}>
            <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        </div>
      </div>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          {state === "no-number" && (
            <div className="rounded-[var(--radius-control)] border border-rule bg-raised p-3">
              <ParentContactBody studentId={item.studentId} />
            </div>
          )}
          {built && (
            <>
              <WhatsAppText text={built.text} className="rounded-[var(--radius-control)] border border-rule bg-surface px-4 py-3 text-[13px] leading-relaxed text-ink [overflow-wrap:anywhere]" />
              {state === "too-long" && <p className="text-[12px] text-warning">Too long for a WhatsApp link even after trimming. Copy it and paste it into WhatsApp.</p>}
              <label className="block text-[12.5px] font-medium text-ink-2">
                Add a note for this parent (optional)
                <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={COMMENT_MAX} rows={2} dir="auto" className={cn(inputClass, "mt-1.5 h-auto py-2")} />
              </label>
            </>
          )}
        </div>
      )}
    </li>
  );
};

/** One row per student: open each message in WhatsApp yourself. `batch` = POST /reports/batch result. */
export const SendQueue = ({ batch, request, names = {} }) => {
  const { user } = useApp();
  const style = batch.style;
  const [done, setDone] = useState(() => loadQueue()?.done ?? {}); // reportId → { at, how }
  const count = batch.reports.filter((r) => done[r.reportId]).length;
  const mark = (id, entry) => {
    const next = { ...done, [id]: entry };
    setDone(next);
    saveQueue({ batch: { reports: batch.reports, skipped: batch.skipped }, request, done: next });
  };
  return (
    <div>
      <div role="status" aria-live="polite" className="mb-3 text-[14px] font-semibold text-ink">{progressLabel(batch.reports.length, count)}</div>
      <ul className="overflow-hidden rounded-[var(--radius-container)] border border-rule bg-surface shadow-[var(--shadow-card)]">
        {batch.reports.map((r) => (
          <Row key={r.reportId} item={r} request={request} style={style} teacherName={user?.name} done={done[r.reportId]} onDone={mark} />
        ))}
      </ul>
      {batch.skipped.length > 0 && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
          Left out: {batch.skipped.map((s) => `${names[s.studentId] ?? "A student"} (${SKIP_REASONS[s.reason] ?? "nothing to report"})`).join("; ")}.
        </p>
      )}
      <p className="mt-4 max-w-[640px] text-[12.5px] leading-relaxed text-ink-3">{SHARE_NOTICE}</p>
    </div>
  );
};
