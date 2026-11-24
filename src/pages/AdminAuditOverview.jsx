import { Link } from "react-router";
import { Activity, AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import { AuditTabs } from "@/components/admin-audit/AuditTabs";
import { EventList } from "@/components/admin-audit/EventList";
import { IntegrityCard } from "@/components/admin-audit/IntegrityCard";
import { PageError, PageFrame, PageHeader, PageLoading, StatGrid, StatTile } from "@/components/common";
import { useAuditEvents, useAuditIntegrity, useAuditTeachers } from "@/hooks/useAudit";

const NO_FILTERS = {};

// ═══════════════════════════════════════════════════════════════
// ADMIN AUDIT: overview (is the record intact, what stands out, latest activity)
// ═══════════════════════════════════════════════════════════════
const AdminAuditOverview = () => {
  const integrity = useAuditIntegrity();
  const teachers = useAuditTeachers();
  const recent = useAuditEvents(NO_FILTERS, 10);

  const failed = [integrity, teachers, recent].find((r) => r.error);
  if (failed) return <PageError error={failed.error} onRetry={failed.refetch} />;
  if (integrity.isLoading || teachers.isLoading || recent.isLoading) return <PageLoading />;

  const list = teachers.data ?? [];
  const sig = list.reduce((a, t) => ({ high: a.high + t.signals.high, medium: a.medium + t.signals.medium, low: a.low + t.signals.low }), { high: 0, medium: 0, low: 0 });
  const flagged = list.filter((t) => t.signals.high + t.signals.medium + t.signals.low > 0).length;
  const highTeachers = list.filter((t) => t.signals.high > 0);
  const highLink = highTeachers.length === 1 ? `/admin/audit/teachers/${highTeachers[0].teacherId}` : "/admin/audit/teachers";

  return (
    <PageFrame>
      <PageHeader
        crumbs={[{ label: "Administration", to: "/admin" }, { label: "Audit" }]}
        title="Audit"
        intro="A record of who did what, kept so marks and results can be checked afterwards. Nobody, including administrators, can edit it."
      />
      <AuditTabs />

      <IntegrityCard data={integrity.data} busy={integrity.isFetching} onVerify={integrity.refetch} />

      <StatGrid className="mb-10">
        <StatTile icon={Activity} label="Events recorded" value={integrity.data.total} caption={`Latest is #${integrity.data.lastSeq}`} to="/admin/audit/events" />
        <StatTile
          icon={AlertTriangle}
          label="High signals"
          value={sig.high}
          caption={sig.high > 0 ? `Worth a look first · ${highTeachers.map((t) => t.name).join(", ")}` : "None"}
          tone={sig.high > 0 ? "danger" : "good"}
          to={sig.high > 0 ? highLink : undefined}
        />
        <StatTile
          icon={ShieldCheck}
          label="Teachers with signals"
          value={flagged}
          caption={flagged ? `${sig.medium} medium · ${sig.low} low` : "No signals"}
          tone={flagged ? "attention" : "good"}
          to="/admin/audit/teachers"
        />
      </StatGrid>

      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-[16px] font-semibold text-ink">Latest activity</h2>
        <Link to="/admin/audit/events" className="inline-flex min-h-8 items-center gap-1 rounded-sm px-1 text-[13px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40">
          See all events <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <EventList events={recent.data.events} names={recent.data.names} compact />
    </PageFrame>
  );
};

export default AdminAuditOverview;
