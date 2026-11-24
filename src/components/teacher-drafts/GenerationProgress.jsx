import { Bento } from "@/components/common";

// ═══════════════════════════════════════════════════════════════
// GENERATION PROGRESS — what the server reports while it writes one test per
// student. `generation` = { done, total, etaSeconds?, currentStudent? }.
// ═══════════════════════════════════════════════════════════════
export const GenerationProgress = ({ generation }) => {
  const { done, total, etaSeconds, currentStudent } = generation;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <Bento className="mb-6 border-primary/30 bg-primary-soft">
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 size-4 shrink-0 animate-spin-slow rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <strong className="text-[13.5px] font-semibold text-primary">Generating personalized tests</strong>
            <span className="font-mono text-[12.5px] tabular-nums text-primary" aria-live="polite">
              {done} of {total} ready
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Personalized tests generated"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-primary/15"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
            {currentStudent ? `Now writing ${currentStudent}'s test` : "Finishing up"}
            {etaSeconds ? ` · about ${etaSeconds} s left` : ""}. The finished ones are listed below to look through;
            editing and publishing unlock when all {total} are ready.
          </p>
        </div>
      </div>
    </Bento>
  );
};
