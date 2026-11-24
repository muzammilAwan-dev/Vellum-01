import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Field, ModalShell, inputClass } from "@/components/common";
import { useToast } from "@/context/useToast";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { validateGuardian } from "@/lib/contact";

const ROLE_OPTIONS = [
  { value: "teacher", label: "Teacher" },
  { value: "student", label: "Student" },
];

// ═══════════════════════════════════════════════════════════════
// CREATE ACCOUNT MODAL
// ═══════════════════════════════════════════════════════════════
export const CreateAccountModal = ({ open, onClose, onCreate, classes = [] }) => {
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("teacher");
  const [classId, setClassId] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;
  const reset = () => {
    setName("");
    setEmail("");
    setRole("teacher");
    setClassId("");
    setGuardianName("");
    setGuardianPhone("");
  };
  const submit = async () => {
    if (!name.trim() || !email.trim()) {
      toast.push("Name and email are required", "error");
      return;
    }
    if (role === "student" && !classId) {
      toast.push("Choose a class for the student", "error");
      return;
    }
    const bad = role === "student" ? validateGuardian({ name: guardianName, phone: guardianPhone }) : null;
    if (bad) {
      toast.push(Object.values(bad)[0], "error");
      return;
    }
    setBusy(true);
    try {
      await onCreate?.({
        name,
        email,
        role,
        ...(role === "student" ? { classId, ...(guardianName.trim() ? { guardianName } : {}), ...(guardianPhone.trim() ? { guardianPhone } : {}) } : {}),
      });
      reset();
      onClose();
    } catch (err) {
      toast.push(err.message || "Couldn't create the account", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Create account"
      maxWidth="520px"
      footer={
        <>
          <Button
            onClick={onClose} variant="ghost"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy}
          >
            Create account
          </Button>
        </>
      }
    >
      <Field label="Full name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Dr. A. Mensah"
          autoFocus
          className={inputClass}
        />
      </Field>
      <Field label="Email">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="a.mensah@westfield.edu"
          autoComplete="off"
          className={inputClass}
        />
      </Field>
      <Field label="Role">
        <Select value={role} onChange={setRole} options={ROLE_OPTIONS} />
      </Field>
      {role === "student" && (
        <Field label="Class">
          <Select
            value={classId}
            onChange={setClassId}
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
            placeholder={classes.length ? "Choose a class" : "No classes yet"}
            disabled={!classes.length}
          />
        </Field>
      )}
      {role === "student" && (
        <>
          <Field label="Parent name (optional)">
            <input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} maxLength={80} autoComplete="off" dir="auto" className={inputClass} />
          </Field>
          <Field label="Parent WhatsApp number (optional)" hint="Pakistani mobile, e.g. 0300-1234567. Teachers use it to share reports.">
            <input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} inputMode="tel" autoComplete="off" dir="ltr" placeholder="0300-1234567" className={inputClass} />
          </Field>
        </>
      )}
      <div className="mt-2 flex items-start gap-2 rounded-[var(--radius-control)] border border-primary/25 bg-primary-soft px-3.5 py-2.5 text-[12px] leading-relaxed text-primary">
        <Sparkles size={13} className="mt-0.5 shrink-0" />
        <span>A temporary password is shown once after you create the account. Hand it over in person; they choose their own at first sign-in.</span>
      </div>
    </ModalShell>
  );
};
