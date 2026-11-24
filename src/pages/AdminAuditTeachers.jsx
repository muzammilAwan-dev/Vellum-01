import { AuditTabs } from "@/components/admin-audit/AuditTabs";
import { TeacherAuditList } from "@/components/admin-audit/TeacherAuditList";
import { PageError, PageFrame, PageHeader, PageLoading } from "@/components/common";
import { useAuditTeachers } from "@/hooks/useAudit";

// ═══════════════════════════════════════════════════════════════
// ADMIN AUDIT: how each teacher marks (read-only, clues not proof)
// ═══════════════════════════════════════════════════════════════
const AdminAuditTeachers = () => {
  const res = useAuditTeachers();
  if (res.isLoading) return <PageLoading />;
  if (res.error) return <PageError error={res.error} onRetry={res.refetch} />;
  return (
    <PageFrame>
      <PageHeader
        crumbs={[{ label: "Administration", to: "/admin" }, { label: "Audit", to: "/admin/audit" }, { label: "Teachers" }]}
        title="Audit"
        intro="How each teacher marks compared with the AI's drafts and with other teachers. Signals are clues, not proof: open the grading trail behind them before drawing a conclusion."
      />
      <AuditTabs />
      <TeacherAuditList teachers={res.data ?? []} />
    </PageFrame>
  );
};

export default AdminAuditTeachers;
