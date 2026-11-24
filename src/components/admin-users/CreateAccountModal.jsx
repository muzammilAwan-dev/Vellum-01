import { useRef, useState } from "react";
import { Chip, ChipRow, Field, FieldGroup, ModalShell, Notice, Segmented, inputClass } from "@/components/common";
import { useToast } from "@/context/useToast";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { validateGuardian } from "@/lib/contact";

const ROLE_OPTIONS = [
  { value: "teacher", label: "Teacher" },
  { value: "student", label: "Student" },
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Checks the form before it is sent; the server checks again (duplicate email, class rules).
const validate = ({ name, email, role, classId, guardianName, guardianPhone }) => {
  const e = {};
  if (!name.trim()) e.name = "Enter the person's full name";
  if (!email.trim()) e.email = "Enter an email address";
  else if (!EMAIL.test(email.trim())) e.email = "Enter a valid email address, like name@institution.edu";
  if (role === "student" && !classId) e.classId = "Choose a class for the student";
  if (role === "student") {
    const bad = validateGuardian({ name: guardianName, phone: guardianPhone });
    if (bad?.name) e.guardianName = bad.name;
    if (bad?.phone) e.guardianPhone = bad.phone;
    if (bad?._) e.guardianPhone = bad._;
  }
  return Object.keys(e).length ? e : null;
};

// ═══════════════════════════════════════════════════════════════
// CREATE ACCOUNT MODAL
// Errors appear under the field they belong to, and focus moves to the first one.
// ═══════════════════════════════════════════════════════════════
export const CreateAccountModal = ({ open, onClose, onCreate, classes = [] }) => {
  const toast = useToast();
  const formRef = useRef(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("teacher");
  const [classId, setClassId] = useState("");
  const [teaches, setTeaches] = useState([]);
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [errors, setErrors] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;
  const reset = () => {
    setName("");
    setEmail("");
    setRole("teacher");
    setClassId("");
    setTeaches([]);
    setGuardianName("");
    setGuardianPhone("");
    setErrors(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const focusFirstError = () =>
    requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
  // Fix an error as soon as the field changes, without waiting for the next submit.
  const edit = (key, setter) => (value) => {
    setter(value);
    if (errors?.[key]) setErrors(({ [key]: _gone, ...rest }) => (Object.keys(rest).length ? rest : null));
  };

  const submit = async (ev) => {
    ev?.preventDefault();
    const problems = validate({ name, email, role, classId, guardianName, guardianPhone });
    setErrors(problems);
    if (problems) {
      focusFirstError();
      return;
    }
    setBusy(true);
    try {
      await onCreate?.({
        name: name.trim(),
        email: email.trim(),
        role,
        ...(role === "student"
          ? { classId, ...(guardianName.trim() ? { guardianName } : {}), ...(guardianPhone.trim() ? { guardianPhone } : {}) }
          : teaches.length ? { classIds: teaches } : {}),
      });
      close();
    } catch (err) {
      if (err.code === "DUPLICATE_EMAIL") {
        setErrors({ email: "An account with this email already exists" });
        focusFirstError();
      } else if (err.code === "INVALID_GUARDIAN") {
        setErrors({ guardianPhone: err.message });
        focusFirstError();
      } else toast.push(err.message || "Couldn't create the account", "error");
    } finally {
      setBusy(false);
    }
  };

  const bad = (k) => (errors?.[k] ? true : undefined);

  return (
    <ModalShell
      open={open}
      onClose={close}
      title="Create account"
      description="Teachers and students sign in with their email and a temporary password."
      maxWidth="540px"
      footer={
        <>
          <Button onClick={close} variant="ghost">
            Cancel
          </Button>
          <Button type="submit" form="create-account-form" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </Button>
        </>
      }
    >
      <form id="create-account-form" ref={formRef} onSubmit={submit} noValidate>
        <FieldGroup label="Role">
          <Segmented label="Role" value={role} onChange={edit("classId", setRole)} options={ROLE_OPTIONS} />
        </FieldGroup>
        <Field label="Full name" error={errors?.name}>
          <input value={name} onChange={(e) => edit("name", setName)(e.target.value)} placeholder="e.g. Dr. A. Mensah" autoComplete="off" autoFocus aria-invalid={bad("name")} className={inputClass} />
        </Field>
        <Field label="Email" error={errors?.email}>
          <input type="email" value={email} onChange={(e) => edit("email", setEmail)(e.target.value)} placeholder="a.mensah@westfield.edu" autoComplete="off" inputMode="email" dir="ltr" aria-invalid={bad("email")} className={inputClass} />
        </Field>

        {role === "teacher" && classes.length > 0 && (
          <FieldGroup label="Classes they teach (optional)" hint="You can change this later in each class's settings.">
            <ChipRow>
              {classes.map((c) => (
                <Chip key={c.id} check active={teaches.includes(c.id)} onClick={() => setTeaches((t) => (t.includes(c.id) ? t.filter((x) => x !== c.id) : [...t, c.id]))}>
                  {c.name}
                </Chip>
              ))}
            </ChipRow>
          </FieldGroup>
        )}

        {role === "student" && (
          <>
            <div className="mb-4">
              <span id="create-account-class" className="mb-1.5 block text-[13px] font-medium text-ink-2">Class</span>
              <Select
                aria-label="Class"
                value={classId}
                onChange={edit("classId", setClassId)}
                options={classes.map((c) => ({ value: c.id, label: c.name }))}
                placeholder={classes.length ? "Choose a class" : "No classes yet"}
                disabled={!classes.length}
                className={errors?.classId ? "border-danger" : undefined}
              />
              {errors?.classId && <p role="alert" className="mt-1.5 text-[12.5px] font-medium text-danger">{errors.classId}</p>}
            </div>
            <Field label="Parent name (optional)" error={errors?.guardianName}>
              <input value={guardianName} onChange={(e) => edit("guardianName", setGuardianName)(e.target.value)} maxLength={80} autoComplete="off" dir="auto" aria-invalid={bad("guardianName")} className={inputClass} />
            </Field>
            <Field label="Parent WhatsApp number (optional)" hint="Pakistani mobile, e.g. 0300-1234567. Teachers use it to share reports." error={errors?.guardianPhone}>
              <input value={guardianPhone} onChange={(e) => edit("guardianPhone", setGuardianPhone)(e.target.value)} inputMode="tel" autoComplete="off" dir="ltr" placeholder="0300-1234567" aria-invalid={bad("guardianPhone")} className={inputClass} />
            </Field>
          </>
        )}
        <Notice tone="info" className="mt-2">
          A temporary password is shown once after you create the account. Hand it over in person; they choose their own at first sign-in.
        </Notice>
        {/* Enter in a field submits; the visible button lives in the dialog footer. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </ModalShell>
  );
};
