import { useParams } from "react-router";
import { TeacherProfileAudit } from "@/components/admin-audit/TeacherProfileAudit";
import { Avatar, PageError, PageFrame, PageHeader, PageLoading } from "@/components/common";
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
    <PageFrame>
      <PageHeader
        crumbs={[{ label: "Administration", to: "/admin" }, { label: "Audit", to: "/admin/audit" }, { label: "Teachers", to: "/admin/audit/teachers" }, { label: teacher.name }]}
        title={
          <span className="flex items-center gap-4">
            <Avatar name={teacher.name} size="lg" tone="teacher" decorative />
            <span className="min-w-0">{teacher.name}</span>
          </span>
        }
        intro={`${teacher.classes.length ? `Teaches ${teacher.classes.join(", ")}` : "No classes"} · ${teacher.email}`}
      />
      <TeacherProfileAudit data={res.data} />
    </PageFrame>
  );
};

export default AdminAuditTeacher;
