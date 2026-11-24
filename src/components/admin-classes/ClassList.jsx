import { useState } from "react";
import { Layers, Plus } from "lucide-react";
import { useSearchParams } from "react-router";
import { ClassCard } from "./ClassCard";
import { CreateClassModal } from "./CreateClassModal";
import { createClass, deleteClass } from "@/api/admin";
import { ConfirmDialog, EmptyState, PageError, PageFrame, PageHeader, PageLoading } from "@/components/common";
import { ActionMenu } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/useToast";
import { useUsers } from "@/hooks/useAdmin";
import { useClasses } from "@/hooks/useSubjects";

// ═══════════════════════════════════════════════════════════════
// ADMIN CLASSES — one card per class; the card opens the roster, the menu holds Delete.
// ═══════════════════════════════════════════════════════════════
export const ClassList = () => {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  // ?new=1 (from the admin home or the search menu) opens the form; closing removes it.
  const [createFlag, setCreateOpen] = useState(false);
  const createOpen = createFlag || params.get("new") === "1";
  const [confirmState, setConfirmState] = useState(null);
  const classesRes = useClasses();
  const usersRes = useUsers();

  if (classesRes.isLoading || usersRes.isLoading) return <PageLoading />;
  const loadError = classesRes.error || usersRes.error;
  if (loadError) {
    return <PageError error={loadError} onRetry={() => { classesRes.refetch(); usersRes.refetch(); }} />;
  }
  const classes = classesRes.data ?? [];
  const teacherChoices = (usersRes.data ?? []).filter((u) => u.role === "teacher");
  const students = classes.reduce((n, c) => n + c.studentCount, 0);

  const askDelete = (c) =>
    setConfirmState({
      title: `Delete "${c.name}"?`,
      message: `This removes the class, unassigns its ${c.studentCount} students and ${c.teachers.length} teacher(s) and removes its ${c.subjectCount} subjects. Their accounts stay active. A class can't be deleted while it has tests. This cannot be undone.`,
      confirmLabel: "Delete class",
      onConfirm: async () => {
        try {
          await deleteClass(c.id);
          toast.push(`Deleted "${c.name}"`, "info");
        } catch (err) {
          toast.push(err.message || "Couldn't delete the class", "error");
        }
      },
    });

  return (
    <PageFrame>
      <PageHeader
        crumbs={[{ label: "Administration", to: "/admin" }, { label: "Classes" }]}
        title="Classes"
        intro={`${classes.length} ${classes.length === 1 ? "class" : "classes"} · ${students} students enrolled. Open a class to see its roster, teachers and settings.`}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={15} aria-hidden="true" /> Create class
          </Button>
        }
      />

      {classes.length === 0 ? (
        <EmptyState
          icon={<Layers size={20} aria-hidden="true" />}
          title="No classes yet"
          body="Create a class, assign its teachers, then enroll students."
          action="Create class"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <ul className="grid gap-4 tablet:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {classes.map((c) => (
            <li key={c.id}>
              <ClassCard cls={c} level={2}>
                <ActionMenu label={`More actions for ${c.name}`} items={[{ id: "delete", label: "Delete class", danger: true, onSelect: () => askDelete(c) }]} />
              </ClassCard>
            </li>
          ))}
        </ul>
      )}

      <CreateClassModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          if (params.get("new")) setParams(new URLSearchParams(), { replace: true });
        }}
        onCreate={async (data) => {
          const made = await createClass(data);
          toast.push(`Class "${made.name}" created`, "success");
        }}
        teachers={teacherChoices}
      />
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        onConfirm={() => confirmState?.onConfirm?.()}
        onClose={() => setConfirmState(null)}
      />
    </PageFrame>
  );
};
