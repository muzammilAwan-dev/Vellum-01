import { AuditTabs } from "@/components/admin-audit/AuditTabs";
import { TeacherAuditList } from "@/components/admin-audit/TeacherAuditList";
import { PageError, PageLoading } from "@/components/common";
import { useAuditTeachers } from "@/hooks/useAudit";

// ═══════════════════════════════════════════════════════════════
// ADMIN AUDIT: how each teacher marks (read-only, clues not proof)
// ═══════════════════════════════════════════════════════════════
const AdminAuditTeachers = () => {
  const res = useAuditTeachers();
  if (res.isLoading) return <PageLoading />;
  if (res.error) return <PageError error={res.error} onRetry={res.refetch} />;
  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <div className="mb-5 flex items-center gap-2 text-[13px] font-medium text-ink-3">
        Administration <span>/</span> Audit
      </div>
      <div className="mb-6 min-w-0">
        <h1 className="font-serif text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink tablet:text-[34px]">Audit</h1>
        <p className="mt-2 max-w-[680px] text-[14px] leading-relaxed text-ink-2">
          How each teacher marks compared with the AI's drafts and with other teachers. Signals are clues, not proof:
          open the grading trail behind them before drawing a conclusion.
        </p>
      </div>
      <AuditTabs />
      <TeacherAuditList teachers={res.data ?? []} />
    </div>
  );
};

export default AdminAuditTeachers;
