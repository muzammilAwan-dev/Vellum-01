import { useState } from "react";
import { Field, ModalShell, Notice, Segmented, inputClass } from "@/components/common";
import { useToast } from "@/context/useToast";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ═══════════════════════════════════════════════════════════════
// ADD STUDENT MODAL
// Either creates a new student account in this class, or enrolls a student
// who currently has no class. The roll number is assigned by the server.
// ═══════════════════════════════════════════════════════════════
export const AddStudentModal = ({ open, onClose, unassigned = [], onCreate, onEnroll, className: clsName }) => {
  const toast = useToast();
  const [mode, setMode] = useState("new");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [existingId, setExistingId] = useState("");
  const [errors, setErrors] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const reset = () => {
    setName("");
    setEmail("");
    setExistingId("");
    setMode("new");
    setErrors(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const submit = async (ev) => {
    ev?.preventDefault();
    const e = {};
    if (mode === "new") {
      if (!name.trim()) e.name = "Enter the student's full name";
      if (!email.trim()) e.email = "Enter an email address";
      else if (!EMAIL.test(email.trim())) e.email = "Enter a valid email address";
    } else if (!existingId) e.existing = "Choose a student";
    if (Object.keys(e).length) {
      setErrors(e);
      requestAnimationFrame(() => document.querySelector('#add-student-form [aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    try {
      if (mode === "new") await onCreate?.({ name: name.trim(), email: email.trim() });
      else await onEnroll?.(existingId);
      close();
    } catch (err) {
      if (err.code === "DUPLICATE_EMAIL") setErrors({ email: "An account with this email already exists" });
      else toast.push(err.message || "Couldn't add the student", "error");
    } finally {
      setBusy(false);
    }
  };
  const clear = (k) => errors?.[k] && setErrors(({ [k]: _gone, ...rest }) => rest);

  return (
    <ModalShell
      open={open}
      onClose={close}
      title="Add student"
      description={clsName ? `To ${clsName}. Their roll number is assigned automatically.` : "Their roll number is assigned automatically."}
      maxWidth="500px"
      footer={
        <>
          <Button onClick={close} variant="ghost">
            Cancel
          </Button>
          <Button type="submit" form="add-student-form" disabled={busy}>
            {busy ? "Adding…" : "Add to class"}
          </Button>
        </>
      }
    >
      <form id="add-student-form" onSubmit={submit} noValidate>
        <Segmented
          label="How to add"
          className="mb-1"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setErrors(null);
          }}
          options={[
            { value: "new", label: "New student" },
            { value: "existing", label: "Student without a class", count: unassigned.length, disabled: unassigned.length === 0 },
          ]}
        />
        <p className="mb-5 text-[12px] text-ink-3">
          {unassigned.length === 0 ? "Every existing student already has a class." : `${unassigned.length} existing ${unassigned.length === 1 ? "student has" : "students have"} no class.`}
        </p>

        {mode === "new" ? (
          <>
            <Field label="Full name" error={errors?.name}>
              <input value={name} onChange={(e) => { setName(e.target.value); clear("name"); }} placeholder="e.g. Amelia Chen" autoFocus autoComplete="off" aria-invalid={errors?.name ? true : undefined} className={inputClass} />
            </Field>
            <Field label="Email" error={errors?.email}>
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); clear("email"); }} placeholder="a.chen@westfield.edu" autoComplete="off" inputMode="email" dir="ltr" aria-invalid={errors?.email ? true : undefined} className={inputClass} />
            </Field>
            <Notice tone="info">A temporary password is shown once after you add the student. Hand it over in person; they choose their own at first sign-in.</Notice>
          </>
        ) : (
          <div className="mb-4">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Student</span>
            <Select
              aria-label="Student"
              value={existingId}
              onChange={(v) => { setExistingId(v); clear("existing"); }}
              options={unassigned.map((u) => ({ value: u.id, label: `${u.name} · ${u.email}` }))}
              placeholder="Choose a student"
            />
            {errors?.existing && <p role="alert" className="mt-1.5 text-[12.5px] font-medium text-danger">{errors.existing}</p>}
          </div>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </ModalShell>
  );
};
