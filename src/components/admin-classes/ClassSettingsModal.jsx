import { useState } from "react";
import { Chip, ChipRow, Field, FieldGroup, ModalShell, inputClass } from "@/components/common";
import { useToast } from "@/context/useToast";
import { Button } from "@/components/ui/button";

// ═══════════════════════════════════════════════════════════════
// CLASS SETTINGS MODAL
// ═══════════════════════════════════════════════════════════════
// The form lives in an inner component that only exists while the modal is open
// (and is rebuilt for another class), so its fields start from the class's
// current values without a reset effect.
export const ClassSettingsModal = (props) =>
  props.open ? <ClassSettingsForm key={props.cls?.id ?? "none"} {...props} /> : null;

const ClassSettingsForm = ({
  open,
  onClose,
  cls,
  availableTeachers = [],
  currentTeacherIds = [],
  onSave,
  onDelete,
}) => {
  const toast = useToast();
  const [name, setName] = useState(cls?.name || "");
  const [busy, setBusy] = useState(false);
  const [assigned, setAssigned] = useState(currentTeacherIds);
  const [error, setError] = useState(null);

  const toggleTeacher = (t) =>
    setAssigned((a) => (a.includes(t) ? a.filter((x) => x !== t) : [...a, t]));
  const submit = async (ev) => {
    ev?.preventDefault();
    if (!name.trim()) {
      setError("Enter a class name");
      document.getElementById("class-settings-name")?.focus();
      return;
    }
    setBusy(true);
    try {
      await onSave?.({ name: name.trim(), teacherIds: assigned });
      toast.push("Class settings saved", "success");
      onClose();
    } catch (err) {
      if (err.code === "DUPLICATE_CLASS") setError(err.message);
      else toast.push(err.message || "Couldn't save the class", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Class settings"
      maxWidth="640px"
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button type="submit" form="class-settings-form" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <form id="class-settings-form" onSubmit={submit} noValidate>
      <Field label="Class name" error={error}>
        <input
          id="class-settings-name"
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
        label="Assigned teachers"
        hint="Removing a teacher unassigns them from this class but keeps their account active."
      >
        <ChipRow>
          {availableTeachers.length === 0 && (
            <span className="text-[12.5px] text-ink-3">
              No teachers available — create one first.
            </span>
          )}
          {availableTeachers.map((t) => (
            <Chip
              key={t.id}
              check
              active={assigned.includes(t.id)}
              onClick={() => toggleTeacher(t.id)}
            >
              {t.name}
            </Chip>
          ))}
        </ChipRow>
      </FieldGroup>
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>

      <div className="mt-7 border-t border-rule pt-5">
        <h3 className="mb-3 text-[13px] font-semibold text-danger">
          Danger zone
        </h3>
        <div className="flex flex-col items-start gap-4 rounded-[var(--radius-container)] border border-danger/30 bg-danger-dim p-4 narrow:flex-row narrow:items-center">
          <div className="min-w-0 flex-1">
            <strong className="mb-0.5 block text-[13.5px] font-semibold text-ink">
              Delete this class
            </strong>
            <span className="block text-[12px] leading-relaxed text-ink-2">
              Unassigns its students and removes its subjects. Blocked while the
              class still has tests. Cannot be undone.
            </span>
          </div>
          <Button
            onClick={() => {
              onClose();
              onDelete?.();
            }} variant="destructive" size="sm"
          >
            Delete class
          </Button>
        </div>
      </div>
    </ModalShell>
  );
};
