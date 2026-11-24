import { useState } from "react";
import { ArrowDownUp, AlertTriangle, ClipboardCheck, PencilLine } from "lucide-react";
import { EmptyState, MetricCard, PageError, PageLoading, TableShell, Td, Th } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useMyAudit } from "@/hooks/useAudit";
import { formatDateTime } from "@/lib/time";

const pct = (x) => `${Math.round(x * 100)}%`;
const PAGE = 50;

const Marks = ({ i }) =>
  i.afterMarks == null ? null : (
    <span className="font-mono tabular-nums">
      {i.beforeMarks != null && i.beforeMarks !== i.afterMarks ? `${i.beforeMarks} → ` : ""}
      {i.afterMarks}
      {i.max != null ? ` / ${i.max}` : ""}
    </span>
  );

// ═══════════════════════════════════════════════════════════════
// TEACHER: my grading history (own events only; the same record admins can see)
// ═══════════════════════════════════════════════════════════════
const TeacherAudit = () => {
  const [limit, setLimit] = useState(PAGE);
  const res = useMyAudit(limit);
  if (res.isLoading && !res.data) return <PageLoading />;
  if (res.error && !res.data) return <PageError error={res.error} onRetry={res.refetch} />;
  const { totals, items, nextCursor } = res.data;

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <div className="mb-5 text-[13px] font-medium text-ink-3">Insights <span>/</span> Grading history</div>
      <div className="mb-8 min-w-0">
        <h1 className="font-serif text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink tablet:text-[34px]">Grading history</h1>
        <p className="mt-2 max-w-[700px] text-[14px] leading-relaxed text-ink-2">
          Every mark you approved or changed, and the tests you published or edited. Vellum keeps this record so marks
          can be checked afterwards; administrators can see it too.
        </p>
      </div>

      <div className="bento mb-8">
        <MetricCard icon={ClipboardCheck} iconTone="primary" label="Answers reviewed" value={totals.reviewed} delta="Approved or changed" deltaTone="success" />
        <MetricCard icon={PencilLine} iconTone="primary" label="Changed from AI" value={totals.reviewed ? pct(totals.overrideRate) : "—"} delta={`${totals.overrides} marks`} deltaTone="success" />
        <MetricCard icon={ArrowDownUp} iconTone="neutral" label="Direction" value={`${totals.upward} up · ${totals.downward} down`} delta="Changes you made" deltaTone="success" />
        <MetricCard
          icon={AlertTriangle}
          iconTone={totals.afterRelease > 0 ? "danger" : "neutral"}
          label="After release"
          value={totals.afterRelease}
          delta={totals.afterRelease > 0 ? "Needed a reason" : "None"}
          deltaTone={totals.afterRelease > 0 ? "danger" : "success"}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState compact title="Nothing yet" body="Marks you approve or change, and tests you publish, will appear here." />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b border-rule-2">
              <Th>What</Th>
              <Th className="max-tablet:hidden">Test</Th>
              <Th className="max-tablet:hidden">Student</Th>
              <Th className="max-narrow:hidden">Marks</Th>
              <Th className="max-tablet:hidden">When</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.seq} className="border-b border-rule align-top last:border-b-0">
                <Td className="text-[13.5px] font-medium text-ink">
                  {i.label}
                  {i.afterRelease && <span className="ml-2 rounded-full border border-warning/30 bg-warning-dim px-2 py-0.5 text-[12px] font-medium text-warning">After release</span>}
                  {i.reason && <div className="mt-1 text-[12.5px] font-normal text-ink-2">Reason: “{i.reason}”</div>}
                  <div className="mt-1 space-y-0.5 text-[12px] font-normal text-ink-3 tablet:hidden">
                    <div>
                      {i.testTitle}
                      {i.studentName ? ` · ${i.studentName}` : ""}
                    </div>
                    <div>{formatDateTime(i.at)}</div>
                    <div className="narrow:hidden">
                      <Marks i={i} />
                    </div>
                  </div>
                </Td>
                <Td className="text-[13px] text-ink-2 max-tablet:hidden">{i.testTitle ?? "—"}</Td>
                <Td className="text-[13px] text-ink-2 max-tablet:hidden">{i.studentName ?? "—"}</Td>
                <Td className="text-[13px] max-narrow:hidden">
                  <Marks i={i} />
                </Td>
                <Td className="whitespace-nowrap font-mono text-[12px] text-ink-3 max-tablet:hidden">{formatDateTime(i.at)}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      {nextCursor && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => setLimit((l) => Math.min(l + PAGE, 500))}>
            Show more
          </Button>
        </div>
      )}
    </div>
  );
};

export default TeacherAudit;
