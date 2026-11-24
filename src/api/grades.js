import { call } from "./client";

// ═══════════════════════════════════════════════════════════════
// GRADING API (API-CONTRACT.md "Grading"). Marking itself happens on the
// server when a student submits; these are the teacher's calls on top of it.
// Reads: hooks/useGrading (queue) and useAttemptReview (student review).
// ═══════════════════════════════════════════════════════════════
const refresh = [["grading"], ["attempts"], ["review"], ["analytics"], ["audit"]];

/**
 * PATCH /api/grades/:attemptId/:questionId  body: { marks, feedback?, final, reason? }
 *   final true  → accept or override: it now counts for the student
 *   final false → save as a draft, still waiting
 * Rejects with code INVALID_MARKS (400) outside 0..max, and REASON_REQUIRED (400) when
 * the change needs a `reason` (lib/audit.js needsReason: a big move away from the
 * AI mark, or any change after the result was released).
 */
export const reviewGrade = (attemptId, questionId, { marks, feedback = "", final = true, reason }) =>
  call(`/grades/${attemptId}/${questionId}`, {
    method: "PATCH",
    body: { marks, feedback, final, ...(reason ? { reason } : {}) },
    invalidates: refresh,
  });

/**
 * POST /api/grading/approve  body: { items: [{ attemptId, questionId }] }
 * Accepts AI marks unchanged. Returns { approved }.
 */
export const approveGrades = (items) =>
  call("/grading/approve", { method: "POST", body: { items }, invalidates: refresh });
