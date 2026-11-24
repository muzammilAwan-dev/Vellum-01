import { Link } from "react-router";
import { AlertTriangle, Activity, ShieldCheck } from "lucide-react";
import { AuditTabs } from "@/components/admin-audit/AuditTabs";
import { EventList } from "@/components/admin-audit/EventList";
import { IntegrityCard } from "@/components/admin-audit/IntegrityCard";
import { MetricCard, PageError, PageLoading } from "@/components/common";
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

  const sig = (teachers.data ?? []).reduce((a, t) => ({ high: a.high + t.signals.high, medium: a.medium + t.signals.medium, low: a.low + t.signals.low }), { high: 0, medium: 0, low: 0 });
  const flagged = (teachers.data ?? []).filter((t) => t.signals.high + t.signals.medium + t.signals.low > 0).length;

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <div className="mb-5 flex items-center gap-2 text-[13px] font-medium text-ink-3">
        Administration <span>/</span> Audit
      </div>
      <div className="mb-6 min-w-0">
        <h1 className="font-serif text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink tablet:text-[34px]">Audit</h1>
        <p className="mt-2 max-w-[680px] text-[14px] leading-relaxed text-ink-2">
          A record of who did what in Vellum, kept so marks and results can be checked afterwards. Nobody, including
          administrators, can edit it.
        </p>
      </div>
      <AuditTabs />

      <IntegrityCard data={integrity.data} busy={integrity.isFetching} onVerify={integrity.refetch} />

      <div className="bento mb-8">
        <MetricCard icon={Activity} iconTone="primary" label="Events recorded" value={integrity.data.total} delta={`Latest is #${integrity.data.lastSeq}`} deltaTone="success" />
        <MetricCard
          icon={AlertTriangle}
          iconTone={sig.high > 0 ? "danger" : "neutral"}
          label="High signals"
          value={sig.high}
          delta={sig.high > 0 ? "Worth a look first" : "None"}
          deltaTone={sig.high > 0 ? "danger" : "success"}
        />
        <MetricCard icon={ShieldCheck} iconTone="neutral" label="Teachers with signals" value={flagged} delta={`${sig.medium} medium · ${sig.low} low`} deltaTone="success" />
      </div>

      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-[16px] font-semibold text-ink">Latest activity</h2>
        <Link to="/admin/audit/events" className="rounded-sm text-[13px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40">
          See all events
        </Link>
      </div>
      <EventList events={recent.data.events} names={recent.data.names} compact />
    </div>
  );
};

export default AdminAuditOverview;
