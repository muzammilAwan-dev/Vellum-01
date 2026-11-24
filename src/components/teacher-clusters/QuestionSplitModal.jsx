import { useMemo, useRef, useState } from "react";
import { saveQuestions } from "@/api/materials";
import { ModalShell, inputClass } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/useToast";
import { usePaperQuestions } from "@/hooks/useClusters";
import { createId } from "@/lib/id";

// ═══════════════════════════════════════════════════════════════
// QUESTION SPLIT REVIEW
// A paper is cut into questions automatically; fix it here when two questions
// were merged (Split at cursor) or one was cut in half (Join with previous).
// ═══════════════════════════════════════════════════════════════
// The editor only exists while the modal is open (rebuilt for another paper), so it
// always starts from the server's split without a reset effect.
export const QuestionSplitModal = (props) =>
  props.open ? <QuestionSplitEditor key={props.paper?.id ?? "none"} {...props} /> : null;

const QuestionSplitEditor = ({ open, onClose, paper }) => {
  const toast = useToast();
  const { data, isLoading, error } = usePaperQuestions(paper?.id);
  // The server's split as editable rows; `edited` holds the teacher's changes once they make any.
  const base = useMemo(() => (data ? data.questions.map((text) => ({ key: createId(), text })) : null), [data]);
  const [edited, setEdited] = useState(null); // [{ key, text }] | null
  const rows = edited ?? base;
  const setRows = (update) => setEdited((prev) => update(prev ?? base));
  const [saving, setSaving] = useState(false);
  const caret = useRef({});

  const original = data?.questions ?? [];
  const texts = (rows ?? []).map((r) => r.text);
  const dirty = rows && JSON.stringify(texts) !== JSON.stringify(original);
  const emptyRows = (rows ?? []).some((r) => !r.text.trim());

  const patch = (key, text) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, text } : r)));
  const remove = (key) => setRows((rs) => rs.filter((r) => r.key !== key));
  const join = (i) =>
    setRows((rs) => {
      const merged = { ...rs[i - 1], text: `${rs[i - 1].text.trim()} ${rs[i].text.trim()}`.trim() };
      return [...rs.slice(0, i - 1), merged, ...rs.slice(i + 1)];
    });
  const split = (i) =>
    setRows((rs) => {
      const at = caret.current[rs[i].key] ?? 0;
      const text = rs[i].text;
      const a = text.slice(0, at).trim();
      const b = text.slice(at).trim();
      if (!a || !b) {
        toast.push("Put the cursor inside the question where it should be cut", "info");
        return rs;
      }
      return [...rs.slice(0, i), { key: rs[i].key, text: a }, { key: createId(), text: b }, ...rs.slice(i + 1)];
    });

  const save = async () => {
    if (!dirty) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await saveQuestions(paper.id, texts);
      toast.push(`Saved ${texts.length} questions for ${paper.name}`, "success");
      onClose();
    } catch (err) {
      toast.push(err.message || "Couldn't save the questions", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={`Review split · ${paper?.name ?? ""}`}
      maxWidth="760px"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !rows || !rows.length || emptyRows}>
            {dirty ? "Save split" : "Done"}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[12.5px] leading-relaxed text-ink-2">
        One box per question. Cut a box in two at the cursor, or join it to the one above. Recurring-question
        groups update as soon as you save.
      </p>
      {isLoading && <p className="py-6 text-center text-[13px] text-ink-3">Loading…</p>}
      {error && <p role="alert" className="py-6 text-center text-[13px] text-danger">{error.message || "Couldn't load the questions"}</p>}
      <div className="flex flex-col gap-3">
        {(rows ?? []).map((r, i) => (
          <div key={r.key} className="rounded-[var(--radius-container)] border border-rule bg-bg p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-mono text-[12px] font-semibold text-ink-3">Question {i + 1}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => split(i)}>
                  Split at cursor
                </Button>
                {i > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => join(i)}>
                    Join with previous
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => remove(r.key)}>
                  Remove
                </Button>
              </div>
            </div>
            <textarea
              aria-label={`Question ${i + 1}`}
              value={r.text}
              rows={2}
              onChange={(e) => patch(r.key, e.target.value)}
              onSelect={(e) => (caret.current[r.key] = e.target.selectionStart)}
              className={`${inputClass} min-h-16`}
            />
          </div>
        ))}
      </div>
      {rows && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setRows((rs) => [...rs, { key: createId(), text: "" }])}
        >
          Add a question
        </Button>
      )}
      {rows && rows.length === 0 && (
        <p className="mt-2 text-[12px] text-warning">A paper needs at least one question — add one, or cancel to keep the original split.</p>
      )}
    </ModalShell>
  );
};
