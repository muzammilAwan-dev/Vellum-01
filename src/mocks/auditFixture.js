import { isChoice } from "@/lib/questions";
import { actorOf } from "./audit";

// ═══════════════════════════════════════════════════════════════
// Seeded grading history for two finished written tests, so the admin's
// teacher-fairness screens have something real to show:
//   · "Forces – Written Check" (10A), Mrs. L. Park: most changes go up, three of
//     them for one student, one answer changed after results were released.
//   · "Energy – Written Check" (11B), Mr. D. Osei: mostly approves, a couple of
//     changes in both directions, one large bulk approve.
// Dr. R. Chen has not graded anything yet. The marks on the seeded attempts are
// changed to match the events, so the trail and the signals agree.
// ═══════════════════════════════════════════════════════════════
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const half = (g) => Math.ceil(g.max / 2);
const up = (g) => Math.min(g.max, g.marks + half(g));
const down = (g) => Math.max(0, g.marks - half(g));

export const applyFixtureReviews = (state) => {
  const found = [];
  const userByName = (name) => state.users.find((u) => u.role === "student" && u.name === name);

  const run = (testTitle, teacherId, script) => {
    const test = state.tests.find((t) => t.title === testTitle);
    if (!test) return;
    const actor = actorOf(state.users.find((u) => u.id === teacherId));
    const attempts = state.attempts.filter((a) => a.testId === test.id);
    const base = Math.max(test.stoppedAt, ...attempts.map((a) => a.submittedAt)) + HOUR;
    const written = (a) => a.questions.filter((q) => !isChoice(q));
    let tick = 0;

    const apply = (a, q, kind, { to, reason, at, batchId = null, afterRelease = false }) => {
      const g = a.grades[q.id];
      const before = { marks: g.marks, status: g.status };
      const marks = kind === "override" ? to : g.marks;
      a.grades[q.id] = { ...g, marks, status: "final", source: kind === "override" ? "teacher" : g.source, reviewedAt: at };
      found.push({
        at,
        ev: {
          actor,
          type: kind === "override" ? "grade.override" : "grade.approve",
          entity: { type: "grade", id: `${a.id}:${q.id}` },
          classId: test.classId,
          testId: test.id,
          studentId: userByName(a.student)?.id ?? null,
          before,
          after: { marks, status: "final" },
          meta:
            kind === "override"
              ? { reason, afterRelease, aiMarks: g.aiMarks ?? null, confidence: g.confidence ?? null, max: g.max, final: true }
              : { bulk: batchId !== null, batchId, aiMarks: g.aiMarks ?? null, confidence: g.confidence ?? null, max: g.max, afterRelease: false },
        },
      });
    };

    script({
      attempts,
      written,
      byName: (name) => attempts.find((a) => a.student === name),
      change: (a, q, dir, reason) => {
        const g = a.grades[q.id];
        const to = dir === "up" ? up(g) : down(g);
        // A change that would not move the mark is just an approval.
        if (to === g.marks) apply(a, q, "approve", { at: base + ++tick * 5 * 60_000 });
        else apply(a, q, "override", { to, reason, at: base + ++tick * 5 * 60_000 });
      },
      approveAll: (limit, batchId) => {
        const open = attempts.flatMap((a) => written(a).filter((q) => a.grades[q.id].status === "ai_draft").map((q) => [a, q]));
        const at = base + 3 * HOUR;
        open.slice(0, limit).forEach(([a, q]) => apply(a, q, "approve", { at: at + ++tick * 1000, batchId }));
        open.slice(limit).forEach(([a, q]) => apply(a, q, "approve", { at: at + HOUR + ++tick * 60_000 }));
      },
      late: (a, q, reason) => {
        const g = a.grades[q.id];
        apply(a, q, "override", { to: Math.min(g.max, g.marks + 1), reason, at: test.stoppedAt + 2 * DAY, afterRelease: true });
      },
    });
  };

  run("Forces \u2014 Written Check", "u-park", ({ written, byName, change, approveAll, late }) => {
    const farid = byName("Farid Khalil");
    written(farid).forEach((q, i) => change(farid, q, "up", ["Meets the intent of the question", "Explained it well in class", "Effort deserves more credit"][i % 3]));
    const aiden = byName("Aiden Kelly");
    // The two answers the AI was most sure about.
    [...written(aiden)]
      .sort((x, y) => (aiden.grades[y.id].confidence ?? 0) - (aiden.grades[x.id].confidence ?? 0))
      .slice(0, 2)
      .forEach((q, i) => change(aiden, q, "up", ["Rubric point was implied", "Worth a little more"][i]));
    const chenWu = byName("Chen Wu");
    change(chenWu, written(chenWu).find((q) => chenWu.grades[q.id].marks > 0) ?? written(chenWu)[0], "down", "Wording copied from the textbook");
    approveAll(20, "b-seed-forces");
    const beatriz = byName("Beatriz Silva");
    late(beatriz, written(beatriz)[0], "Parent asked for a recheck");
  });

  run("Energy \u2014 Written Check", "u-osei", ({ written, byName, change, approveAll }) => {
    const hana = byName("Hana Yamada");
    change(hana, written(hana)[0], "up", "Second rubric point was met");
    const noah = byName(state.users.find((u) => u.role === "student" && u.classId === "cls-11b" && u.name.startsWith("Noah"))?.name);
    change(noah, written(noah)[1], "down", "Contradicts the definition in the text");
    approveAll(20, "b-seed-energy");
  });

  return found;
};
