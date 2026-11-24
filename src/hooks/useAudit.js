import { call } from "@/api/client";
import { eventsQuery } from "@/api/audit";
import { useResource } from "./useResource";

/**
 * Tests that have been published, with grading-trail counts (admin only)
 * -> { data: [{ testId, title, subject, cls, teacher, status, attempts, answers,
 *               changed, overridden, afterRelease, pending }] }.
 * Real endpoint: GET /api/audit/tests.
 */
export const useAuditTests = () => useResource(["audit", "tests"], { fetch: () => call("/audit/tests") });

/**
 * One test's grading trail -> { data: { test, totals, rows, nextCursor } }.
 * Real endpoint: GET /api/audit/tests/:testId?limit=&cursor= (admin only; opening
 * it is itself written to the audit log).
 */
export const useAuditTrail = (testId) =>
  useResource(["audit", "tests", testId], {
    fetch: () => call(`/audit/tests/${testId}?limit=500`),
    enabled: Boolean(testId),
  });

/**
 * Teachers with their grading numbers and signal counts (admin only)
 * -> { data: [{ teacherId, name, email, classes, reviewed, overrides, overrideRate,
 *               upward, downward, signals: { high, medium, low } }] }.
 * Real endpoint: GET /api/audit/teachers.
 */
export const useAuditTeachers = () => useResource(["audit", "teachers"], { fetch: () => call("/audit/teachers") });

/**
 * One teacher's profile -> { data: { teacher, stats, peerMedianRate|null, signals, students, tests } }.
 * Real endpoint: GET /api/audit/teachers/:teacherId (admin only; logged as audit.view).
 */
export const useAuditTeacher = (teacherId) =>
  useResource(["audit", "teachers", teacherId], {
    fetch: () => call(`/audit/teachers/${teacherId}`),
    enabled: Boolean(teacherId),
  });

/**
 * The event log, newest first (admin only). `filters` as in lib/auditEvents.js
 * (actor, group, type, entityType, classId, testId, studentId, from, to).
 * -> { data: { events, nextCursor, total, names: { users, tests }, facets: { actors } } }.
 * Real endpoint: GET /api/audit/events?…&limit=&cursor=.
 */
export const useAuditEvents = (filters, limit = 50) => {
  const qs = eventsQuery(filters, { limit });
  return useResource(["audit", "events", qs], { fetch: () => call(`/audit/events?${qs}`) });
};

/** Does the chain still verify? -> { data: { ok, checked|badSeq+reason, total, lastSeq, headHash, verifiedAt } }. GET /api/audit/integrity (admin). */
export const useAuditIntegrity = () => useResource(["audit", "integrity"], { fetch: () => call("/audit/integrity") });

/**
 * A teacher's own grading history -> { data: { totals, items, nextCursor } }.
 * Real endpoint: GET /api/audit/mine?limit=&cursor= (teacher only; own events only).
 */
export const useMyAudit = (limit = 50) =>
  useResource(["audit", "mine", limit], { fetch: () => call(`/audit/mine?limit=${limit}`) });
