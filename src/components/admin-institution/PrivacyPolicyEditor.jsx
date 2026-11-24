import { useState } from "react";
import { Link } from "react-router";
import { ExternalLink } from "lucide-react";
import { ConfirmDialog, LoadingButton, Notice, PageError, Segmented, inputClass } from "@/components/common";
import { SettingsSection } from "./InstitutionForm";
import { PolicyDocument } from "@/components/privacy/PolicyDocument";
import { Button } from "@/components/ui/button";
import { updatePrivacy } from "@/api/institution";
import { useToast } from "@/context/useToast";
import { useInstitution, usePrivacy } from "@/hooks/useInstitution";
import { cn } from "@/lib/cn";
import { PRIVACY_MAX, PRIVACY_PLACEHOLDERS, PRIVACY_TEMPLATE, policyTextProblem, renderPolicy } from "@/lib/privacy";

const Editor = ({ policy, institution }) => {
  const toast = useToast();
  const [text, setText] = useState(policy.source);
  const [date, setDate] = useState(policy.effectiveDate ?? "");
  const [reviewed, setReviewed] = useState(policy.reviewed);
  const [preview, setPreview] = useState(false);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);

  const problem = policyTextProblem(text);
  const patch = {};
  if (text.trim() + "\n" !== policy.source) patch.text = text;
  if (date !== (policy.effectiveDate ?? "")) patch.effectiveDate = date;
  if (reviewed !== policy.reviewed) patch.reviewed = reviewed;
  const dirty = Object.keys(patch).length > 0;

  const save = async () => {
    setSaving(true);
    try {
      const saved = await updatePrivacy(patch);
      toast.push(`Privacy policy saved (version ${saved.version})`, "success");
    } catch (err) {
      toast.push(err?.message || "Couldn't save the policy", "error");
    } finally {
      setSaving(false);
    }
  };
  const useTemplate = () => {
    setText(PRIVACY_TEMPLATE);
    setAsking(false);
  };

  return (
    <SettingsSection
      id="privacy"
      title="Privacy policy"
      description="Shown to everyone on a public page, linked from the sign-in page, every profile and the sidebar. Your institution decides what it says."
      aside={
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold", policy.reviewed ? "bg-success-dim text-success" : "bg-warning-dim text-warning")}>
          <span aria-hidden="true" className={cn("size-1.5 rounded-full", policy.reviewed ? "bg-success" : "bg-warning")} />
          {policy.reviewed ? `Reviewed · version ${policy.version}` : "Draft"}
        </span>
      }
    >
      {!policy.reviewed && (
        <Notice tone="warning" className="mb-4 text-[13px]">
          Draft. This wording is a template, not legal advice. Have your own legal adviser review it, then tick the box below.
        </Notice>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Editor view" size="sm" value={preview ? "preview" : "edit"} onChange={(v) => setPreview(v === "preview")} options={[{ value: "edit", label: "Edit" }, { value: "preview", label: "Preview" }]} />
        <Button type="button" size="sm" variant="ghost" onClick={() => (text.trim() + "\n" === PRIVACY_TEMPLATE ? null : setAsking(true))} disabled={text.trim() + "\n" === PRIVACY_TEMPLATE}>Start from the template</Button>
        <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="ms-auto inline-flex min-h-8 items-center gap-1 rounded-sm px-1 text-[13px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40">
          Open public page <ExternalLink size={13} aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </Link>
      </div>
      {preview ? (
        <div className="rounded-[var(--radius-container)] border border-rule bg-surface px-5 py-5"><PolicyDocument text={renderPolicy(text, institution)} /></div>
      ) : (
        <>
          <textarea
            aria-label="Privacy policy text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            dir="auto"
            spellCheck
            rows={18}
            className={cn(inputClass, "h-auto min-h-[320px] py-3 font-mono text-[13px] leading-relaxed")}
          />
          <div role="status" className={cn("mt-1.5 text-[12px]", problem ? "text-danger" : "text-ink-3")}>
            {problem ?? `${text.trim().length.toLocaleString("en-US")} of ${PRIVACY_MAX.toLocaleString("en-US")} characters`}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            Plain text: a line starting with <code>## </code> is a heading, <code>- </code> a bullet, a blank line a new paragraph. Placeholders filled in from your institution settings: {PRIVACY_PLACEHOLDERS.map((p) => `{{${p}}}`).join(", ")}.
            {" "}Text between <code>{"{{#city}}"}</code> and <code>{"{{/city}}"}</code> (or <code>{"{{#photos}}"}</code> … <code>{"{{/photos}}"}</code>) is shown only when the city is filled in (or student photos are on).
          </p>
        </>
      )}
      <div className="mt-5 grid gap-4 tablet:grid-cols-2">
        <label className="block text-[13px] font-medium text-ink-2">
          In effect from (optional)
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputClass, "mt-1.5")} />
        </label>
        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[14px] text-ink tablet:self-end pointer-coarse:min-h-11">
          <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="size-5 shrink-0 accent-[var(--color-primary)]" />
          Our legal adviser has reviewed this policy
        </label>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <LoadingButton type="button" loading={saving} disabled={!dirty || !!problem} onClick={save}>Save policy</LoadingButton>
        <span className="text-[12.5px] text-ink-3">
          Version {policy.version}{policy.updatedAt ? ` · saved ${new Date(policy.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : " · template, not saved yet"}
          {patch.text && " · saving the new wording makes a new version"}
        </span>
      </div>
      <ConfirmDialog
        open={asking}
        title="Replace your text with the template?"
        message="Your current wording in the box will be replaced. Nothing is saved until you press Save policy."
        confirmLabel="Replace"
        tone="primary"
        onConfirm={useTemplate}
        onClose={() => setAsking(false)}
      />
    </SettingsSection>
  );
};

/** Admin: write the policy, preview it, mark it as reviewed. */
export const PrivacyPolicyEditor = () => {
  const { data: policy, error, refetch } = usePrivacy();
  const { data: institution } = useInstitution();
  if (error) return <PageError error={error} onRetry={refetch} />;
  if (!policy?.source || !institution) return <div className="h-40 animate-pulse rounded-[var(--radius-container)] bg-rule/60" aria-hidden />;
  return <Editor key={`${policy.version}-${policy.updatedAt}-${policy.reviewed}`} policy={policy} institution={institution} />;
};
