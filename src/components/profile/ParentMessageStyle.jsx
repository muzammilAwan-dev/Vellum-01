import { useMemo, useState } from "react";
import { LoadingButton, inputClass } from "@/components/common";
import { useToast } from "@/context/useToast";
import { updateProfile } from "@/api/profile";
import { cn } from "@/lib/cn";
import { fitsWhatsApp } from "@/lib/contact";
import { DEFAULT_SUMMARY_PREFS, GREETING_MAX, SIGNOFF_MAX, SUMMARY_SECTIONS, SHORT_MAX, STANDARD_MAX, SUMMARY_LABELS, buildSummaryText, normalizeSummaryPrefs } from "@/lib/summary";
import { SAMPLE_CONTEXT, sampleReport } from "@/lib/summarySample";

const LANGS = [
  { id: "en", label: "English" },
  { id: "ur", label: "اردو" },
  { id: "both", label: "English + اردو" },
];
const LENGTHS = [
  { id: "short", label: "Short" },
  { id: "standard", label: "Standard" },
];

const Seg = ({ label, value, options, onChange }) => {
  const id = `seg-${label.replace(/\W/g, "")}`;
  return (
    <div className="mb-4">
      <div id={id} className="text-[13px] font-medium text-ink-2">{label}</div>
      <div role="group" aria-labelledby={id} className="mt-1.5 inline-flex flex-wrap rounded-[var(--radius-control)] border border-rule-2 bg-surface p-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            dir="auto"
            className={cn(
              "inline-flex min-h-9 items-center rounded-[calc(var(--radius-control)-2px)] px-3.5 text-[13px] font-semibold transition-colors pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
              value === o.id ? "bg-primary text-on-primary" : "text-ink-2 hover:bg-raised hover:text-ink",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
};

const Check = ({ checked, onChange, children }) => (
  <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[14px] text-ink pointer-coarse:min-h-11">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
    {children}
  </label>
);

/** Teacher only: how the WhatsApp message to parents is worded. Saved in prefs.parentSummary (PATCH /profile). */
export const ParentMessageStyle = ({ profile }) => {
  const toast = useToast();
  const saved = useMemo(() => normalizeSummaryPrefs(profile.prefs?.parentSummary), [profile.prefs]);
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const out = useMemo(() => buildSummaryText(sampleReport(draft.language), draft, SAMPLE_CONTEXT), [draft]);
  const cap = draft.length === "short" ? SHORT_MAX : STANDARD_MAX;
  const toggleSection = (id, on) => set({ sections: SUMMARY_SECTIONS.map((s) => s.id).filter((x) => (x === id ? on : draft.sections.includes(x))) });

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({ prefs: { parentSummary: draft } });
      toast.push("Parent message style saved", "success");
    } catch (err) {
      toast.push(err.message || "Couldn't save the style", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="parent-messages" className="mb-10">
      <h2 id="parent-messages" className="mb-1 text-[14px] font-semibold text-ink">Parent messages</h2>
      <p className="mb-4 text-[12px] leading-relaxed text-ink-3">
        How the WhatsApp message with a student's report is worded. It only ever uses confirmed marks, the student's own name and class, and your comment.
      </p>
      <div className="grid gap-6 tablet:grid-cols-2">
        <div>
          <Seg label="Language" value={draft.language} options={LANGS} onChange={(language) => set({ language })} />
          <Seg label="Length" value={draft.length} options={LENGTHS} onChange={(length) => set({ length })} />
          <fieldset className="mb-4">
            <legend className="mb-1 text-[13px] font-medium text-ink-2">Include</legend>
            {SUMMARY_SECTIONS.map((s) => (
              <Check key={s.id} checked={draft.sections.includes(s.id)} onChange={(on) => toggleSection(s.id, on)}>{s.label}</Check>
            ))}
            <Check checked={draft.emoji} onChange={(emoji) => set({ emoji })}>Small icons before each line</Check>
          </fieldset>
          <label className="mb-3 block text-[13px] font-medium text-ink-2">
            Greeting
            <input className={cn(inputClass, "mt-1.5")} dir="auto" maxLength={GREETING_MAX} value={draft.greeting} placeholder={SUMMARY_LABELS[draft.language === "ur" ? "ur" : "en"].greeting} onChange={(e) => set({ greeting: e.target.value })} />
          </label>
          <label className="mb-1 block text-[13px] font-medium text-ink-2">
            Closing words
            <input className={cn(inputClass, "mt-1.5")} dir="auto" maxLength={SIGNOFF_MAX} value={draft.signoff} placeholder={SUMMARY_LABELS[draft.language === "ur" ? "ur" : "en"].signoff} onChange={(e) => set({ signoff: e.target.value })} />
          </label>
          <p className="text-[12px] text-ink-3">Leave empty for the usual wording. Your name is added under the closing words.</p>
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-ink-2">Preview (a made-up student)</div>
          <pre dir="auto" className="min-h-40 whitespace-pre-wrap rounded-[var(--radius-control)] border border-rule bg-surface px-4 py-3 font-[inherit] text-[13px] leading-relaxed text-ink [overflow-wrap:anywhere]" aria-live="polite">
            {out.text}
          </pre>
          <p className={cn("mt-1.5 text-[12px]", out.fits && out.level === 0 ? "text-ink-3" : "text-warning")} role="status">
            {out.text.length} of {cap} characters
            {out.level > 0 && " · trimmed to fit: a long comment or Urdu text is cut first"}
            {!out.fits && " · too long for one WhatsApp link"}
            {out.fits && fitsWhatsApp(out.text) && out.level === 0 ? " · fits one WhatsApp link" : ""}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <LoadingButton type="button" loading={saving} disabled={!dirty} onClick={save}>Save style</LoadingButton>
        {dirty && !saving && <LoadingButton type="button" variant="ghost" onClick={() => setDraft(saved)}>Discard</LoadingButton>}
        {!saving && JSON.stringify(draft) !== JSON.stringify(DEFAULT_SUMMARY_PREFS) && (
          <LoadingButton type="button" variant="ghost" onClick={() => setDraft(normalizeSummaryPrefs(null))}>Use the defaults</LoadingButton>
        )}
      </div>
    </section>
  );
};
