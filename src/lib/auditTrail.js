import { isChoice } from "./questions";

// ═══════════════════════════════════════════════════════════════
// GRADING TRAIL (pure; the real server ports this file)
// Joins submitted attempts with the audit log so an admin can see, for every
// written answer: what the student wrote, what the AI drafted, what each
// teacher action did, and where the mark ended up. The log is the history:
// a mark's events are the ones whose entity is { type: "grade", id: "<attemptId>:<questionId>" }.
// Auto-marked (choice) answers have no human or AI step and are not listed.
// ═══════════════════════════════════════════════════════════════
export const TEACHER_GRADE_TYPES = new Set(["grade.override", "grade.approve", "grade.manual", "grade.feedback"]);

/** Same buckets as the grading queue: <0.6 low, <0.8 med, otherwise high. */
export const confidenceBand = (c) => (c == null ? null : c < 0.6 ? "low" : c < 0.8 ? "med" : "high");

export const TRAIL_FILTERS = [
  { id: "all", label: "All answers" },
  { id: "changed", label: "Changed from AI" },
  { id: "overridden", label: "Overridden" },
  { id: "afterRelease", label: "After release" },
  { id: "pending", label: "Awaiting teacher" },
];

const gradeEventsByKey = (events) => {
  const map = new Map();
  events.forEach((e) => {
    if (e.entity?.type !== "grade") return;
    if (!map.has(e.entity.id)) map.set(e.entity.id, []);
    map.get(e.entity.id).push(e);
  });
  return map;
};

/**
 * One row per written answer of the given attempts.
 * `events` should already be limited to the test (any superset works).
 */
export const buildTrailRows = ({ attempts, events, users }) => {
  const byKey = gradeEventsByKey(events);
  const rows = [];
  attempts
    .filter((a) => a.status === "submitted")
    .forEach((a) => {
      const student = users.find((u) => u.role === "student" && u.name === a.student);
      a.questions.forEach((q, index) => {
        if (isChoice(q)) return;
        const g = a.grades?.[q.id];
        if (!g) return;
        const key = `${a.id}:${q.id}`;
        const history = (byKey.get(key) ?? []).slice().sort((x, y) => x.seq - y.seq);
        const aiEvent = history.find((e) => e.type === "grade.ai_draft");
        const ai = aiEvent
          ? {
              marks: aiEvent.after?.marks ?? null,
              confidence: confidenceBand(aiEvent.after?.confidence ?? null),
              feedback: aiEvent.meta?.feedback ?? "",
              model: aiEvent.meta?.model ?? null,
            }
          : null;
        const human = history.filter((e) => TEACHER_GRADE_TYPES.has(e.type));
        const lastHuman = human[human.length - 1] ?? null;
        const isFinal = g.status === "final";
        const delta = isFinal && ai && g.marks != null && ai.marks != null ? g.marks - ai.marks : null;
        rows.push({
          id: key,
          attemptId: a.id,
          questionId: q.id,
          order: index,
          student: { id: student?.id ?? null, name: a.student },
          questionText: q.text,
          topic: q.topic ?? null,
          max: g.max,
          studentAnswer: a.answers?.[q.id] ?? "",
          ai,
          final: { marks: g.marks ?? null, status: g.status, byName: isFinal ? (lastHuman?.actor?.name ?? null) : null, at: isFinal ? (lastHuman?.at ?? null) : null },
          delta,
          changed: delta !== null && delta !== 0,
          overridden: history.some((e) => e.type === "grade.override"),
          afterRelease: human.some((e) => e.meta?.afterRelease === true),
          pending: !isFinal,
          history: history.map((e) => ({
            seq: e.seq,
            at: e.at,
            type: e.type,
            actorName: e.actor?.name ?? "",
            actorRole: e.actor?.role ?? null,
            beforeMarks: e.before?.marks ?? null,
            afterMarks: e.after?.marks ?? null,
            status: e.after?.status ?? null,
            reason: e.meta?.reason ?? null,
            afterRelease: e.meta?.afterRelease === true,
          })),
        });
      });
    });
  return rows.sort((x, y) => x.student.name.localeCompare(y.student.name) || x.order - y.order);
};

export const trailTotals = (rows) => ({
  answers: rows.length,
  changed: rows.filter((r) => r.changed).length,
  overridden: rows.filter((r) => r.overridden).length,
  afterRelease: rows.filter((r) => r.afterRelease).length,
  pending: rows.filter((r) => r.pending).length,
});

export const filterTrailRows = (rows, { filter = "all", query = "" } = {}) => {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (filter !== "all" && !r[filter]) return false;
    return !q || r.student.name.toLowerCase().includes(q) || r.questionText.toLowerCase().includes(q);
  });
};
