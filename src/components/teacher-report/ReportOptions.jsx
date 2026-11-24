import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { inputClass } from "@/components/common";
import { COMMENT_MAX, PERIOD_PRESETS, REPORT_PRESETS, REPORT_SECTIONS } from "@/lib/report";
import { COMMENT_PHRASES, REPORT_LANGUAGES, addPhrase } from "@/lib/reportLabels";
import { formatDateTime } from "@/lib/time";

const Label = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-semibold text-ink-2">{children}</label>
);

/**
 * The controls beside the sheet. Everything here is a plain value the page owns:
 * options (kept between visits), the one-test choice, custom dates and the comment.
 */
export const ReportOptions = ({ options, onOptions, subjects, tests, testId, onTestId, customFrom, customTo, onCustom, comment, onComment, drafted, onDraft, canDraft, rangeProblem }) => {
  const set = (patch) => onOptions({ ...options, ...patch });
  const isTest = options.preset === "test";
  return (
    <div className="no-print space-y-5">
      <div>
        <Label>Report type</Label>
        <div className="flex gap-2" role="group" aria-label="Report type">
          {REPORT_PRESETS.map((p) => (
            <Button key={p.id} type="button" size="sm" variant={options.preset === p.id ? "default" : "outline"} aria-pressed={options.preset === p.id} onClick={() => set({ preset: p.id })}>
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label>Report language</Label>
        <Select aria-label="Report language" value={options.language ?? "en"} onChange={(v) => set({ language: v })} options={REPORT_LANGUAGES.map((l) => ({ value: l.id, label: l.label }))} />
        {options.language && options.language !== "en" && <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">Headings and labels change language. Names, topics and feedback print as they were typed. Have an Urdu-speaking teacher check the wording once.</p>}
      </div>

      <div>
        <Label>Subject</Label>
        <Select aria-label="Subject" value={options.subject} onChange={(v) => set({ subject: v })} options={[{ value: "", label: "All subjects" }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]} />
      </div>

      {isTest ? (
        <div>
          <Label>Test</Label>
          {tests.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">No confirmed test results for this student yet.</p>
          ) : (
            <Select aria-label="Test" value={testId} onChange={onTestId} options={tests.map((t) => ({ value: t.testId, label: `${t.test} · ${formatDateTime(t.at)}` }))} />
          )}
        </div>
      ) : (
        <div>
          <Label>Period</Label>
          <Select aria-label="Period" value={options.period} onChange={(v) => set({ period: v })} options={PERIOD_PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
          {options.period === "custom" && (
            <div className="mt-2 flex items-center gap-2">
              <input type="date" aria-label="From date" value={customFrom} max={customTo || undefined} onChange={(e) => onCustom({ from: e.target.value, to: customTo })} className={inputClass} />
              <span className="text-ink-3">–</span>
              <input type="date" aria-label="To date" value={customTo} min={customFrom || undefined} onChange={(e) => onCustom({ from: customFrom, to: e.target.value })} className={inputClass} />
            </div>
          )}
          {rangeProblem && <p role="alert" className="mt-1.5 text-[12.5px] text-danger">{rangeProblem}</p>}
        </div>
      )}

      <fieldset>
        <legend className="mb-1.5 text-[12.5px] font-semibold text-ink-2">Sections</legend>
        <div className="grid gap-1.5">
          {REPORT_SECTIONS.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={options.sections[s.id] !== false}
                onChange={(e) => set({ sections: { ...options.sections, [s.id]: e.target.checked } })}
                className="size-4 cursor-pointer accent-[var(--color-primary)]"
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>

      {options.sections.comment !== false && (
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <Label htmlFor="report-comment">Your comment</Label>
            <Button type="button" variant="ghost" size="sm" onClick={onDraft} disabled={!canDraft}>
              <Sparkles size={13} />
              Draft comment
            </Button>
          </div>
          <textarea
            id="report-comment"
            dir="auto"
            rows={5}
            maxLength={COMMENT_MAX}
            value={comment}
            onChange={(e) => onComment(e.target.value)}
            placeholder="Write in English or Urdu. It is printed as you type it and is not stored."
            className={`${inputClass} min-h-28 resize-y leading-relaxed`}
          />
          <details className="mt-2 rounded-md border border-rule-2 px-3 py-2">
            <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-2">Quick phrases (no keyboard needed)</summary>
            <ul className="mt-2 space-y-2">
              {COMMENT_PHRASES.map((ph) => (
                <li key={ph.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-2">
                  <span className="min-w-0 flex-1">{ph.en}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => onComment(addPhrase(comment, ph, "en", COMMENT_MAX))}>English</Button>
                  <Button type="button" variant="outline" size="sm" lang="ur" onClick={() => onComment(addPhrase(comment, ph, "ur", COMMENT_MAX))}>اردو</Button>
                </li>
              ))}
            </ul>
          </details>
          <div className="mt-1 flex items-center justify-between gap-2 text-[12px] text-ink-3">
            <span>{drafted ? "Draft — edit before sharing" : "\u00A0"}</span>
            <span className="font-mono tabular-nums">{comment.length}/{COMMENT_MAX}</span>
          </div>
        </div>
      )}
    </div>
  );
};
