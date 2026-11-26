import { useState } from "react";
import { Plus } from "lucide-react";
import { createSubject, deleteSubject, updateSubject } from "@/api/subjects";
import { Field, LoadingButton, PageError, PageHeader, PageLoading, Scope, inputClass } from "@/components/common";
import { ActionMenu } from "@/components/ui/menu";
import { useApp } from "@/context/useApp";
import { useToast } from "@/context/useToast";

// ═══════════════════════════════════════════════════════════════
// SUBJECTS
// The subjects taught in the active class. Everything else (materials,
// tests, question bank) is filed under one of these.
// ═══════════════════════════════════════════════════════════════
const SubjectRow = ({ subject, onSaved }) => {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(subject.name);
  const [outline, setOutline] = useState(subject.outline ?? "");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const run = async (fn, done) => {
    setBusy(true);
    try {
      await fn();
      done?.();
    } catch (err) {
      toast.push(err.message || "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(
      () => updateSubject(subject.id, { name, outline }),
      () => {
        setEditing(false);
        toast.push("Subject saved", "success");
        onSaved?.();
      },
    );

  const remove = () =>
    run(() => deleteSubject(subject.id), () => toast.push(`${subject.name} deleted`, "success"));

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-rule bg-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-ink">{subject.name}</div>
          <div className="text-[12px] text-ink-3">
            {subject.outline ? `Outline · ${subject.outline.length.toLocaleString()} characters` : "No outline yet"}
          </div>
        </div>
        {confirming ? (
          <>
            <span role="alert" className="text-[12.5px] text-ink-2">Delete {subject.name}? Tests and materials of this subject block it.</span>
            <LoadingButton variant="danger" loading={busy} onClick={remove}>Delete</LoadingButton>
            <LoadingButton variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Keep</LoadingButton>
          </>
        ) : (
          <ActionMenu
            label={`Actions for ${subject.name}`}
            items={[
              { id: "edit", label: "Rename or edit outline", onSelect: () => setEditing(true) },
              { id: "delete", label: "Delete", danger: true, separatorBefore: true, onSelect: () => setConfirming(true) },
            ]}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4 rounded-xl border border-primary/40 bg-surface p-4">
      <Field label="Name">
        <input className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Course outline" hint="Optional. Paste the syllabus text; materials you upload add to it later.">
        <textarea
          className={`${inputClass} min-h-40`}
          value={outline}
          onChange={(e) => setOutline(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <LoadingButton
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setName(subject.name);
            setOutline(subject.outline ?? "");
            setEditing(false);
          }}
        >
          Cancel
        </LoadingButton>
        <LoadingButton loading={busy} onClick={save}>Save</LoadingButton>
      </div>
    </div>
  );
};

const TeacherSubjects = () => {
  const toast = useToast();
  const { activeClassObj, classSubjects, scopeLoading, scopeError } = useApp();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  if (scopeLoading) return <PageLoading />;
  if (scopeError) return <PageError error={scopeError} />;

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim() || adding) return;
    setAdding(true);
    try {
      await createSubject({ classId: activeClassObj.id, name });
      setName("");
      toast.push("Subject added", "success");
    } catch (err) {
      toast.push(err.message || "Couldn't add the subject", "error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mx-auto max-w-[860px] px-5 py-6 tablet:px-10 tablet:py-8">
      <PageHeader
        crumbs={[{ label: <Scope /> }, { label: "Subjects" }]}
        title="Subjects"
        intro={`What ${activeClassObj?.short ?? "this class"} studies. Switch between them from the sidebar. Each subject keeps its own outline, materials and tests.`}
      />

      <form onSubmit={add} className="mb-6 flex flex-wrap gap-2">
        <input
          className={`${inputClass} min-w-0 flex-1 basis-[220px]`}
          placeholder="e.g. Biology"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          aria-label="New subject name"
        />
        <LoadingButton type="submit" loading={adding} disabled={!name.trim()}>
          <Plus size={14} /> Add subject
        </LoadingButton>
      </form>

      <div className="grid gap-2.5">
        {classSubjects.map((s) => (
          <SubjectRow key={s.id} subject={s} />
        ))}
        {classSubjects.length === 0 && (
          <div className="rounded-xl border border-dashed border-rule-2 p-8 text-center text-[13px] text-ink-3">
            No subjects yet. Add the first one above.
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherSubjects;
