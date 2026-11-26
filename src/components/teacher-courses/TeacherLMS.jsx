import { useState } from "react";
import { BookOpen, ExternalLink, Plus } from "lucide-react";
import { LessonEditor } from "./LessonEditor";
import { Bento, ConfirmDialog, EmptyState, Field, ModalShell, PageError, PageHeader, PageLoading, Scope, inputClass } from "@/components/common";
import { ActionMenu } from "@/components/ui/menu";
import { LessonIcon } from "@/components/common/lms/LessonIcon";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/useApp";
import { useToast } from "@/context/useToast";
import { addLesson, createCourse, deleteCourse, deleteLesson, renameCourse, reorderLessons, updateLesson } from "@/api/courses";
import { useCourses } from "@/hooks/useCourses";
import { useTests } from "@/hooks/useTests";
import { moveId } from "@/lib/lms";

// ═══════════════════════════════════════════════════════════════
// TEACHER LMS — the courses of the chosen subject (GET /courses?subjectId=).
// Every change goes to the server; lessons are ordered with up/down buttons.
// ═══════════════════════════════════════════════════════════════
const CourseNameModal = ({ course, onClose, onSave }) => {
  const [title, setTitle] = useState(course?.title ?? "");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const submit = async () => {
    if (!title.trim()) return toast.push("Give the course a title", "error");
    setSaving(true);
    try {
      await onSave(title.trim());
      onClose();
    } catch (err) {
      toast.push(err.message || "Couldn't save the course", "error");
      setSaving(false);
    }
  };
  return (
    <ModalShell
      open
      onClose={onClose}
      title={course ? "Rename course" : "New course"}
      maxWidth="480px"
      footer={
        <>
          <Button onClick={onClose} variant="ghost">Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : course ? "Save" : "Create course"}</Button>
        </>
      }
    >
      <Field label="Course title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. Physics — Newtonian Mechanics"
          autoFocus
          maxLength={140}
          className={inputClass}
        />
      </Field>
    </ModalShell>
  );
};

export const TeacherLMS = ({ onOpenDiscussion }) => {
  const toast = useToast();
  const { activeSubject, scopeLoading } = useApp();
  const { data: courses, isLoading, error, refetch } = useCourses({ subjectId: activeSubject?.id });
  const { data: allTests } = useTests();
  const [editor, setEditor] = useState(null); // { course, lesson|null }
  const [courseModal, setCourseModal] = useState(null); // { course|null }
  const [confirm, setConfirm] = useState(null);

  const relatedTests = (allTests ?? []).filter((t) => t.subjectId === activeSubject?.id && t.status !== "draft");
  const run = async (fn, okMessage) => {
    try {
      await fn();
      if (okMessage) toast.push(okMessage, "info");
    } catch (err) {
      toast.push(err.message || "That didn't work", "error");
    }
  };
  const move = (course, lesson, direction) =>
    run(() => reorderLessons(course.id, moveId(course.lessons.map((l) => l.id), lesson.id, direction)));

  const header = (
    <PageHeader
      crumbs={[{ label: <Scope /> }, { label: "Courses" }]}
      title="Courses"
      intro="Post lesson content alongside your tests. Students work through it at their own pace and mark each lesson done."
      actions={
        <>
          {onOpenDiscussion && <Button onClick={onOpenDiscussion} variant="outline">Discussion</Button>}
          {activeSubject && (
            <Button onClick={() => setCourseModal({ course: null })}>
              <Plus size={14} aria-hidden="true" /> New course
            </Button>
          )}
        </>
      }
    />
  );

  let body;
  if (scopeLoading || (isLoading && activeSubject)) body = <PageLoading />;
  else if (!activeSubject) body = <EmptyState title="Choose a subject" body="Pick a class and subject in the sidebar to see its courses." />;
  else if (error) body = <PageError error={error} onRetry={refetch} />;
  else if (courses.length === 0)
    body = (
      <EmptyState
        title="No courses yet"
        body={`Create the first ${activeSubject.name} course, then add lessons to it.`}
        action="New course"
        onAction={() => setCourseModal({ course: null })}
      />
    );
  else
    body = (
      <div className="flex flex-col gap-3">
        {courses.map((c) => (
          <Bento key={c.id} className="!p-0 overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
              <div className="flex min-w-0 items-start gap-3.5">
                <div className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-primary-dim text-primary">
                  <BookOpen size={18} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">{c.title}</h2>
                  <div className="mt-1 font-mono text-[12px] text-ink-3">
                    {c.subject} · {c.students} students · {c.lessons.length} {c.lessons.length === 1 ? "lesson" : "lessons"}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button onClick={() => setEditor({ course: c, lesson: null })} variant="outline" size="sm">
                  <Plus size={12} aria-hidden="true" /> Add lesson
                </Button>
                <ActionMenu
                  label={`Actions for ${c.title}`}
                  items={[
                    { id: "rename", label: "Rename", onSelect: () => setCourseModal({ course: c }) },
                    {
                      id: "delete",
                      label: "Delete course",
                      danger: true,
                      separatorBefore: true,
                      onSelect: () =>
                        setConfirm({
                          title: "Delete this course?",
                          message: `“${c.title}” and its ${c.lessons.length} lessons will be removed, along with every student's progress on them.`,
                          confirmLabel: "Delete course",
                          onConfirm: () => run(() => deleteCourse(c.id), "Course deleted"),
                        }),
                    },
                  ]}
                />
              </div>
            </div>

            <div className="flex flex-col divide-y divide-rule">
              {c.lessons.length === 0 && <div className="py-8 text-center text-[13px] text-ink-3">No lessons yet. Add the first one.</div>}
              {c.lessons.map((l, i) => (
                <div key={l.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-5 py-3.5">
                  <LessonIcon kind={l.kind} size={30} />
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="line-clamp-2 text-[13.5px] font-medium leading-snug text-ink [overflow-wrap:anywhere]">{l.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[12px] text-ink-3">
                      <span>{l.duration}</span>
                      {l.url && (
                        <>
                          <span>·</span>
                          <a href={l.url} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-6 items-center gap-1 rounded-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 pointer-coarse:min-h-8">
                            Open source <ExternalLink size={11} aria-hidden="true" />
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                        </>
                      )}
                      {l.testId && (
                        <>
                          <span>·</span>
                          <span title="Related test">test: {relatedTests.find((t) => t.id === l.testId)?.title ?? "linked"}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 whitespace-nowrap font-mono text-[12px] text-ink-3">
                    {l.doneCount} / {c.students} done
                  </div>
                  {/* Reorder, edit and delete in one menu: Move up/down only where it can move. */}
                  <ActionMenu
                    label={`Actions for lesson “${l.title}”`}
                    items={[
                      ...(i > 0 ? [{ id: "up", label: "Move up", onSelect: () => move(c, l, "up") }] : []),
                      ...(i < c.lessons.length - 1 ? [{ id: "down", label: "Move down", onSelect: () => move(c, l, "down") }] : []),
                      { id: "edit", label: "Edit lesson", onSelect: () => setEditor({ course: c, lesson: l }) },
                      {
                        id: "delete",
                        label: "Delete lesson",
                        danger: true,
                        separatorBefore: true,
                        onSelect: () =>
                          setConfirm({
                            title: "Delete this lesson?",
                            message: `“${l.title}” will be removed for everyone, along with their progress on it.`,
                            confirmLabel: "Delete lesson",
                            onConfirm: () => run(() => deleteLesson(l.id), "Lesson removed"),
                          }),
                      },
                    ]}
                  />
                </div>
              ))}
            </div>
          </Bento>
        ))}
      </div>
    );

  return (
    <div className="mx-auto max-w-[1360px] px-5 py-6 tablet:px-10 tablet:py-8">
      {header}
      {body}

      <LessonEditor
        open={Boolean(editor)}
        lesson={editor?.lesson}
        tests={relatedTests}
        onClose={() => setEditor(null)}
        onSave={(fields) => (editor.lesson ? updateLesson(editor.lesson.id, fields) : addLesson(editor.course.id, fields))}
      />
      {courseModal && (
        <CourseNameModal
          course={courseModal.course}
          onClose={() => setCourseModal(null)}
          onSave={(title) =>
            courseModal.course ? renameCourse(courseModal.course.id, title) : createCourse({ subjectId: activeSubject.id, title })
          }
        />
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        onConfirm={() => {
          const go = confirm?.onConfirm;
          setConfirm(null);
          go?.();
        }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
};
