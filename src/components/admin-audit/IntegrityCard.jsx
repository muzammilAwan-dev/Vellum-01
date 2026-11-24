import { ShieldAlert, ShieldCheck } from "lucide-react";
import { USE_MOCK } from "@/api/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/time";

const REASON = {
  hash: "its contents no longer match its fingerprint",
  prev: "it no longer links to the event before it",
  seq: "an event is missing or out of order",
};

// Tamper-evident, not tamper-proof: the check proves the record is unchanged, and
// would show if anyone edited or removed an entry.
export const IntegrityCard = ({ data, busy, onVerify }) => {
  const ok = data.ok;
  const Icon = ok ? ShieldCheck : ShieldAlert;
  return (
    <section
      aria-label="Audit record integrity"
      className={cn(
        "mb-8 rounded-[var(--radius-container)] border p-5 shadow-[var(--shadow-card)] max-narrow:p-4",
        ok ? "border-rule bg-surface" : "border-danger/40 bg-danger-dim",
      )}
    >
      <div className="flex flex-col gap-4 narrow:flex-row narrow:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", ok ? "bg-success-dim text-success" : "bg-danger text-on-danger")}>
            <Icon aria-hidden="true" size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-ink">{ok ? "The audit record is intact" : "The audit record has been altered"}</h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
              {ok
                ? `${data.checked} events checked; none edited, removed or reordered. The latest is #${data.lastSeq}.`
                : `Event #${data.badSeq} can't be trusted: ${REASON[data.reason] ?? "it does not verify"}. Everything after it is in doubt.`}
            </p>
            <p className="mt-2 text-[12.5px] text-ink-3">
              Checked {formatDateTime(data.verifiedAt)} · fingerprint <span className="font-mono [overflow-wrap:anywhere]">{data.headHash.slice(0, 16)}…</span>
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={onVerify} disabled={busy} className="shrink-0 max-narrow:w-full">
          {busy ? "Checking…" : "Verify now"}
        </Button>
      </div>
      <details className="group mt-4 border-t border-rule pt-3 text-[12.5px] text-ink-3">
        <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-sm font-medium text-ink-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">›</span> How this check works
        </summary>
        <p className="mt-2 max-w-[70ch] leading-relaxed">
          Every event carries a fingerprint of itself and of the event before it, like links in a chain. Editing, removing or reordering any event breaks
          the chain from that point, so the change can't be hidden from this check.
          {USE_MOCK && " In this browser demo anyone with access to the browser can still change the stored data; the real server protects it."}
        </p>
      </details>
    </section>
  );
};
