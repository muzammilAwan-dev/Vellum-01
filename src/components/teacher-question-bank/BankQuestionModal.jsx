import { useState } from "react";
import { createBankQuestion, updateBankQuestion } from "@/api/bank";
import { Field, ModalShell, inputClass } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/context/useToast";
import { useSubjectTopics } from "@/hooks/useTopics";
import { QUESTION_TYPES, isChoice, normalizeQuestion } from "@/lib/questions";

// ═══════════════════════════════════════════════════════════════
// ADD / EDIT A BANK QUESTION
// `question` = an existing bank question to edit (or a copy to duplicate when
// `duplicate` is set); null = a blank one.
// ═══════════════════════════════════════════════════════════════
const blank = () => normalizeQuestion({ type: "mcq", topic: "", marks: 1, text: "", correctIndex: null });

// The form only exists while the modal is open (and is rebuilt for another question),
// so it starts from that question without a reset effect.
export const BankQuestionModal = (props) =>
  props.open ? <BankQuestionForm key={`${props.question?.id ?? "blank"}:${props.duplicate ? "copy" : "edit"}`} {...props} /> : null;

const BankQuestionForm = ({ open, onClose, subjectId, question, duplicate = false }) => {
  const toast = useToast();
  const { data: topics } = useSubjectTopics(subjectId);
  const [q, setQ] = useState(() => (question ? normalizeQuestion(question) : blank()));
  const [busy, setBusy] = useState(false);
  const editing = !!question && !duplicate;
  const choice = isChoice(q);
  const set = (patch) => setQ((prev) => ({ ...prev, ...patch }));
  const setType = (type) => {
    const next = normalizeQuestion({ ...q, type, options: null, correctIndex: null });
    setQ(next);
  };
  const setOption = (i, value) => set({ options: q.options.map((o, j) => (j === i ? value : o)) });

  const save = async () => {
    setBusy(true);
    try {
      if (editing) await updateBankQuestion(question.id, q);
      else await createBankQuestion(subjectId, q);
      toast.push(editing ? "Question updated" : duplicate ? "Question duplicated" : "Question added to the bank", "success");
      onClose();
    } catch (err) {
      toast.push(err.message || "Couldn't save the question", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={editing ? "Edit question" : duplicate ? "Duplicate question" : "Add a question"}
      maxWidth="640px"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !q.text.trim() || !q.topic.trim()}>
            {editing ? "Save changes" : "Add to bank"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 tablet:grid-cols-[1fr_1fr_90px]">
        <Field label="Type">
          <Select
            value={q.type}
            onChange={setType}
            options={Object.entries(QUESTION_TYPES).map(([id, t]) => ({ value: id, label: t.label }))}
          />
        </Field>
        <Field label="Topic">
          <input
            list="bank-topics"
            value={q.topic}
            onChange={(e) => set({ topic: e.target.value })}
            placeholder="e.g. Kinematics"
            maxLength={80}
            className={inputClass}
          />
          <datalist id="bank-topics">
            {(topics ?? []).map((t) => (
              <option key={t.name} value={t.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Marks">
          <input
            type="number"
            min={1}
            max={100}
            value={q.marks}
            onChange={(e) => set({ marks: e.target.value === "" ? "" : Number(e.target.value) })}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Question">
        <textarea value={q.text} onChange={(e) => set({ text: e.target.value })} rows={3} className={`${inputClass} min-h-24`} />
      </Field>

      {choice && (
        <Field label="Options" hint="Select the correct one — students never see this marker.">
          <div className="flex flex-col gap-2">
            {q.options.map((o, i) => (
              <label key={i} className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="correct"
                  checked={q.correctIndex === i}
                  onChange={() => set({ correctIndex: i })}
                  aria-label={`Option ${String.fromCharCode(65 + i)} is correct`}
                  className="size-5 shrink-0 accent-[var(--color-primary)]"
                />
                <span className="w-5 font-mono text-[12px] font-bold text-ink-3">{String.fromCharCode(65 + i)}</span>
                {q.type === "truefalse" ? (
                  <span className="text-[13.5px] text-ink">{o}</span>
                ) : (
                  <input value={o} onChange={(e) => setOption(i, e.target.value)} className={inputClass} />
                )}
              </label>
            ))}
          </div>
        </Field>
      )}

      {!choice && (
        <Field label="Expected answer" hint="What a full-mark answer says. Used by the AI grader.">
          <textarea
            value={q.expectedAnswer}
            onChange={(e) => set({ expectedAnswer: e.target.value })}
            rows={3}
            className={`${inputClass} min-h-20`}
          />
        </Field>
      )}
    </ModalShell>
  );
};
