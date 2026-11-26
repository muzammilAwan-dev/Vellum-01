import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useToast } from "@/context/useToast";
import { cn } from "@/lib/cn";
import { isChoice, typeLabel } from "@/lib/questions";
import { Button } from "@/components/ui/button";

// ═══════════════════════════════════════════════════════════════
// TEST PREVIEW
// ═══════════════════════════════════════════════════════════════
export const TestPreview = ({ title = "Test preview", forStudent, questions = [], onExit }) => {
  const toast = useToast();
  const [qIndex, setQIndex] = useState(0);
  const q = questions[qIndex];
  if (!q) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center">
        <div>
          <p className="mb-4 text-[14px] text-ink-2">This test has no questions yet.</p>
          <Button onClick={onExit} variant="outline">Back to draft</Button>
        </div>
      </div>
    );
  }
  const isText = !isChoice(q);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-primary/30 bg-bg/85 px-4 py-3 backdrop-blur-xl tablet:px-8">
        {/* The test name is the page's h1; the "preview" note sits under it on phones, beside it on wide screens. */}
        <div className="flex min-w-0 flex-col gap-0.5 narrow:flex-row narrow:items-center narrow:gap-3.5">
          <h1 className="min-w-0 truncate font-display text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
            {title}
          </h1>
          <span className="w-fit max-w-full truncate whitespace-nowrap rounded-full border border-primary/25 bg-primary-soft px-2 py-0.5 text-[12px] font-semibold text-primary">
            {forStudent ? `Student view · ${forStudent}` : "Student view"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button
            onClick={onExit} variant="outline" size="sm"
          >
            Exit preview
          </Button>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-12 tablet:px-8 tablet:py-16">
        <div className="w-full max-w-[680px]">
          <div className="mb-10 flex gap-1">
            {questions.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-0.5 flex-1 rounded-sm transition-colors duration-300",
                  i < qIndex
                    ? "bg-ink-3"
                    : i === qIndex
                      ? "bg-gradient-to-r from-primary to-primary-2 shadow-[0_0_8px_var(--color-primary-dim)]"
                      : "bg-rule",
                )}
              />
            ))}
          </div>

          <div className="mb-5 flex items-center justify-between text-[13px] font-medium text-ink-3">
            <span>
              Question {qIndex + 1} of {questions.length} · {typeLabel(q.type)}
            </span>
            <span>{q.marks} marks</span>
          </div>

          <h2 className="mb-9 whitespace-pre-wrap font-display text-[22px] font-normal leading-snug tracking-[-0.015em] text-ink narrow:text-[26px]">
            {q.text}
          </h2>

          {!isText && q.options && (
            <div className="flex flex-col gap-2">
              {q.options.map((o, i) => (
                <button
                  key={i}
                  disabled
                  className="flex cursor-default items-center gap-4 rounded-[var(--radius-container)] border border-rule-2 bg-surface px-5 py-4 text-left text-[15px] text-ink opacity-85"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-raised font-mono text-[12px] font-semibold">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span>{o}</span>
                </button>
              ))}
            </div>
          )}

          {isText && (
            <div className="min-h-[180px] rounded-[var(--radius-container)] border border-rule-2 bg-surface px-4 py-4 text-[15px] text-ink-3">
              Students type their answer here…
            </div>
          )}

          <p className="mt-6 text-center text-[12.5px] text-ink-3">This is what students see. Answers can't be chosen in the preview.</p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button
              disabled={qIndex === 0}
              onClick={() => setQIndex(qIndex - 1)} variant="ghost"
            >
              <ArrowLeft size={14} aria-hidden="true" /> Previous
            </Button>
            <Button
              onClick={() => {
                if (qIndex === questions.length - 1) {
                  toast.push("End of preview", "info");
                  onExit();
                } else setQIndex(qIndex + 1);
              }}
            >
              {qIndex === questions.length - 1 ? "Finish preview" : <>Next <ArrowRight size={14} aria-hidden="true" /></>}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};
