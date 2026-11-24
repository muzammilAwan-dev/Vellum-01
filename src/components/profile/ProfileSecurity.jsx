import { Check, Circle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Field, LoadingButton, inputClass } from "@/components/common";
import { useApp } from "@/context/useApp";
import { useToast } from "@/context/useToast";
import { changePassword } from "@/api/auth";
import { PASSWORD_MAX_LENGTH, PASSWORD_MESSAGES, passwordChecks, validatePassword } from "@/lib/password";
import { formatDateTime } from "@/lib/time";
import { ROLE_HOME } from "@/routes/paths";

const Row = ({ label, children }) => (
  <div className="grid gap-0.5 border-b border-rule py-3 last:border-b-0 narrow:grid-cols-[160px_1fr] narrow:gap-4">
    <dt className="text-[13px] font-medium text-ink-3">{label}</dt>
    <dd className="min-w-0 text-[14px] text-ink">{children}</dd>
  </div>
);

// Change-password form with the rules as a live checklist (never colour alone: icon + words),
// plus when the password last changed and the previous sign-in.
export const ProfileSecurity = ({ profile, forced }) => {
  const { role, refreshUser } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const type = show ? "text" : "password";
  const checks = passwordChecks(next, { email: profile.email, current });
  const mismatch = again !== "" && again !== next;

  const submit = async (e) => {
    e.preventDefault();
    const problem = validatePassword(next, { email: profile.email, current });
    if (!current) return setError("Enter your current password");
    if (problem) return setError(PASSWORD_MESSAGES[problem]);
    if (next !== again) return setError("The two new passwords don't match");
    setError(null);
    setSaving(true);
    try {
      await changePassword({ current, next });
      await refreshUser();
      setCurrent("");
      setNext("");
      setAgain("");
      toast.push("Password changed", "success");
      if (forced) navigate(ROLE_HOME[role], { replace: true });
    } catch (err) {
      setError(err.message || "Couldn't change your password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="profile-security" className="mb-10">
      <h2 id="profile-security" className="mb-3 text-[14px] font-semibold text-ink">
        Security
      </h2>
      {forced && (
        <div role="status" className="mb-4 rounded-[var(--radius-control)] border border-warning/30 bg-warning-dim px-4 py-3 text-[13px] leading-relaxed text-ink">
          <b className="font-semibold">You are using a temporary password.</b> Choose your own password to continue.
          Everything else in Vellum opens after you do.
        </div>
      )}
      <dl className="mb-6 rounded-[var(--radius-control)] border border-rule bg-surface px-4">
        <Row label="Password last changed">
          {profile.passwordChangedAt != null ? formatDateTime(profile.passwordChangedAt) : "Not since the account was created"}
        </Row>
        <Row label="Previous sign-in">{profile.previousLoginAt != null ? formatDateTime(profile.previousLoginAt) : "—"}</Row>
      </dl>

      <form onSubmit={submit} noValidate className="max-w-[520px]">
        {/* lets password managers tie the new password to this account */}
        <input type="text" name="username" autoComplete="username" value={profile.email} readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />
        <Field label={forced ? "Temporary password" : "Current password"}>
          <input className={inputClass} type={type} name="current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password">
          <input className={inputClass} type={type} name="new" autoComplete="new-password" maxLength={PASSWORD_MAX_LENGTH} value={next} onChange={(e) => setNext(e.target.value)} aria-describedby="password-rules" />
        </Field>
        <ul id="password-rules" className="-mt-2 mb-4 space-y-1">
          {checks.map((c) => (
            <li key={c.code} className="flex items-start gap-2 text-[12.5px] text-ink-2">
              {c.ok ? <Check size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-success" /> : <Circle size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-4" />}
              <span>
                <span className="sr-only">{c.ok ? "Met: " : "Not met yet: "}</span>
                {c.text}
              </span>
            </li>
          ))}
        </ul>
        <Field label="Repeat the new password">
          <input className={inputClass} type={type} name="again" autoComplete="new-password" maxLength={PASSWORD_MAX_LENGTH} value={again} onChange={(e) => setAgain(e.target.value)} aria-invalid={mismatch ? true : undefined} />
          {mismatch && <span className="mt-1.5 block text-[12px] text-danger">The two new passwords don't match yet</span>}
        </Field>
        <label className="mb-5 inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[13.5px] text-ink-2">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-5 shrink-0 accent-[var(--color-primary)]" />
          Show passwords
        </label>
        {error && <p role="alert" className="mb-4 text-[13px] text-danger">{error}</p>}
        <LoadingButton type="submit" loading={saving} disabled={!current || !next || !again}>
          Change password
        </LoadingButton>
      </form>
    </section>
  );
};
