import { sumMarks } from "./questions";

/**
 * Status shown in the UI, derived from what's stored + the clock.
 * Stored `status` only records what the teacher did (draft / published);
 * whether a published test is scheduled, live or finished depends on the
 * schedule window and any manual stop — so the backend can own that rule
 * later without the UI changing.
 */
export const effectiveStatus = (test, now = Date.now()) => {
  if (test.status === "draft") return "draft";
  if (test.stoppedAt && test.stoppedAt <= now) return "completed";
  const s = test.schedule;
  if (s?.availableUntil && now >= s.availableUntil) return "completed";
  if (s?.availableFrom && now < s.availableFrom) return "scheduled";
  return "live";
};

/** Questions per student and marks per student (variants share a mix). */
export const questionsOf = (test) =>
  test.mode === "personal"
    ? (test.variants?.[0]?.questions ?? [])
    : (test.questionSet ?? []);

export const testStats = (test) => {
  const qs = questionsOf(test);
  return { questions: qs.length, marks: sumMarks(qs) };
};
