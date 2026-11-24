import { call } from "@/api/client";
import { useResource } from "./useResource";

/**
 * Recurring questions across a subject's past papers.
 * Real endpoint: GET /api/subjects/:id/clusters?threshold= (0.1–0.9, default 0.3;
 * higher = stricter grouping, more and smaller clusters).
 * → { data: { threshold, questionCount,
 *     papers:   [{ id, name, year?, questionCount }],
 *     clusters: [{ id, label, count, paperCount, years: number[], sample,
 *                  questions: [{ id, text, paperId, paperName, year? }] }] } }
 * Clusters come largest first (by how many papers they appear in).
 */
export const useClusters = (subjectId, threshold = 0.3) =>
  useResource(["clusters", subjectId, threshold], {
    fetch: () => call(`/subjects/${subjectId}/clusters?threshold=${threshold}`),
    enabled: !!subjectId,
  });

/** One past paper's questions → { data: { materialId, name, questions: string[] } }. GET /api/materials/:id/questions */
export const usePaperQuestions = (materialId) =>
  useResource(["materials", "questions", materialId], {
    fetch: () => call(`/materials/${materialId}/questions`),
    enabled: !!materialId,
  });
