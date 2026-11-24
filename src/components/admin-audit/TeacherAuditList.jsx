import { useNavigate } from "react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { EmptyState, TableShell, Td, Th } from "@/components/common";
import { SeverityPill } from "./SignalList";

const pct = (x) => `${Math.round(x * 100)}%`;

const Signals = ({ s }) =>
  s.high + s.medium + s.low === 0 ? (
    <span className="text-ink-3">None</span>
  ) : (
    <span className="flex flex-wrap gap-1">
      {s.high > 0 && <SeverityPill level="high">{s.high} high</SeverityPill>}
      {s.medium > 0 && <SeverityPill level="medium">{s.medium} medium</SeverityPill>}
      {s.low > 0 && <SeverityPill level="low">{s.low} low</SeverityPill>}
    </span>
  );

export const TeacherAuditList = ({ teachers }) => {
  const navigate = useNavigate();
  if (teachers.length === 0) return <EmptyState compact title="No teachers yet" body="Create a teacher account first." />;
  const open = (t) => navigate(`/admin/audit/teachers/${t.teacherId}`);
  return (
    <TableShell>
      <thead>
        <tr className="border-b border-rule-2">
          <Th>Teacher</Th>
          <Th className="text-right max-narrow:hidden">Answers reviewed</Th>
          <Th className="text-right">Changed</Th>
          <Th className="max-tablet:hidden">Direction</Th>
          <Th>Signals</Th>
        </tr>
      </thead>
      <tbody>
        {teachers.map((t) => (
          <tr key={t.teacherId} onClick={() => open(t)} className="cursor-pointer border-b border-rule transition-colors last:border-b-0 hover:bg-raised/50">
            <Td className="text-[13.5px] font-medium text-ink">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  open(t);
                }}
                className="-my-1 inline-flex min-h-8 items-center rounded-sm text-left font-medium text-ink hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {t.name}
              </button>
              <div className="mt-0.5 text-[12px] font-normal text-ink-3">{t.classes.length ? `Class ${t.classes.join(", ")}` : "No classes"}</div>
            </Td>
            <Td className="text-right tabular-nums max-narrow:hidden">{t.reviewed}</Td>
            <Td className="text-right tabular-nums">
              {t.reviewed ? (
                <>
                  {t.overrides} <span className="text-ink-3">({pct(t.overrideRate)})</span>
                </>
              ) : (
                <span className="text-ink-3">—</span>
              )}
            </Td>
            <Td className="max-tablet:hidden">
              {t.upward + t.downward === 0 ? (
                <span className="text-ink-3">—</span>
              ) : (
                <span className="inline-flex items-center gap-3 tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <ArrowUp size={14} aria-hidden="true" /> {t.upward}
                    <span className="sr-only"> raised</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ArrowDown size={14} aria-hidden="true" /> {t.downward}
                    <span className="sr-only"> lowered</span>
                  </span>
                </span>
              )}
            </Td>
            <Td>
              <Signals s={t.signals} />
            </Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
};
