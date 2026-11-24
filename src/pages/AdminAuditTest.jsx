import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { AlertTriangle, ClipboardCheck, PencilLine, Sparkles } from "lucide-react";
import { GradingTrail } from "@/components/admin-audit/GradingTrail";
import { TrailFilters } from "@/components/admin-audit/TrailFilters";
import { PageError, PageFrame, PageHeader, PageLoading, StatGrid, StatTile } from "@/components/common";
import { useAuditTrail } from "@/hooks/useAudit";
import { TRAIL_FILTERS, filterTrailRows } from "@/lib/auditTrail";

// ═══════════════════════════════════════════════════════════════
// ADMIN AUDIT: one test's grading trail (read-only)
// ═══════════════════════════════════════════════════════════════
const AdminAuditTest = () => {
  const { testId } = useParams();
  const res = useAuditTrail(testId);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => res.data?.rows ?? [], [res.data]);
  const counts = useMemo(
    () => Object.fromEntries(TRAIL_FILTERS.map((f) => [f.id, filterTrailRows(rows, { filter: f.id }).length])),
    [rows],
  );
  const shown = useMemo(() => filterTrailRows(rows, { filter, query }), [rows, filter, query]);

  if (res.isLoading) return <PageLoading />;
  if (res.error) return <PageError error={res.error} onRetry={res.refetch} />;
  const { test, totals, nextCursor } = res.data;

  return (
    <PageFrame>
      <PageHeader
        crumbs={[{ label: "Administration", to: "/admin" }, { label: "Audit", to: "/admin/audit" }, { label: "Tests", to: "/admin/audit/tests" }, { label: test.title }]}
        title={test.title}
        intro={`${test.subject} · ${test.cls}${test.teacher ? ` · ${test.teacher}` : ""} · results released ${test.settings.release === "immediately" ? "immediately" : "after the test closes"} · AI grading ${test.settings.aiGrading ? "on" : "off"}`}
      />

      <StatGrid className="mb-8">
        <StatTile icon={Sparkles} label="Written answers" value={totals.answers} caption="Marked by the AI or the teacher" />
        <StatTile icon={PencilLine} label="Overridden" value={totals.overridden} caption="Teacher changed the AI mark" tone={totals.overridden ? "attention" : "neutral"} />
        <StatTile icon={AlertTriangle} label="Changed after release" value={totals.afterRelease} caption={totals.afterRelease > 0 ? "Changed once students could see it" : "None"} tone={totals.afterRelease > 0 ? "danger" : "good"} />
        <StatTile icon={ClipboardCheck} label="Awaiting teacher" value={totals.pending} caption={totals.pending ? "Not final yet" : "All final"} tone={totals.pending ? "attention" : "good"} />
      </StatGrid>

      <TrailFilters filter={filter} onFilter={setFilter} query={query} onQuery={setQuery} counts={counts} />
      {nextCursor && (
        <p className="mb-3 text-[12.5px] text-ink-3">Showing the first {rows.length} answers; narrow the test or ask for the next page in a later step.</p>
      )}
      <GradingTrail
        rows={shown}
        onClear={() => {
          setFilter("all");
          setQuery("");
        }}
      />
    </PageFrame>
  );
};

export default AdminAuditTest;
