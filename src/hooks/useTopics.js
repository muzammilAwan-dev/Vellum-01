import { call } from "@/api/client";
import { useResource } from "./useResource";

/**
 * How well the teacher's own material covers each topic of a subject.
 * Real endpoint: GET /api/subjects/:id/topics →
 *   { data: [{ name, weight, thin, passages }] }
 * `thin` = too little material to write good questions from (the server's
 * call); `passages` = how many it found. Empty until something is uploaded.
 */
export const useSubjectTopics = (subjectId) =>
  useResource(["topics", subjectId], {
    fetch: () => call(`/subjects/${subjectId}/topics`),
    enabled: !!subjectId,
  });
