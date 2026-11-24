import { isChoice } from "./questions";
import { isReleased } from "./testSettings";

// ═══════════════════════════════════════════════════════════════
// GRADES (shared UI-side helpers)
//
// Every question in a submitted attempt has a grade:
//   { marks, max, status, source, confidence, rubric, feedback, aiMarks? }
//
//   status "final"    — counts toward the student's score. Objective answers
//                       are final at once; written ones become final when
//                       the teacher approves or overrides them.
//   status "ai_draft" — the AI suggested `marks`; waiting for the teacher.
//   status "pending"  — AI grading was off; waiting for the teacher to mark.
//   source "auto" | "ai" | "teacher"
//   confidence 0–1 (AI grades only)
//   rubric [{ label, points, awarded }] (written answers)
//
// Students only ever see "final" marks, so unreviewed AI output can't leak.
// ═══════════════════════════════════════════════════════════════

/** 0–1 confidence → the low / med / high buckets the review screen uses. */
export const confidenceLabel = (c) =>
  c == null ? null : c < 0.6 ? "low" : c < 0.8 ? "med" : "high";

/** Totals for one attempt. `complete` = every question has a final mark. */
export const summarizeGrades = (questions = [], grades = {}) => {
  let earned = 0;
  let max = 0;
  let notFinal = 0;
  questions.forEach((q) => {
    max += q.marks;
    const g = grades?.[q.id];
    if (g?.status === "final") earned += g.marks;
    else notFinal += 1;
  });
  return { earned, max, notFinal, complete: notFinal === 0 };
};

export const writtenQuestions = (questions = []) => questions.filter((q) => !isChoice(q));

/**
 * What a student may see of one submitted attempt: whether it's released and,
 * if so, their totals. A real backend sends `released` and `totals` on each
 * of the student's attempts (totals null until release); the mock works them
 * out here from the same rules.
 */
export const studentResult = (attempt, test) => {
  const released = attempt.released ?? isReleased(test, attempt);
  const totals = released
    ? (attempt.totals ?? summarizeGrades(attempt.questions, attempt.grades))
    : null;
  return { released, totals };
};
