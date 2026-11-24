import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { AlertTriangle, ClipboardCheck, PencilLine, Sparkles } from "lucide-react";
import { GradingTrail } from "@/components/admin-audit/GradingTrail";
import { TrailFilters } from "@/components/admin-audit/TrailFilters";
import { MetricCard, PageError, PageLoading } from "@/components/common";
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
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <div className="mb-5 flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink-3">
        Administration <span>/</span>
        <Link to="/admin/audit/tests" className="rounded-sm hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40">
          Audit
        </Link>
        <span>/</span> <span className="min-w-0 truncate text-ink-2">{test.title}</span>
      </div>

      <div className="mb-8 min-w-0">
        <h1 className="font-serif text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink tablet:text-[34px]">
          {test.title}
        </h1>
        <p className="mt-2 max-w-[720px] text-[14px] leading-relaxed text-ink-2">
          {test.subject} · {test.cls}
          {test.teacher ? ` · ${test.teacher}` : ""} · results released {test.settings.release === "immediately" ? "immediately" : "after the test closes"} ·
          AI grading {test.settings.aiGrading ? "on" : "off"}
        </p>
      </div>

      <div className="bento mb-8">
        <MetricCard icon={Sparkles} iconTone="primary" label="Written answers" value={totals.answers} delta="Marked by AI or teacher" deltaTone="success" />
        <MetricCard icon={PencilLine} iconTone="primary" label="Overridden" value={totals.overridden} delta="Teacher changed the AI mark" deltaTone="success" />
        <MetricCard
          icon={AlertTriangle}
          iconTone={totals.afterRelease > 0 ? "danger" : "neutral"}
          label="After release"
          value={totals.afterRelease}
          delta={totals.afterRelease > 0 ? "Changed once students could see it" : "None"}
          deltaTone={totals.afterRelease > 0 ? "danger" : "success"}
        />
        <MetricCard icon={ClipboardCheck} iconTone="neutral" label="Awaiting teacher" value={totals.pending} delta="Not final yet" deltaTone="success" />
      </div>

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
    </div>
  );
};

export default AdminAuditTest;
