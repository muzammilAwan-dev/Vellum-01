import { canonicalJson } from "@/lib/audit";
import { sha256Hex } from "@/lib/sha256";
import { MOCK_GRADER_MODEL, SYSTEM_ACTOR, actorOf, record } from "./audit";
import { applyFixtureReviews } from "./auditFixture";

// Builds the opening audit log from the seeded tests and attempts, in time
// order, through the same record() the handlers use (so the seed chain verifies).
// Only things that really happened in the seed are logged: publishes, attempt
// starts/submits and the AI's draft marks. F11c adds a dedicated fixture for
// the fairness signals.
export const seedAudit = (state) => {
  state.auditLog = [];
  const found = [];
  const teacherOf = (classId) => state.classes.find((c) => c.id === classId)?.teacherIds?.[0] ?? null;
  const person = (id) => {
    const u = state.users.find((x) => x.id === id);
    return u ? actorOf(u) : { ...SYSTEM_ACTOR };
  };

  state.tests.forEach((t) => {
    if (!t.publishedAt) return;
    found.push({
      at: t.publishedAt,
      ev: {
        actor: person(teacherOf(t.classId)),
        type: "test.publish",
        entity: { type: "test", id: t.id },
        classId: t.classId,
        testId: t.id,
        after: { settingsHash: sha256Hex(canonicalJson(t.settings ?? {})) },
        meta: { scheduled: Boolean(t.schedule) },
      },
    });
  });

  state.attempts.forEach((a) => {
    const test = state.tests.find((t) => t.id === a.testId);
    if (!test) return;
    const student = state.users.find((u) => u.role === "student" && u.name === a.student);
    const base = { classId: test.classId, testId: test.id, studentId: student?.id ?? null };
    const who = student ? actorOf(student) : { ...SYSTEM_ACTOR };
    found.push({ at: a.startedAt, ev: { ...base, actor: who, type: "attempt.start", entity: { type: "attempt", id: a.id } } });
    found.push({
      at: a.submittedAt,
      ev: { ...base, actor: who, type: "attempt.submit", entity: { type: "attempt", id: a.id }, meta: { reason: a.submitReason, answerDigest: sha256Hex(canonicalJson(a.answers ?? {})) } },
    });
    Object.entries(a.grades ?? {}).forEach(([qid, g]) => {
      if (g.aiMarks == null) return; // not drafted by the AI (AI grading off, or auto-marked)
      found.push({
        at: a.submittedAt + 1000,
        ev: {
          ...base,
          actor: { ...SYSTEM_ACTOR },
          type: "grade.ai_draft",
          entity: { type: "grade", id: `${a.id}:${qid}` },
          after: { marks: g.aiMarks, status: "ai_draft", confidence: g.confidence },
          meta: { model: MOCK_GRADER_MODEL, feedback: g.feedback ?? "" },
        },
      });
    });
  });

  found.push(...applyFixtureReviews(state));
  found.sort((x, y) => x.at - y.at).forEach(({ at, ev }) => record(state, ev, at));
};
