import { useState } from "react";
import { Download } from "lucide-react";
import { AuditTabs } from "@/components/admin-audit/AuditTabs";
import { EventFilters } from "@/components/admin-audit/EventFilters";
import { EMPTY_FILTERS, dayEnd, dayStart } from "@/lib/auditEvents";
import { EventList } from "@/components/admin-audit/EventList";
import { PageError, PageFrame, PageHeader, PageLoading } from "@/components/common";
import { Button } from "@/components/ui/button";
import { fetchAllAuditEvents, logAuditExport } from "@/api/audit";
import { useToast } from "@/context/useToast";
import { useAuditEvents } from "@/hooks/useAudit";
import { downloadCsv } from "@/lib/csv";
import { EVENT_CSV_HEADER, eventsToCsvRows } from "@/lib/auditEvents";

const PAGE = 50;
const MAX = 500;

// ═══════════════════════════════════════════════════════════════
// ADMIN AUDIT: every event, filterable, exportable (the export is itself logged)
// ═══════════════════════════════════════════════════════════════
const AdminAuditEvents = () => {
  const toast = useToast();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const wire = { ...filters, from: dayStart(filters.from), to: dayEnd(filters.to) };
  const res = useAuditEvents(wire, limit);

  const change = (next) => {
    setFilters(next);
    setLimit(PAGE);
  };

  const exportCsv = async () => {
    setBusy(true);
    try {
      const { events, names, truncated } = await fetchAllAuditEvents(wire);
      downloadCsv(`vellum-audit-${new Date().toISOString().slice(0, 10)}.csv`, EVENT_CSV_HEADER, eventsToCsvRows(events, names));
      await logAuditExport(events.length);
      toast.push(truncated ? `Exported the newest ${events.length} events (the limit)` : `Exported ${events.length} events`, "success");
    } catch (err) {
      toast.push(err?.message || "Couldn't export — try again", "error");
    } finally {
      setBusy(false);
    }
  };

  if (res.isLoading && !res.data) return <PageLoading />;
  if (res.error && !res.data) return <PageError error={res.error} onRetry={res.refetch} />;
  const { events, names, total, nextCursor, facets } = res.data;

  return (
    <PageFrame>
      <PageHeader
        crumbs={[{ label: "Administration", to: "/admin" }, { label: "Audit", to: "/admin/audit" }, { label: "Events" }]}
        title="Audit"
        intro="Every recorded event, newest first, grouped by day. Exporting is recorded too."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={busy || total === 0}>
            <Download size={15} aria-hidden="true" /> {busy ? "Exporting…" : "Export CSV"}
          </Button>
        }
      />
      <AuditTabs />
      <EventFilters value={filters} onChange={change} actors={facets.actors} onClear={() => change(EMPTY_FILTERS)} />
      <p className="mb-3 text-[12.5px] text-ink-3" aria-live="polite">
        {total} {total === 1 ? "event" : "events"}
        {Object.values(filters).some(Boolean) ? " match" : ""}
        {events.length < total ? ` · showing the newest ${events.length}` : ""}
      </p>
      <EventList events={events} names={names} />
      {nextCursor && limit < MAX && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => setLimit((l) => Math.min(l + PAGE, MAX))}>
            Show {Math.min(PAGE, total - events.length)} more
          </Button>
        </div>
      )}
      {nextCursor && limit >= MAX && <p className="mt-4 text-center text-[12.5px] text-ink-3">Showing the newest {MAX}. Narrow the filters or export to see the rest.</p>}
    </PageFrame>
  );
};

export default AdminAuditEvents;
