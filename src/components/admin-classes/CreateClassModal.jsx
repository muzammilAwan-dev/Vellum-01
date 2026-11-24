import { useState } from "react";
import { Chip, ChipRow, Field, FieldGroup, ModalShell, inputClass } from "@/components/common";
import { useToast } from "@/context/useToast";
import { Button } from "@/components/ui/button";

// ═══════════════════════════════════════════════════════════════
// CREATE CLASS MODAL
// ═══════════════════════════════════════════════════════════════
export const CreateClassModal = ({
  open,
  onClose,
  onCreate,
  teachers = [],
}) => {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [assigned, setAssigned] = useState([]);
  const [error, setError] = useState(null);

  if (!open) return null;
  const toggle = (t) =>
    setAssigned((a) => (a.includes(t) ? a.filter((x) => x !== t) : [...a, t]));
  const reset = () => {
    setName("");
    setAssigned([]);
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const submit = async (ev) => {
    ev?.preventDefault();
    if (!name.trim()) {
      setError("Enter a class name, e.g. Grade 12 — Section C");
      document.getElementById("create-class-name")?.focus();
      return;
    }
    setBusy(true);
    try {
      await onCreate?.({ name: name.trim(), teacherIds: assigned });
      close();
    } catch (err) {
      if (err.code === "DUPLICATE_CLASS") setError(err.message);
      else toast.push(err.message || "Couldn't create the class", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={close}
      title="Create class"
      description="The short code (like 11A) is made from the name."
      maxWidth="520px"
      footer={
        <>
          <Button onClick={close} variant="ghost">
            Cancel
          </Button>
          <Button type="submit" form="create-class-form" disabled={busy}>
            {busy ? "Creating…" : "Create class"}
          </Button>
        </>
      }
    >
      <form id="create-class-form" onSubmit={submit} noValidate>
      <Field label="Class name" error={error}>
        <input
          id="create-class-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          placeholder="e.g. Grade 12 — Section C"
          autoFocus
          className={inputClass}
        />
      </Field>
      <FieldGroup
        label="Assign teachers"
        hint="Students can be enrolled after the class is created."
      >
        <ChipRow>
          {teachers.length === 0 && (
            <span className="text-[12.5px] text-ink-3">
              No teachers yet — create one first
            </span>
          )}
          {teachers.map((t) => (
            <Chip
              key={t.id}
              check
              active={assigned.includes(t.id)}
              onClick={() => toggle(t.id)}
            >
              {t.name}
            </Chip>
          ))}
        </ChipRow>
      </FieldGroup>
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </ModalShell>
  );
};
