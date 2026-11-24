import { ShieldAlert, ShieldCheck } from "lucide-react";
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
        "mb-8 flex flex-wrap items-start gap-4 rounded-[var(--radius-container)] border p-5 shadow-[var(--shadow-card)]",
        ok ? "border-rule bg-surface" : "border-danger/40 bg-danger-dim",
      )}
    >
      <Icon aria-hidden="true" size={28} className={cn("mt-0.5 shrink-0", ok ? "text-success" : "text-danger")} />
      <div className="min-w-0 flex-1">
        <h2 className="text-[16px] font-semibold text-ink">{ok ? "The audit record is intact" : "The audit record has been altered"}</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
          {ok
            ? `${data.checked} events checked; none edited, removed or reordered. The latest is #${data.lastSeq}.`
            : `Event #${data.badSeq} can't be trusted: ${REASON[data.reason] ?? "it does not verify"}. Everything after it is in doubt.`}
        </p>
        <p className="mt-2 text-[12px] text-ink-3">
          Checked {formatDateTime(data.verifiedAt)} · latest fingerprint <span className="font-mono">{data.headHash.slice(0, 16)}…</span>
        </p>
        <p className="mt-1 text-[12px] text-ink-3">
          The record is tamper-evident: edits can't be hidden from this check. In this browser demo anyone with access to
          the browser can still change the stored data; the real server protects it.
        </p>
      </div>
      <Button variant="outline" onClick={onVerify} disabled={busy}>
        {busy ? "Checking…" : "Verify now"}
      </Button>
    </section>
  );
};
