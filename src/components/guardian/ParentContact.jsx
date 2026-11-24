import { useState } from "react";
import { Phone } from "lucide-react";
import { Bento, Field, ModalShell, PageError, SectionHeader, inputClass } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/useToast";
import { saveGuardian } from "@/api/guardian";
import { GUARDIAN_NAME_MAX, localPhone, validateGuardian } from "@/lib/contact";
import { useGuardian } from "@/hooks/useGuardian";

// ═══════════════════════════════════════════════════════════════
// PARENT CONTACT (F12c1) — name + WhatsApp number of a student's parent.
// Shown masked; the full number appears only inside the edit form.
// Used by the teacher's student page (card) and the admin's accounts table (dialog body).
// ═══════════════════════════════════════════════════════════════
const ContactForm = ({ studentId, initial, onDone }) => {
  const toast = useToast();
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(localPhone(initial.phone));
  const [busy, setBusy] = useState(false);
  const errors = validateGuardian({ name, phone });

  const submit = async (next) => {
    setBusy(true);
    try {
      await saveGuardian(studentId, next);
      toast.push(next.name === "" && next.phone === "" ? "Parent contact removed" : "Parent contact saved", "success");
      onDone();
    } catch (err) {
      toast.push(err.message || "Couldn't save the contact", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Field label="Parent or guardian name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={GUARDIAN_NAME_MAX}
          placeholder="e.g. Mr. Tariq Mahmood"
          autoComplete="off"
          dir="auto"
          className={inputClass}
        />
      </Field>
      <Field label="WhatsApp number" hint={errors?.phone ?? "Pakistani mobile, e.g. 0300-1234567 or +92 300 1234567"}>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          autoComplete="off"
          dir="ltr"
          placeholder="0300-1234567"
          aria-invalid={!!errors?.phone}
          className={inputClass}
        />
      </Field>
      <p className="mb-4 text-[12px] leading-relaxed text-ink-3">
        Used only to open WhatsApp from your own phone or computer; Vellum sends nothing. For students aged 18 or over, ask the student first.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {(initial.name || initial.phone) && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => submit({ name: "", phone: "" })} className="mr-auto">
            Remove contact
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={busy} onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" disabled={busy || !!errors} onClick={() => submit({ name, phone })}>
          Save
        </Button>
      </div>
    </div>
  );
};

/** Body only (no section chrome): read view with an Edit button, or the form. */
export const ParentContactBody = ({ studentId }) => {
  const { data, error, refetch } = useGuardian(studentId);
  const [editing, setEditing] = useState(false);
  if (error) return <PageError error={error} onRetry={refetch} />;
  if (!data) return <div className="h-12 animate-pulse rounded-[var(--radius-control)] bg-rule/60" aria-hidden />;
  if (editing) return <ContactForm studentId={studentId} initial={data} onDone={() => setEditing(false)} />;

  const empty = !data.name && !data.masked;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 text-[14px] text-ink">
        {empty ? (
          <span className="text-ink-3">No parent contact yet. Add one to send reports on WhatsApp.</span>
        ) : (
          <>
            <div className="font-medium" dir="auto">{data.name || "Parent or guardian"}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-3" dir="ltr">
              <Phone size={12} aria-hidden />
              {data.masked || "No number"}
            </div>
          </>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
        {empty ? "Add contact" : "Edit"}
      </Button>
    </div>
  );
};

/** The teacher's card on the student page. Hidden when printing. */
export const ParentContactCard = ({ studentId }) => (
  <section className="no-print mb-14">
    <SectionHeader label="Parent contact" />
    <Bento>
      <ParentContactBody studentId={studentId} />
    </Bento>
  </section>
);

/** Admin: the same contact in a dialog, opened from a student's row. `student` = { id, name } or null. */
export const ParentContactDialog = ({ student, onClose }) => (
  <ModalShell open={!!student} onClose={onClose} title={student ? `Parent contact · ${student.name}` : "Parent contact"} maxWidth="480px">
    {student && <ParentContactBody key={student.id} studentId={student.id} />}
  </ModalShell>
);
