import { useNavigate } from "react-router";
import { EmptyState, StatusDot, TableShell, Td, Th } from "@/components/common";
import { cn } from "@/lib/cn";

const STATUS_TONE = { draft: "muted", scheduled: "primary", live: "live", completed: "success" };
const STATUS_LABEL = { draft: "Draft", scheduled: "Scheduled", live: "Live now", completed: "Completed" };

// Count cell: muted zero, emphasised when the number deserves a look.
const Count = ({ n, warn = false }) => (
  <span className={cn("tabular-nums", n === 0 ? "text-ink-3" : warn ? "font-semibold text-warning" : "text-ink")}>{n}</span>
);

export const AuditTestList = ({ tests }) => {
  const navigate = useNavigate();
  if (tests.length === 0) {
    return <EmptyState compact title="No published tests yet" body="Once a teacher publishes a test, its grading trail appears here." />;
  }
  const open = (t) => navigate(`/admin/audit/tests/${t.testId}`);
  return (
    <TableShell>
      <thead>
        <tr className="border-b border-rule-2">
          <Th>Test</Th>
          <Th className="max-tablet:hidden">Teacher</Th>
          <Th className="max-narrow:hidden">Status</Th>
          <Th className="text-right max-narrow:hidden">Written answers</Th>
          <Th className="text-right">Changed by teacher</Th>
          <Th className="text-right max-narrow:hidden">After release</Th>
          <Th className="text-right max-tablet:hidden">Awaiting teacher</Th>
        </tr>
      </thead>
      <tbody>
        {tests.map((t) => (
          <tr
            key={t.testId}
            onClick={() => open(t)}
            className="cursor-pointer border-b border-rule transition-colors last:border-b-0 hover:bg-raised/50"
          >
            <Td className="text-[13.5px] font-medium text-ink">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  open(t);
                }}
                className="-my-1 inline-flex min-h-8 items-center rounded-sm text-left font-medium text-ink hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {t.title}
              </button>
              <div className="mt-0.5 text-[12px] font-normal text-ink-3">
                {t.subject} · {t.cls}
                <span className="tablet:hidden"> · {t.teacher || "No teacher"}</span>
              </div>
              <div className="mt-1.5 font-normal narrow:hidden">
                <StatusDot tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</StatusDot>
              </div>
            </Td>
            <Td className="text-[13px] text-ink-2 max-tablet:hidden">{t.teacher || "—"}</Td>
            <Td className="max-narrow:hidden">
              <StatusDot tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</StatusDot>
            </Td>
            <Td className="text-right max-narrow:hidden">
              <Count n={t.answers} />
            </Td>
            <Td className="text-right">
              <Count n={t.overridden} warn />
            </Td>
            <Td className="text-right max-narrow:hidden">
              <Count n={t.afterRelease} warn />
            </Td>
            <Td className="text-right max-tablet:hidden">
              <Count n={t.pending} />
            </Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
};
