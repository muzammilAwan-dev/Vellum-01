import { useState } from "react";
import { ModalShell, PageError, SearchField } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useBank } from "@/hooks/useBank";
import { typeLabel } from "@/lib/questions";

// ═══════════════════════════════════════════════════════════════
// QUICK SWAP — replace one question in a draft with a bank question.
// Same-topic questions come first. The swapped-in question keeps its own
// marks and answer key; the teacher can still edit it afterwards.
// ═══════════════════════════════════════════════════════════════
export const SwapQuestionModal = ({ open, onClose, subjectId, question, usedBankIds = [], onPick }) => {
  const { data, isLoading, error, refetch } = useBank(open ? subjectId : null);
  const [query, setQuery] = useState("");
  if (!open) return null;

  const q = query.trim().toLowerCase();
  // Never offer the question being replaced (same bank id or the same words), nor one already in the test.
  const same = (a = "", b = "") => a.toLowerCase().replace(/\s+/g, " ").trim() === b.toLowerCase().replace(/\s+/g, " ").trim();
  const rows = (data ?? [])
    .filter((b) => !usedBankIds.includes(b.id) && b.id !== question?.bankId && !same(b.text, question?.text))
    .filter((b) => !q || b.text.toLowerCase().includes(q) || b.topic.toLowerCase().includes(q))
    .sort((a, b) => Number(b.topic === question?.topic) - Number(a.topic === question?.topic) || Number(b.type === question?.type) - Number(a.type === question?.type));

  return (
    <ModalShell open={open} onClose={onClose} title="Swap this question" maxWidth="720px" footer={<Button variant="ghost" onClick={onClose}>Cancel</Button>}>
      <p className="mb-3 text-[12.5px] leading-relaxed text-ink-2">
        Replacing <span className="font-medium text-ink">“{(question?.text ?? "").slice(0, 80)}{(question?.text ?? "").length > 80 ? "…" : ""}”</span> with a
        question from your bank. Questions on the same topic are listed first.
      </p>
      <SearchField label="Search the bank" value={query} onChange={setQuery} placeholder="Search the bank…" className="mb-3" />
      {isLoading && <p className="py-6 text-center text-[13px] text-ink-3">Loading…</p>}
      {error && <PageError error={error} onRetry={refetch} />}
      {!isLoading && !error && rows.length === 0 && (
        <p className="py-6 text-center text-[13px] text-ink-3">
          {(data ?? []).length ? "No bank questions match." : "Your bank is empty — publish a test or add questions first."}
        </p>
      )}
      <div className="flex max-h-[52vh] flex-col gap-2 overflow-y-auto">
        {rows.map((b) => (
          <div key={b.id} className="flex items-start gap-3 rounded-[var(--radius-control)] border border-rule bg-bg px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] leading-snug text-ink">{b.text}</div>
              <div className="mt-1 flex flex-wrap gap-2 font-mono text-[12px] text-ink-3">
                <span>{typeLabel(b.type)}</span>
                <span>· {b.marks} {b.marks === 1 ? "mark" : "marks"}</span>
                <span>· {b.topic}</span>
                {b.topic === question?.topic && <span className="font-semibold text-primary">· same topic</span>}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => onPick(b)}>
              Use this
            </Button>
          </div>
        ))}
      </div>
    </ModalShell>
  );
};
