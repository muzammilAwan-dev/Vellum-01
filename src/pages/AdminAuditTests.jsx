import { AuditTabs } from "@/components/admin-audit/AuditTabs";
import { AuditTestList } from "@/components/admin-audit/AuditTestList";
import { PageError, PageLoading } from "@/components/common";
import { useAuditTests } from "@/hooks/useAudit";

// ═══════════════════════════════════════════════════════════════
// ADMIN AUDIT: tests with grading activity (read-only)
// ═══════════════════════════════════════════════════════════════
const AdminAuditTests = () => {
  const res = useAuditTests();
  if (res.isLoading) return <PageLoading />;
  if (res.error) return <PageError error={res.error} onRetry={res.refetch} />;
  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <div className="mb-5 flex items-center gap-2 text-[13px] font-medium text-ink-3">
        Administration <span className="text-ink-3">/</span> Audit
      </div>
      <div className="mb-6 min-w-0">
        <h1 className="font-serif text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink tablet:text-[34px]">
          Audit
        </h1>
        <p className="mt-2 max-w-[680px] text-[14px] leading-relaxed text-ink-2">
          Open a test to see, for every written answer, what the student wrote, what the AI drafted and what the
          teacher did with it. The record is read-only, and opening a test is itself recorded.
        </p>
      </div>
      <AuditTabs />
      <AuditTestList tests={res.data ?? []} />
    </div>
  );
};

export default AdminAuditTests;
