import { useState } from "react";
import { Field, LoadingButton, inputClass } from "@/components/common";
import { useToast } from "@/context/useToast";
import { updateProfile } from "@/api/profile";
import { BIO_MAX, PHONE_MAX, validateProfilePatch } from "@/lib/profile";

const Row = ({ label, children }) => (
  <div className="grid gap-0.5 border-b border-rule py-3 last:border-b-0 narrow:grid-cols-[160px_1fr] narrow:gap-4">
    <dt className="text-[13px] font-medium text-ink-3">{label}</dt>
    <dd className="min-w-0 text-[14px] text-ink [overflow-wrap:anywhere]">{children}</dd>
  </div>
);

// Identity is read-only (the administrator changes it); bio and phone are the user's own.
export const ProfileBasics = ({ profile }) => {
  const toast = useToast();
  const [bio, setBio] = useState(profile.bio);
  const [phone, setPhone] = useState(profile.phone);
  const [errors, setErrors] = useState(null);
  const [saving, setSaving] = useState(false);
  const dirty = bio.trim() !== profile.bio || phone.trim() !== profile.phone;

  const save = async (e) => {
    e.preventDefault();
    const patch = { bio: bio.trim(), phone: phone.trim() };
    const problems = validateProfilePatch(patch);
    setErrors(problems);
    if (problems) return;
    setSaving(true);
    try {
      await updateProfile(patch);
      setBio(patch.bio); // show what was stored (trimmed)
      setPhone(patch.phone);
      toast.push("Profile saved", "success");
    } catch (err) {
      toast.push(err.message || "Couldn't save your profile", "error");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setBio(profile.bio);
    setPhone(profile.phone);
    setErrors(null);
  };

  return (
    <section aria-labelledby="profile-basics" className="mb-10">
      <h2 id="profile-basics" className="mb-3 text-[14px] font-semibold text-ink">
        Your details
      </h2>
      <dl className="mb-2 rounded-[var(--radius-control)] border border-rule bg-surface px-4">
        <Row label="Name">{profile.name}</Row>
        <Row label="Email">{profile.email}</Row>
        {profile.role === "student" && (
          <>
            <Row label="Class">{profile.classes.map((c) => c.name).join(", ") || "Not assigned yet"}</Row>
            <Row label="Roll number">{profile.rollNo ?? "—"}</Row>
          </>
        )}
        {profile.role === "teacher" && (
          <>
            <Row label="Classes">{profile.classes.map((c) => c.code).join(", ") || "None yet"}</Row>
            <Row label="Subjects">{[...new Set(profile.subjects.map((s) => s.name))].join(", ") || "None yet"}</Row>
          </>
        )}
      </dl>
      <p className="mb-6 text-[12px] text-ink-3">
        Your name, email, role and class are managed by your administrator.
      </p>

      <form onSubmit={save} noValidate>
        <Field label="About you" hint={`${bio.length}/${BIO_MAX}`}>
          <textarea
            className={inputClass}
            rows={3}
            dir="auto"
            value={bio}
            maxLength={BIO_MAX}
            aria-invalid={errors?.bio ? true : undefined}
            onChange={(e) => setBio(e.target.value)}
          />
          {errors?.bio && <span role="alert" className="mt-1.5 block text-[12px] text-danger">{errors.bio}</span>}
        </Field>
        <Field label="Phone" hint="Digits, +, spaces and dashes">
          <input
            className={inputClass}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            maxLength={PHONE_MAX}
            aria-invalid={errors?.phone ? true : undefined}
            onChange={(e) => setPhone(e.target.value)}
          />
          {errors?.phone && <span role="alert" className="mt-1.5 block text-[12px] text-danger">{errors.phone}</span>}
        </Field>
        <div className="flex flex-wrap gap-2">
          <LoadingButton type="submit" loading={saving} disabled={!dirty}>
            Save changes
          </LoadingButton>
          {dirty && !saving && (
            <LoadingButton type="button" variant="ghost" onClick={reset}>
              Discard
            </LoadingButton>
          )}
        </div>
      </form>
    </section>
  );
};
