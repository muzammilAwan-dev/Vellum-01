import { AuditTabs } from "@/components/admin-audit/AuditTabs";
import { AuditTestList } from "@/components/admin-audit/AuditTestList";
import { PageError, PageFrame, PageHeader, PageLoading } from "@/components/common";
import { useAuditTests } from "@/hooks/useAudit";

// ═══════════════════════════════════════════════════════════════
// ADMIN AUDIT: tests with grading activity (read-only)
// ═══════════════════════════════════════════════════════════════
const AdminAuditTests = () => {
  const res = useAuditTests();
  if (res.isLoading) return <PageLoading />;
  if (res.error) return <PageError error={res.error} onRetry={res.refetch} />;
  return (
    <PageFrame>
      <PageHeader
        crumbs={[{ label: "Administration", to: "/admin" }, { label: "Audit", to: "/admin/audit" }, { label: "Tests" }]}
        title="Audit"
        intro="Open a test to see, for every written answer, what the student wrote, what the AI drafted and what the teacher did with it. The record is read-only, and opening a test is itself recorded."
      />
      <AuditTabs />
      <AuditTestList tests={res.data ?? []} />
    </PageFrame>
  );
};

export default AdminAuditTests;
