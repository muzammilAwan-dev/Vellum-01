import { ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Field, LoadingButton, inputClass } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/useToast";
import { updateInstitution } from "@/api/institution";
import { resizeLogo } from "@/lib/resizeLogo";
import { LIMITS, INSTITUTION_FIELDS, validateInstitutionPatch } from "@/lib/institution";
import { cn } from "@/lib/cn";

const Switch = ({ checked, onChange, labelId, descId }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={labelId}
    aria-describedby={descId}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-rule-2 transition-colors pointer-coarse:h-7 pointer-coarse:w-12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      checked ? "bg-primary" : "bg-raised",
    )}
  >
    <span aria-hidden="true" className={cn("size-4.5 rounded-full bg-surface shadow-sm transition-transform", checked ? "translate-x-5.5" : "translate-x-0.5")} />
  </button>
);

// The institution's identity (shown on report headers and on every Profile) and the student-photo policy.
export const InstitutionForm = ({ institution }) => {
  const toast = useToast();
  const fileRef = useRef(null);
  const [draft, setDraft] = useState(() => Object.fromEntries(INSTITUTION_FIELDS.map((k) => [k, institution[k]])));
  const [errors, setErrors] = useState(null);
  const [logoError, setLogoError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const dirty = INSTITUTION_FIELDS.some((k) => (typeof draft[k] === "string" ? draft[k].trim() : draft[k]) !== institution[k]);

  const pickLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const logo = await resizeLogo(file);
      setDraft((d) => ({ ...d, logo }));
      setLogoError(null);
    } catch (err) {
      setLogoError(err.message);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const patch = {};
    for (const k of INSTITUTION_FIELDS) {
      const v = typeof draft[k] === "string" ? draft[k].trim() : draft[k];
      if (v !== institution[k]) patch[k] = v;
    }
    const problems = validateInstitutionPatch(patch);
    setErrors(problems);
    if (problems) return;
    setSaving(true);
    try {
      await updateInstitution(patch);
      toast.push("Institution settings saved", "success");
    } catch (err) {
      toast.push(err.message || "Couldn't save the institution settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const err = (k) => errors?.[k] && <span role="alert" className="mt-1.5 block text-[12px] text-danger">{errors[k]}</span>;

  return (
    <form onSubmit={save} noValidate>
      <section aria-labelledby="institution-identity" className="mb-10">
        <h2 id="institution-identity" className="mb-3 text-[14px] font-semibold text-ink">Identity</h2>
        <div className="mb-5 flex items-center gap-4">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-control)] border border-rule-2 bg-sunken">
            {draft.logo ? <img src={draft.logo} alt="Institution logo preview" className="size-full object-contain" /> : <ImagePlus size={24} aria-hidden="true" className="text-ink-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                {draft.logo ? "Change logo" : "Upload logo"}
              </Button>
              {draft.logo && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraft((d) => ({ ...d, logo: null }))}>
                  <Trash2 aria-hidden="true" /> Remove
                </Button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="sr-only" tabIndex={-1} aria-label="Choose a logo image" onChange={pickLogo} />
            <p className="mt-2 text-[12px] text-ink-3">PNG or JPEG. It is resized to 256 px wide in your browser.</p>
            {(logoError || errors?.logo) && <p role="alert" className="mt-1 text-[12px] text-danger">{logoError || errors.logo}</p>}
          </div>
        </div>
        <div className="max-w-[520px]">
          <Field label="Institution name" hint={`${draft.name.length}/${LIMITS.name}`}>
            <input className={inputClass} value={draft.name} maxLength={LIMITS.name} onChange={set("name")} aria-invalid={errors?.name ? true : undefined} />
            {err("name")}
          </Field>
          <Field label="Short name" hint="Used where space is tight, e.g. the sidebar">
            <input className={inputClass} value={draft.shortName} maxLength={LIMITS.shortName} onChange={set("shortName")} aria-invalid={errors?.shortName ? true : undefined} />
            {err("shortName")}
          </Field>
          <Field label="City">
            <input className={inputClass} value={draft.city} maxLength={LIMITS.city} onChange={set("city")} />
            {err("city")}
          </Field>
          <Field label="Phone">
            <input className={inputClass} type="tel" inputMode="tel" value={draft.phone} maxLength={20} onChange={set("phone")} aria-invalid={errors?.phone ? true : undefined} />
            {err("phone")}
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" inputMode="email" value={draft.email} maxLength={LIMITS.email} onChange={set("email")} aria-invalid={errors?.email ? true : undefined} />
            {err("email")}
          </Field>
        </div>
      </section>

      <section aria-labelledby="institution-photos" className="mb-8">
        <h2 id="institution-photos" className="mb-3 text-[14px] font-semibold text-ink">Student photos</h2>
        <div className="flex max-w-[560px] items-start gap-3.5 rounded-[var(--radius-control)] border border-rule bg-surface p-4">
          <Switch checked={draft.allowStudentPhotos} onChange={(v) => setDraft((d) => ({ ...d, allowStudentPhotos: v }))} labelId="photos-label" descId="photos-desc" />
          <div>
            <div id="photos-label" className="text-[14px] font-medium text-ink">Allow student photos</div>
            <p id="photos-desc" className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
              Off by default. Turn it on only when parents have agreed to photos of their children being stored here. When on, students can add a photo and
              their teachers can see it. Classmates never see each other's photos.
            </p>
          </div>
        </div>
      </section>

      <LoadingButton type="submit" loading={saving} disabled={!dirty}>
        Save changes
      </LoadingButton>
    </form>
  );
};
