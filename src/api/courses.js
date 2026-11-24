import { call } from "./client";

// ═══════════════════════════════════════════════════════════════
// COURSES & LESSONS API — see API-CONTRACT.md ("Courses & lessons").
// A course belongs to a subject; its lessons are ordered; each student marks
// lessons done. Reads happen through hooks/useCourses (GET /courses).
// ═══════════════════════════════════════════════════════════════
const refresh = [["courses"]];

/** POST /api/courses — { subjectId, title } → course (teacher view). 400 INVALID_COURSE. */
export const createCourse = (body) => call("/courses", { method: "POST", body, invalidates: refresh });

/** PUT /api/courses/:id — { title } → course. */
export const renameCourse = (id, title) => call(`/courses/${id}`, { method: "PUT", body: { title }, invalidates: refresh });

/** DELETE /api/courses/:id — also removes its lessons and everyone's progress on them. */
export const deleteCourse = (id) => call(`/courses/${id}`, { method: "DELETE", invalidates: refresh });

/** POST /api/courses/:id/lessons — { kind, title, duration?, body?, url?, testId? } → course. 400 INVALID_LESSON | INVALID_TEST. */
export const addLesson = (courseId, lesson) =>
  call(`/courses/${courseId}/lessons`, { method: "POST", body: lesson, invalidates: refresh });

/** PUT /api/lessons/:id — same body as addLesson → course. */
export const updateLesson = (id, lesson) => call(`/lessons/${id}`, { method: "PUT", body: lesson, invalidates: refresh });

/** DELETE /api/lessons/:id → course (remaining lessons renumbered). */
export const deleteLesson = (id) => call(`/lessons/${id}`, { method: "DELETE", invalidates: refresh });

/** PUT /api/courses/:id/lessons/order — { ids: [lessonId…] } (every lesson exactly once) → course. 400 INVALID_ORDER. */
export const reorderLessons = (courseId, ids) =>
  call(`/courses/${courseId}/lessons/order`, { method: "PUT", body: { ids }, invalidates: refresh });

/** PUT /api/lessons/:id/progress — student: { done: boolean } → the student's course view. Idempotent. */
export const setLessonDone = (id, done) =>
  call(`/lessons/${id}/progress`, { method: "PUT", body: { done }, invalidates: refresh });
