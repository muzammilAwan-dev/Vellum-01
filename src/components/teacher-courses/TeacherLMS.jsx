import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, ExternalLink, Pencil, Plus } from "lucide-react";
import { LessonEditor } from "./LessonEditor";
import { Bento, ConfirmDialog, EmptyState, Field, ModalShell, PageError, PageLoading, Scope, inputClass } from "@/components/common";
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
    <>
      <div className="mb-5 flex items-center gap-2 text-[13px] font-medium text-ink-3">
        <Scope /> <span className="text-ink-3">/</span> Courses
      </div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-[28px] font-semibold tablet:text-[34px] leading-[1.1] tracking-[-0.02em] text-ink">
            Courses <span className="text-ink-3">&amp; lessons</span>
          </h1>
          <p className="mt-2 max-w-[680px] text-[14px] leading-relaxed text-ink-2">
            Post lesson content alongside your tests. Students work through at their own pace and mark each one done.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenDiscussion && <Button onClick={onOpenDiscussion} variant="outline">Discussion</Button>}
          {activeSubject && (
            <Button onClick={() => setCourseModal({ course: null })}>
              <Plus size={14} /> New course
            </Button>
          )}
        </div>
      </div>
    </>
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
                  <div className="font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">{c.title}</div>
                  <div className="mt-1 font-mono text-[12px] text-ink-3">
                    {c.subject} · {c.students} students · {c.lessons.length} {c.lessons.length === 1 ? "lesson" : "lessons"}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button onClick={() => setCourseModal({ course: c })} variant="ghost" size="sm" aria-label={`Rename ${c.title}`}>
                  <Pencil size={13} /> Rename
                </Button>
                <Button
                  onClick={() =>
                    setConfirm({
                      title: "Delete this course?",
                      message: `“${c.title}” and its ${c.lessons.length} lessons will be removed, along with every student's progress on them.`,
                      confirmLabel: "Delete course",
                      onConfirm: () => run(() => deleteCourse(c.id), "Course deleted"),
                    })
                  }
                  variant="ghost"
                  size="sm"
                >
                  Delete
                </Button>
                <Button onClick={() => setEditor({ course: c, lesson: null })} variant="outline" size="sm">
                  <Plus size={12} /> Add lesson
                </Button>
              </div>
            </div>

            <div className="flex flex-col divide-y divide-rule">
              {c.lessons.length === 0 && <div className="py-8 text-center text-[13px] text-ink-3">No lessons yet. Add the first one.</div>}
              {c.lessons.map((l, i) => (
                <div key={l.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-5 py-3.5">
                  <LessonIcon kind={l.kind} size={30} />
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="truncate text-[13.5px] font-medium text-ink">{l.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[12px] text-ink-3">
                      <span>{l.duration}</span>
                      {l.url && (
                        <>
                          <span>·</span>
                          <a href={l.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                            source <ExternalLink size={10} />
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
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(c, l, "up")}
                      disabled={i === 0}
                      aria-label={`Move “${l.title}” up`}
                      className="grid size-8 place-items-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-raised hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(c, l, "down")}
                      disabled={i === c.lessons.length - 1}
                      aria-label={`Move “${l.title}” down`}
                      className="grid size-8 place-items-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-raised hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditor({ course: c, lesson: l })}
                      className="rounded-[var(--radius-control)] px-2.5 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-raised hover:text-ink"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirm({
                          title: "Delete this lesson?",
                          message: `“${l.title}” will be removed for everyone, along with their progress on it.`,
                          confirmLabel: "Delete lesson",
                          onConfirm: () => run(() => deleteLesson(l.id), "Lesson removed"),
                        })
                      }
                      className="rounded-[var(--radius-control)] px-2.5 py-1.5 text-[12px] font-medium text-ink-3 transition-colors hover:bg-danger-dim hover:text-danger"
                    >
                      Delete
                    </button>
                  </div>
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
