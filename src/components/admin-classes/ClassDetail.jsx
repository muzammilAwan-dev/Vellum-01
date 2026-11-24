import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, BookOpen, Presentation, Settings2, UserPlus, Users } from "lucide-react";
import { ClassSettingsModal } from "./ClassSettingsModal";
import { Avatar, EmptyState, PageFrame, PageHeader, SearchField, Segmented, StatGrid, StatTile, TabPanel, Tabs } from "@/components/common";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

// Averages under this are marked in the roster (a pass mark, not a grade boundary).
const LOW = 50;
const TABS_ID = "class-detail";

// ═══════════════════════════════════════════════════════════════
// CLASS DETAIL
// ═══════════════════════════════════════════════════════════════
export const ClassDetail = ({ cls, roster, teachers, onAddStudent, onRemoveStudent, onUpdateClass, onDeleteClass }) => {
  const [tab, setTab] = useState("students");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const students = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? roster.students.filter((s) => s.name.toLowerCase().includes(q) || (s.roll ?? "").toLowerCase().includes(q)) : [...roster.students];
    if (sort === "avg") list.sort((a, b) => (a.average ?? 101) - (b.average ?? 101));
    else list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [roster.students, search, sort]);

  const stats = useMemo(() => {
    const active = roster.students.filter((s) => s.active).length;
    const scored = roster.students.filter((s) => s.average != null);
    const avg = scored.length ? Math.round(scored.reduce((sum, s) => sum + s.average, 0) / scored.length) : null;
    return { active, avg, total: roster.students.length, low: scored.filter((s) => s.average < LOW).length };
  }, [roster.students]);

  return (
    <PageFrame>
      <PageHeader
        crumbs={[{ label: "Administration", to: "/admin" }, { label: "Classes", to: "/admin/classes" }, { label: cls.name }]}
        title={cls.name}
        titleNote={<span className="rounded-md bg-primary-dim px-2 py-1 font-mono text-[12.5px] font-bold tracking-wider text-primary">{cls.code}</span>}
        intro={`${roster.teachers.length} ${roster.teachers.length === 1 ? "teacher" : "teachers"} · ${stats.total} ${stats.total === 1 ? "student" : "students"} · ${cls.subjectCount} ${cls.subjectCount === 1 ? "subject" : "subjects"}`}
        actions={
          <>
            <Button onClick={() => setSettingsOpen(true)} variant="outline">
              <Settings2 size={15} aria-hidden="true" /> Class settings
            </Button>
            <Button onClick={onAddStudent}>
              <UserPlus size={15} aria-hidden="true" /> Add student
            </Button>
          </>
        }
      />

      <StatGrid className="mb-8">
        <StatTile icon={Users} label="Students" value={stats.total} caption={stats.total === stats.active ? "All active" : `${stats.total - stats.active} inactive`} tone={stats.total === stats.active ? "good" : "attention"} />
        <StatTile icon={Presentation} label="Teachers" value={roster.teachers.length} caption={roster.teachers.length ? roster.teachers.map((t) => t.name).join(", ") : "None assigned yet"} tone={roster.teachers.length ? "neutral" : "attention"} />
        <StatTile
          icon={BarChart3}
          label="Class average"
          value={stats.avg ?? "—"}
          unit={stats.avg == null ? undefined : "%"}
          caption={stats.avg == null ? "No graded tests yet" : stats.low ? `${stats.low} ${stats.low === 1 ? "student" : "students"} under ${LOW}%` : `Everyone at ${LOW}% or above`}
          tone={stats.avg == null ? "neutral" : stats.low ? "attention" : "good"}
        />
        <StatTile icon={BookOpen} label="Subjects" value={cls.subjectCount} caption="Taught in this class" />
      </StatGrid>

      <Tabs
        label="Class members"
        idBase={TABS_ID}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "students", label: "Students", count: stats.total },
          { id: "teachers", label: "Teachers", count: roster.teachers.length },
        ]}
        className="mb-4"
      />

      <TabPanel idBase={TABS_ID} id="students" className={tab === "students" ? undefined : "hidden"}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <SearchField label="Search students" value={search} onChange={setSearch} placeholder="Name or roll no." className="flex-1 narrow:max-w-[340px]" />
          <Segmented label="Sort by" size="sm" value={sort} onChange={setSort} options={[{ value: "name", label: "Name" }, { value: "avg", label: "Lowest average" }]} />
          <p className="ml-auto text-[12.5px] tabular-nums text-ink-3" aria-live="polite">
            {students.length} of {stats.total}
          </p>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-container)] border border-rule bg-surface shadow-[var(--shadow-card)]">
          {students.length === 0 ? (
            <EmptyState
              compact
              title={roster.students.length ? "No students match" : "No students yet"}
              body={roster.students.length ? "Try a different name or roll number." : "Add the first student to this class."}
              action={search ? "Clear search" : roster.students.length ? undefined : "Add student"}
              onAction={search ? () => setSearch("") : onAddStudent}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-rule-2 bg-sunken/40">
                    <th className="px-3 py-2.5 text-left text-[12px] font-semibold text-ink-3 narrow:px-4">Name</th>
                    <th className="px-4 py-2.5 text-left text-[12px] font-semibold text-ink-3 max-narrow:hidden">Roll no.</th>
                    <th className="px-4 py-2.5 text-left text-[12px] font-semibold text-ink-3 max-tablet:hidden">Email</th>
                    <th className="px-3 py-2.5 text-right text-[12px] font-semibold text-ink-3 narrow:px-4">Average</th>
                    <th className="px-4 py-2.5 text-left text-[12px] font-semibold text-ink-3 max-narrow:hidden">Status</th>
                    <th className="w-24 px-3 py-2.5 narrow:px-4">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const low = s.average != null && s.average < LOW;
                    return (
                      <tr key={s.id} className="border-b border-rule transition-colors last:border-b-0 hover:bg-raised/40">
                        <td className="px-3 py-3 narrow:px-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar name={s.name} src={s.photoUrl} size="sm" decorative />
                            <div className="min-w-0">
                              <div className="truncate text-[13.5px] font-medium text-ink">{s.name}</div>
                              <div className="text-[12px] text-ink-3 narrow:hidden">
                                {s.roll} · {s.active ? "Active" : "Inactive"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[12.5px] text-ink-2 max-narrow:hidden">{s.roll}</td>
                        <td className="px-4 py-3 text-[12.5px] text-ink-3 max-tablet:hidden">{s.email}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right narrow:px-4">
                          {s.average == null ? (
                            <span className="text-[13px] text-ink-3">—</span>
                          ) : (
                            <span className={cn("inline-flex items-center gap-1.5 text-[13.5px] font-semibold tabular-nums", low ? "text-warning" : "text-ink")}>
                              {low && <AlertTriangle size={13} aria-hidden="true" />}
                              {s.average}%{low && <span className="sr-only"> (under {LOW}%)</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[12.5px] font-medium max-narrow:hidden">
                          <span className={s.active ? "text-success" : "text-ink-3"}>{s.active ? "Active" : "Inactive"}</span>
                        </td>
                        <td className="px-2 py-2 text-right narrow:px-4">
                          <button
                            type="button"
                            onClick={() => onRemoveStudent?.(s)}
                            aria-label={`Remove ${s.name} from the class`}
                            className="inline-flex min-h-9 items-center rounded-[var(--radius-control)] px-3 text-[12.5px] font-medium text-ink-3 transition-colors hover:bg-danger-dim hover:text-danger focus-visible:ring-2 focus-visible:ring-ring/40"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </TabPanel>

      <TabPanel idBase={TABS_ID} id="teachers" className={tab === "teachers" ? undefined : "hidden"}>
        {roster.teachers.length === 0 ? (
          <EmptyState compact title="No teachers yet" body="Assign a teacher in the class settings." action="Class settings" onAction={() => setSettingsOpen(true)} />
        ) : (
          <ul className="overflow-hidden rounded-[var(--radius-container)] border border-rule bg-surface shadow-[var(--shadow-card)]">
            {roster.teachers.map((t, i) => (
              <li key={t.id} className={cn("flex items-center gap-4 px-5 py-4", i > 0 && "border-t border-rule")}>
                <Avatar name={t.name} src={t.photoUrl} size="md" tone="teacher" decorative />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-ink">{t.name}</div>
                  <div className="truncate text-[12.5px] text-ink-3">{t.email}</div>
                </div>
                <div className="shrink-0 text-[12.5px] tabular-nums text-ink-3">
                  Teaches <b className="font-semibold text-ink">{t.classCount}</b> {t.classCount === 1 ? "class" : "classes"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </TabPanel>

      <ClassSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        cls={cls}
        availableTeachers={teachers}
        currentTeacherIds={roster.teachers.map((t) => t.id)}
        onSave={(data) => onUpdateClass?.(data)}
        onDelete={() => {
          setSettingsOpen(false);
          onDeleteClass?.();
        }}
      />
    </PageFrame>
  );
};
