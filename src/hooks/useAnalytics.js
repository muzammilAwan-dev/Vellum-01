import { getClassAnalytics, getMyAnalytics, getStudentAnalytics, getStudentHistory } from "@/api/analytics";
import { getReportData } from "@/api/reports";
import { useResource } from "./useResource";

/** The student's own progress (trend vs class, topic accuracy). Refreshes after grading changes. */
export const useMyAnalytics = () =>
  useResource(["analytics", "me"], { fetch: getMyAnalytics, refetchInterval: 60_000 });

/** Teacher: the class + subject picture. Waits until a class and subject are chosen. */
export const useClassAnalytics = ({ classId, subjectId } = {}) =>
  useResource(["analytics", "class", classId, subjectId], {
    fetch: () => getClassAnalytics({ classId, subjectId }),
    enabled: Boolean(classId && subjectId),
    refetchInterval: 60_000,
  });

/** Teacher: one student's progress within the chosen class + subject. */
export const useStudentAnalytics = (id, { classId, subjectId } = {}) =>
  useResource(["analytics", "student", id, classId, subjectId], {
    fetch: () => getStudentAnalytics(id, { classId, subjectId }),
    enabled: Boolean(id && classId && subjectId),
    refetchInterval: 60_000,
  });

/** Teacher: one student's test history across all subjects; filters are part of the key. */
export const useStudentHistory = (id, { subject = "", from = null, to = null } = {}) =>
  useResource(["analytics", "history", id, subject, from, to], {
    fetch: () => getStudentHistory(id, { subject, from, to }),
    enabled: Boolean(id),
    refetchInterval: 60_000,
  });

/** Teacher: the confirmed data one report is built from (see api/reports.js). `params` = null waits. */
export const useReportData = (params) =>
  useResource(["reports", "data", params?.studentId, params?.preset, params?.period, params?.from, params?.to, params?.testId, params?.subjectId], {
    fetch: () => getReportData(params),
    enabled: Boolean(params),
  });
