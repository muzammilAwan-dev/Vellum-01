import { call } from "./client";

// ═══════════════════════════════════════════════════════════════
// ANALYTICS API (API-CONTRACT.md "Analytics"). The server computes everything
// from graded attempts; the client only draws it.
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/analytics/me — the signed-in student's own progress.
 * → { student, trend: [{ t, testId, label, at, you, class }], topics: [{ name,
 * accuracy, trend[] }], summary: { tests, awaiting, average, latest, classLatest,
 * changeSinceFirst, aheadOfClass, testsAhead, startedAhead, strongest, weakest } }
 */
export const getMyAnalytics = () => call("/analytics/me");

/**
 * GET /api/analytics/class?classId=&subjectId= — teacher: one class + subject.
 * → { cls, subject, trend: [{ t, testId, label, at, class, spread, students }],
 * topics: [{ name, accuracy, affected, trend[] }], students: [{ id, name, roll,
 * tests, overall, weak, strong, flags }], summary: { tests, awaiting,
 * classAverage, changeSinceFirst, spread, belowTarget[], topicsTotal,
 * studentsAtRisk, studentsTotal, target } }
 */
export const getClassAnalytics = ({ classId, subjectId }) =>
  call(`/analytics/class?classId=${encodeURIComponent(classId)}&subjectId=${encodeURIComponent(subjectId)}`);

/**
 * GET /api/analytics/students/:id?classId=&subjectId= — teacher: one student.
 * Same shape as /analytics/me (nothing filtered by release) plus
 * `recent: [{ id, testId, test, at, earned, max, percent|null, flags }]`.
 */
export const getStudentAnalytics = (id, { classId, subjectId }) =>
  call(`/analytics/students/${encodeURIComponent(id)}?classId=${encodeURIComponent(classId)}&subjectId=${encodeURIComponent(subjectId)}`);

/**
 * GET /api/analytics/students/:id/history?subject=&from=&to= — teacher: one
 * student's submitted tests across every subject of their class (404 if the
 * student is not in one of the teacher's classes). `subject` = a subject id;
 * `from`/`to` = ISO timestamps, inclusive. 400 INVALID_FILTER for a bad range.
 * → { student, subjects: [{ id, name }], rows: [{ id, testId, test, subjectId,
 * subject, at, status: "final"|"pending", marks|null, max, percent|null,
 * classAverage|null, timeTakenSec|null, submitReason, flags: { high, medium, low } }]
 * newest first, summary: { count, final, pending, average, best, lowest, trend, flags } }
 */
export const getStudentHistory = (id, { subject, from, to } = {}) => {
  const q = new URLSearchParams();
  if (subject) q.set("subject", subject);
  if (from != null) q.set("from", new Date(from).toISOString());
  if (to != null) q.set("to", new Date(to).toISOString());
  const qs = q.toString();
  return call(`/analytics/students/${encodeURIComponent(id)}/history${qs ? `?${qs}` : ""}`);
};
