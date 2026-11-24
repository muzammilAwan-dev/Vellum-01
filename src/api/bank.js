import { call } from "./client";

// ═══════════════════════════════════════════════════════════════
// QUESTION BANK API — see API-CONTRACT.md ("Question bank").
// Reads: hooks/useBank (GET /subjects/:id/bank). The bank also fills itself:
// publishing a test saves its new questions and counts reused ones.
// ═══════════════════════════════════════════════════════════════
const refresh = [["bank"]];

/** Pick only the fields the server stores for a question. */
const fieldsOf = (q) => ({
  type: q.type,
  topic: q.topic,
  marks: q.marks,
  text: q.text,
  options: q.options ?? null,
  correctIndex: q.correctIndex ?? null,
  expectedAnswer: q.expectedAnswer ?? "",
  rubric: q.rubric ?? [],
});

/** POST /api/subjects/:id/bank — add a question by hand (source "manual"). 400 INVALID_QUESTION. */
export const createBankQuestion = (subjectId, q) =>
  call(`/subjects/${subjectId}/bank`, { method: "POST", body: fieldsOf(q), invalidates: refresh });

/** PUT /api/bank/:id — replace a question's content. 400 INVALID_QUESTION. */
export const updateBankQuestion = (id, q) =>
  call(`/bank/${id}`, { method: "PUT", body: fieldsOf(q), invalidates: refresh });

/** DELETE /api/bank/:id — tests that already used it keep their copy. */
export const deleteBankQuestion = (id) => call(`/bank/${id}`, { method: "DELETE", invalidates: refresh });
