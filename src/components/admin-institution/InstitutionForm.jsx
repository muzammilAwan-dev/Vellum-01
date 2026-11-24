import { ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Field, LoadingButton, inputClass } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/context/useToast";
import { updateInstitution } from "@/api/institution";
import { resizeLogo } from "@/lib/resizeLogo";
import { LIMITS, INSTITUTION_FIELDS, validateInstitutionPatch } from "@/lib/institution";

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


  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-6">
      <SettingsSection id="identity" title="Identity" description="Shown on the sign-in page, the sidebar, test pages, printed reports and every profile.">
        <div className="mb-6 flex items-center gap-4">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-control)] border border-dashed border-rule-3 bg-sunken">
            {draft.logo ? <img src={draft.logo} alt="Institution logo preview" className="size-full object-contain" /> : <ImagePlus size={24} aria-hidden="true" className="text-ink-3" />}
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
            <p className="mt-2 text-[12px] text-ink-3">PNG or JPEG, square works best. It is resized to 256 px wide in your browser.</p>
            {(logoError || errors?.logo) && <p role="alert" className="mt-1 text-[12px] text-danger">{logoError || errors.logo}</p>}
          </div>
        </div>
        <div className="grid gap-x-5 tablet:grid-cols-2">
          <Field label="Institution name" hint={`Full name, as on official documents · ${draft.name.length}/${LIMITS.name}`} error={errors?.name}>
            <input className={inputClass} value={draft.name} maxLength={LIMITS.name} onChange={set("name")} autoComplete="organization" aria-invalid={errors?.name ? true : undefined} />
          </Field>
          <Field label="Short name" hint="Used where space is tight, e.g. the sidebar" error={errors?.shortName}>
            <input className={inputClass} value={draft.shortName} maxLength={LIMITS.shortName} onChange={set("shortName")} aria-invalid={errors?.shortName ? true : undefined} />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection id="contact" title="Contact" description="Printed on report headers and filled into the privacy policy, so parents know who to ask.">
        <div className="grid gap-x-5 tablet:grid-cols-2">
          <Field label="City" hint="Appears after the name in the privacy policy" error={errors?.city}>
            <input className={inputClass} value={draft.city} maxLength={LIMITS.city} onChange={set("city")} autoComplete="address-level2" aria-invalid={errors?.city ? true : undefined} />
          </Field>
          <Field label="Phone" hint="The office number parents can call" error={errors?.phone}>
            <input className={inputClass} type="tel" inputMode="tel" dir="ltr" value={draft.phone} maxLength={20} onChange={set("phone")} autoComplete="tel" placeholder="042-1234567" aria-invalid={errors?.phone ? true : undefined} />
          </Field>
          <Field label="Email" hint="The contact address in the privacy policy ({{contactEmail}})" error={errors?.email}>
            <input className={inputClass} type="email" inputMode="email" dir="ltr" value={draft.email} maxLength={LIMITS.email} onChange={set("email")} autoComplete="email" placeholder="office@institution.edu" aria-invalid={errors?.email ? true : undefined} />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection id="photos" title="Student photos" description="A privacy choice for the whole institution.">
        <div className="flex items-start gap-3.5">
          <Switch checked={draft.allowStudentPhotos} onChange={(v) => setDraft((d) => ({ ...d, allowStudentPhotos: v }))} labelId="photos-label" descId="photos-desc" className="mt-0.5" />
          <div>
            <div id="photos-label" className="text-[14px] font-medium text-ink">
              Allow student photos <span className="ml-1 text-[12.5px] font-medium text-ink-3">· {draft.allowStudentPhotos ? "On" : "Off"}</span>
            </div>
            <p id="photos-desc" className="mt-1 max-w-[60ch] text-[13px] leading-relaxed text-ink-3">
              Off by default. Turn it on only when parents have agreed to photos of their children being stored here. When on, students can add a photo and
              their teachers can see it. Classmates never see each other's photos.
            </p>
          </div>
        </div>
      </SettingsSection>

      <div className="flex flex-wrap items-center gap-3">
        <LoadingButton type="submit" loading={saving} disabled={!dirty}>
          Save changes
        </LoadingButton>
        <span className="text-[12.5px] text-ink-3" aria-live="polite">{dirty ? "You have unsaved changes" : "All changes saved"}</span>
      </div>
    </form>
  );
};

// One card per settings group; the id is the anchor the side menu links to.
export const SettingsSection = ({ id, title, description, children, aside }) => (
  <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 rounded-[var(--radius-container)] border border-rule bg-surface p-6 shadow-[var(--shadow-card)] max-narrow:p-4">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={`${id}-title`} className="text-[16px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-ink-3">{description}</p>}
      </div>
      {aside}
    </div>
    {children}
  </section>
);
