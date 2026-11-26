import { useState } from "react";
import { EmptyState, PageError, PageHeader, PageLoading, Scope, TableShell, Td, Th } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useMyAudit } from "@/hooks/useAudit";
import { formatDateTime } from "@/lib/time";

const pct = (x) => `${Math.round(x * 100)}%`;
const PAGE = 50;

const Marks = ({ i }) =>
  i.afterMarks == null ? null : (
    <span className="font-mono tabular-nums">
      {i.beforeMarks != null && i.beforeMarks !== i.afterMarks ? <>{i.beforeMarks} <span aria-label="changed to">→</span> </> : ""}
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
      <PageHeader
        crumbs={[{ label: <Scope /> }, { label: "Grading history" }]}
        title="Grading history"
        intro="Every mark you approved or changed, and the tests you published or edited. Vellum keeps this record so marks can be checked afterwards; administrators can see it too."
      />

      {/* One summary sentence; tiles of zeros said nothing to a new teacher. */}
      <p className="mb-6 text-[13.5px] leading-relaxed text-ink-2">
        {totals.reviewed === 0 ? (
          "You haven't reviewed any answers yet."
        ) : (
          <>
            <span className="font-semibold text-ink">{totals.reviewed} {totals.reviewed === 1 ? "answer" : "answers"} reviewed</span>
            {" · "}
            {totals.overrides} changed from the AI's mark ({pct(totals.overrideRate)})
            {totals.overrides > 0 && <>, {totals.upward} up and {totals.downward} down</>}
            {totals.afterRelease > 0 && (
              <span className="font-medium text-warning"> · {totals.afterRelease} after results were released (each needed a reason)</span>
            )}
            .
          </>
        )}
      </p>

      {items.length === 0 ? (
        <EmptyState compact title="Nothing yet" body="Marks you approve or change, and tests you publish, will appear here." />
      ) : (
        <TableShell label="Grading history">
          <thead>
            <tr className="border-b border-rule-2">
              <Th>What happened</Th>
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
