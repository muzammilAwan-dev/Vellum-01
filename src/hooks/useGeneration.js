import { call } from "@/api/client";
import { useResource } from "./useResource";

export const GENERATION_POLL_MS = 1000;

/**
 * Progress of a personalized draft being written (one test per student).
 * Real endpoint: GET /api/tests/:id/generation →
 *   { status: "running"|"done", done, total, etaSeconds?, currentStudent? }
 * Anything that isn't being generated (class tests, finished drafts) answers
 * { status: "done" }. Polled once a second, but only while `running` is true.
 */
export const useGeneration = (testId, running) =>
  useResource(["generation", testId], {
    fetch: () => call(`/tests/${testId}/generation`),
    enabled: !!testId && running,
    refetchInterval: GENERATION_POLL_MS,
  });
