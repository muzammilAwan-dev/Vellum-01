import { call } from "@/api/client";
import { useResource } from "./useResource";

/**
 * A subject's question bank. Real endpoint: GET /api/subjects/:id/bank
 * (optional ?topic= / ?source=) →
 *   { data: [{ id, subjectId, text, topic, type, marks, options, correctIndex,
 *              expectedAnswer, rubric, source: "past-paper"|"generated"|"manual",
 *              used, lastUsed (ms | null), createdAt, updatedAt }] }
 */
export const useBank = (subjectId) =>
  useResource(["bank", subjectId], {
    fetch: () => call(`/subjects/${subjectId}/bank`),
    enabled: !!subjectId,
  });
