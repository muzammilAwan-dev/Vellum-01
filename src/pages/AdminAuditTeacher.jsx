import { Link, useParams } from "react-router";
import { TeacherProfileAudit } from "@/components/admin-audit/TeacherProfileAudit";
import { PageError, PageLoading } from "@/components/common";
import { useAuditTeacher } from "@/hooks/useAudit";

// ═══════════════════════════════════════════════════════════════
// ADMIN AUDIT: one teacher's marking profile (read-only; opening it is logged)
// ═══════════════════════════════════════════════════════════════
const AdminAuditTeacher = () => {
  const { teacherId } = useParams();
  const res = useAuditTeacher(teacherId);
  if (res.isLoading) return <PageLoading />;
  if (res.error) return <PageError error={res.error} onRetry={res.refetch} />;
  const { teacher } = res.data;
  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      <div className="mb-5 flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink-3">
        Administration <span>/</span>
        <Link to="/admin/audit/teachers" className="rounded-sm hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40">
          Audit
        </Link>
        <span>/</span> <span className="min-w-0 truncate text-ink-2">{teacher.name}</span>
      </div>
      <div className="mb-8 min-w-0">
        <h1 className="font-serif text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink tablet:text-[34px]">{teacher.name}</h1>
        <p className="mt-2 text-[14px] text-ink-2">
          {teacher.classes.length ? `Class ${teacher.classes.join(", ")}` : "No classes"} · {teacher.email}
        </p>
      </div>
      <TeacherProfileAudit data={res.data} />
    </div>
  );
};

export default AdminAuditTeacher;
