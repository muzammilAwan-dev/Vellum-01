import { Link } from "react-router";
import { AlertTriangle, ArrowDownUp, ClipboardCheck, PencilLine } from "lucide-react";
import { StatGrid, StatTile, TableShell, Td, Th } from "@/components/common";
import { SignalList } from "./SignalList";

const pct = (x) => `${Math.round(x * 100)}%`;

export const TeacherProfileAudit = ({ data }) => {
  const { stats, peerMedianRate, signals, students, tests } = data;
  const testTitles = Object.fromEntries(tests.map((t) => [t.testId, t.title]));
  return (
    <>
      <StatGrid className="mb-8">
        <StatTile icon={ClipboardCheck} label="Answers reviewed" value={stats.reviewed} caption="Approved or changed by this teacher" />
        <StatTile
          icon={PencilLine}
          label="Changed from the AI"
          value={stats.reviewed ? pct(stats.overrideRate) : "—"}
          caption={peerMedianRate === null ? "No other teachers to compare with" : `Other teachers: about ${pct(peerMedianRate)}`}
        />
        <StatTile
          icon={ArrowDownUp}
          label="Raised / lowered"
          value={`${stats.upward} / ${stats.downward}`}
          caption={stats.upward + stats.downward ? `Average change ${stats.avgDelta > 0 ? "+" : ""}${stats.avgDelta.toFixed(1)} marks` : "No changes yet"}
        />
        <StatTile
          icon={AlertTriangle}
          label="Changed after release"
          value={stats.afterRelease}
          caption={stats.afterRelease > 0 ? "Changed once students could see it" : "None"}
          tone={stats.afterRelease > 0 ? "danger" : "good"}
        />
      </StatGrid>

      <h2 className="mb-1 text-[16px] font-semibold text-ink">Signals</h2>
      <p className="mb-3 text-[13px] text-ink-3">Signals are clues, not proof. Marks change for good reasons; check the grading trail before drawing a conclusion.</p>
      <div className="mb-10">
        <SignalList signals={signals} testTitles={testTitles} />
      </div>

      <div className="grid gap-8 tablet:grid-cols-2">
        <section>
          <h2 className="mb-3 text-[16px] font-semibold text-ink">Changes by student</h2>
          {students.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">No marks changed yet.</p>
          ) : (
            <TableShell>
              <thead>
                <tr className="border-b border-rule-2">
                  <Th>Student</Th>
                  <Th className="text-right">Raised</Th>
                  <Th className="text-right">Lowered</Th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b border-rule last:border-b-0">
                    <Td className="text-[13.5px] font-medium text-ink">{s.name}</Td>
                    <Td className="text-right tabular-nums">{s.upward}</Td>
                    <Td className="text-right tabular-nums">{s.downward}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-[16px] font-semibold text-ink">Tests marked</h2>
          {tests.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">Nothing marked yet.</p>
          ) : (
            <TableShell>
              <thead>
                <tr className="border-b border-rule-2">
                  <Th>Test</Th>
                  <Th className="text-right">Reviewed</Th>
                  <Th className="text-right">Changed</Th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.testId} className="border-b border-rule last:border-b-0">
                    <Td className="text-[13.5px] font-medium text-ink">
                      <Link to={`/admin/audit/tests/${t.testId}`} className="rounded-sm hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40">
                        {t.title}
                      </Link>
                    </Td>
                    <Td className="text-right tabular-nums">{t.reviewed}</Td>
                    <Td className="text-right tabular-nums">{t.overrides}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </section>
      </div>
    </>
  );
};
