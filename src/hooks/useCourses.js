import { call } from "@/api/client";
import { useResource } from "./useResource";

/**
 * Teacher: the courses of one subject (GET /api/courses?subjectId=), each with
 * ordered lessons and `doneCount` per lesson. Waits until a subject is chosen.
 */
export const useCourses = ({ subjectId } = {}) =>
  useResource(["courses", "teacher", subjectId], {
    fetch: () => call(`/courses?subjectId=${encodeURIComponent(subjectId)}`),
    enabled: Boolean(subjectId),
  });

/**
 * Student: every course of their class (GET /api/courses), each lesson with the
 * student's own `done`, an optional related `test`, and a `progress` summary.
 */
export const useMyCourses = ({ enabled = true } = {}) =>
  useResource(["courses", "me"], { fetch: () => call("/courses"), enabled });
