import { AlertTriangle, ArrowRight, BookOpen, Building2, CheckCircle2, ChevronRight, Info, Layers, Presentation, ShieldAlert, ShieldCheck, UserPlus, Users } from "lucide-react";
import { Link } from "react-router";
import { PageError, PageFrame, PageLoading, StatGrid, StatTile } from "@/components/common";
import { useUsers } from "@/hooks/useAdmin";
import { useAuditIntegrity, useAuditTeachers } from "@/hooks/useAudit";
import { useBranding, usePrivacy } from "@/hooks/useInstitution";
import { useNow } from "@/hooks/useNow";
import { useClasses, useSubjects } from "@/hooks/useSubjects";
import { ClassCard } from "@/components/admin-classes/ClassCard";
import { buildAttention } from "@/lib/adminHome";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/time";

const TONE = {
  danger: { Icon: ShieldAlert, chip: "bg-danger-dim text-danger", bar: "bg-danger" },
  attention: { Icon: AlertTriangle, chip: "bg-warning-dim text-warning", bar: "bg-warning" },
  info: { Icon: Info, chip: "bg-primary-dim text-primary", bar: "bg-primary/60" },
};

// One row of the "Needs your attention" list: the whole row is the link.
const AttentionRow = ({ item }) => {
  const t = TONE[item.tone];
  return (
    <li>
      <Link
        to={item.to}
        className="group relative flex items-start gap-3.5 px-5 py-4 transition-colors hover:bg-raised/60 focus-visible:bg-raised/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 max-narrow:px-4"
      >
        <span aria-hidden="true" className={cn("absolute inset-y-3 left-0 w-[3px] rounded-r", t.bar)} />
        <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", t.chip)}>
          <t.Icon size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-ink">{item.title}</span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-3">{item.detail}</span>
        </span>
        <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-primary max-narrow:sr-only">
          {item.cta}
          <ArrowRight size={14} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
        </span>
        <ChevronRight size={16} aria-hidden="true" className="mt-2 shrink-0 text-ink-3 narrow:hidden" />
      </Link>
    </li>
  );
};

const QuickLink = ({ to, icon: Icon, children }) => (
  <Link
    to={to}
    className="group flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[13.5px] font-medium text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50"
  >
    <Icon size={16} aria-hidden="true" className="shrink-0 text-ink-3 group-hover:text-primary" />
    <span className="flex-1">{children}</span>
    <ChevronRight size={15} aria-hidden="true" className="text-ink-3" />
  </Link>
);

const Panel = ({ title, children, className, aside }) => (
  <section aria-label={title} className={cn("overflow-hidden rounded-[var(--radius-container)] border border-rule bg-surface shadow-[var(--shadow-card)]", className)}>
    <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3.5 max-narrow:px-4">
      <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
      {aside}
    </div>
    {children}
  </section>
);

// ═══════════════════════════════════════════════════════════════
// ADMIN HOME — what needs the administrator today, then the shape of the institution.
// ═══════════════════════════════════════════════════════════════
const AdminDashboard = () => {
  const usersRes = useUsers();
  const classesRes = useClasses();
  const subjectsRes = useSubjects();
  // Secondary sources: the page renders without them; their items simply wait.
  const { data: privacy } = usePrivacy();
  const { data: integrity } = useAuditIntegrity();
  const { data: auditTeachers } = useAuditTeachers();
  const { data: branding } = useBranding();
  const now = useNow(60_000);

  if (usersRes.isLoading || classesRes.isLoading || subjectsRes.isLoading) return <PageLoading />;
  const loadError = usersRes.error || classesRes.error || subjectsRes.error;
  if (loadError) {
    return <PageError error={loadError} onRetry={() => { usersRes.refetch(); classesRes.refetch(); subjectsRes.refetch(); }} />;
  }
  const users = usersRes.data ?? [];
  const classes = classesRes.data ?? [];
  const teachers = users.filter((u) => u.role === "teacher");
  const students = users.filter((u) => u.role === "student");
  const inactive = (list) => list.filter((u) => !u.active).length;
  const noTeacher = classes.filter((c) => !c.teachers.length).length;
  const attention = buildAttention({ users, classes, privacy, integrity, auditTeachers });
  const today = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const urgent = attention.filter((a) => a.tone !== "info").length;

  return (
    <PageFrame>
      <header className="mb-8">
        <p className="mb-2 text-[13px] font-medium text-ink-3">Administration · {today}</p>
        <h1 className="font-serif text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink tablet:text-[34px]">
          {branding?.name ?? "Overview"}
        </h1>
        <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-ink-2">
          {attention.length === 0
            ? "Everything is in order. Accounts, classes and the audit record need nothing from you today."
            : urgent
              ? `${urgent} ${urgent === 1 ? "thing needs" : "things need"} your attention, and ${attention.length - urgent} to keep an eye on.`
              : `Nothing urgent. ${attention.length} ${attention.length === 1 ? "item" : "items"} to keep an eye on.`}
        </p>
      </header>

      <div className="mb-10 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          title="Needs your attention"
          aside={attention.length > 0 && <span className="rounded-full bg-raised px-2 py-0.5 text-[12px] font-semibold tabular-nums text-ink-2">{attention.length}</span>}
        >
          {attention.length === 0 ? (
            <div className="flex items-start gap-3.5 px-5 py-6">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-success-dim text-success">
                <CheckCircle2 size={16} aria-hidden="true" />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-ink">All in order</p>
                <p className="mt-0.5 text-[13px] text-ink-3">No open signals, every class has a teacher and every student has a class.</p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-rule">
              {attention.map((item) => <AttentionRow key={item.id} item={item} />)}
            </ul>
          )}
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel title="Audit record">
            <div className="px-5 py-4 max-narrow:px-4">
              {integrity ? (
                <div className="flex items-start gap-3">
                  {integrity.ok ? <ShieldCheck size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-success" /> : <ShieldAlert size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-danger" />}
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ink">{integrity.ok ? "Intact" : "Altered"}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">
                      {integrity.total} events · checked {formatDateTime(integrity.verifiedAt)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-ink-3">Checking…</p>
              )}
              <Link to="/admin/audit" className="mt-3 inline-flex min-h-8 items-center gap-1 rounded-sm text-[13px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40">
                Open audit <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </Panel>
          <Panel title="Quick actions">
            <div className="p-2">
              <QuickLink to="/admin/users?new=1" icon={UserPlus}>Create an account</QuickLink>
              <QuickLink to="/admin/classes?new=1" icon={Layers}>Create a class</QuickLink>
              <QuickLink to="/admin/institution" icon={Building2}>Institution settings</QuickLink>
            </div>
          </Panel>
        </div>
      </div>

      <section aria-labelledby="home-numbers" className="mb-10">
        <h2 id="home-numbers" className="mb-3 text-[14px] font-semibold text-ink">At a glance</h2>
        <StatGrid>
          <StatTile icon={Presentation} label="Teachers" value={teachers.length} to="/admin/users?role=teacher"
            caption={inactive(teachers) ? `${inactive(teachers)} inactive` : "All active"} tone={inactive(teachers) ? "attention" : "good"} />
          <StatTile icon={Users} label="Students" value={students.length} to="/admin/users?role=student"
            caption={inactive(students) ? `${inactive(students)} inactive` : "All active"} tone={inactive(students) ? "attention" : "good"} />
          <StatTile icon={Layers} label="Classes" value={classes.length} to="/admin/classes"
            caption={noTeacher ? `${noTeacher} without a teacher` : "Every class has a teacher"} tone={noTeacher ? "attention" : "good"} />
          <StatTile icon={BookOpen} label="Subjects" value={(subjectsRes.data ?? []).length} caption="Across all classes" />
        </StatGrid>
      </section>

      <section aria-labelledby="home-classes">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="home-classes" className="text-[14px] font-semibold text-ink">
            Classes <span className="font-medium text-ink-3">· {classes.length}</span>
          </h2>
          <Link to="/admin/classes" className="inline-flex min-h-8 items-center gap-1 rounded-sm px-1 text-[13px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40">
            Manage classes <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <ul className="grid gap-4 tablet:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <li key={c.id}>
              <ClassCard cls={c} />
            </li>
          ))}
        </ul>
      </section>
    </PageFrame>
  );
};

export default AdminDashboard;
