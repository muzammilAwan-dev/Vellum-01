import { TEACHER_GRADE_TYPES } from "./auditTrail";

// ═══════════════════════════════════════════════════════════════
// TEACHER FAIRNESS SIGNALS (pure; computed from the audit events only)
// A signal is a clue worth a second look, never proof of anything: marks change
// for good reasons all the time. Every signal lists the event numbers it rests on.
// ═══════════════════════════════════════════════════════════════
export const SIGNAL_THRESHOLDS = {
  /** Answers a teacher must have reviewed before their change rate is compared. */
  RATE_MIN_REVIEWED: 5,
  /** Change rate must be at least this many times the other teachers' median… */
  RATE_FACTOR: 2,
  /** …and at least this share of reviewed answers (so 2% vs 0% never fires). */
  RATE_FLOOR: 0.25,
  BIAS_MIN_CHANGES: 5,
  BIAS_SHARE: 0.8,
  FAV_MIN_UPWARD: 3,
  FAV_SHARE: 0.4,
  CONFIDENT_AI: 0.85,
  CONFIDENT_DELTA: 0.25,
  BULK_MIN: 20,
};

export const SIGNAL_META = {
  OVERRIDE_RATE_HIGH: { label: "Changes many marks", severity: "medium" },
  OVERRIDE_DIRECTION_BIAS: { label: "Changes lean one way", severity: "medium" },
  STUDENT_FAVOURITISM: { label: "Repeated increases for one student", severity: "medium" },
  OVERRIDE_AGAINST_CONFIDENT_AI: { label: "Changes marks the AI was sure about", severity: "medium" },
  AFTER_RELEASE_CHANGE: { label: "Changed marks after release", severity: "high" },
  EDIT_AFTER_ATTEMPTS: { label: "Edited a test after students started", severity: "high" },
  BULK_APPROVE_LARGE: { label: "Approved many marks in one go", severity: "low" },
};
export const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

const median = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (x) => `${Math.round(x * 100)}%`;
const REVIEW_TYPES = new Set(["grade.override", "grade.approve", "grade.manual"]);

/**
 * Per-teacher numbers from the events.
 * "Reviewed" = distinct answers the teacher marked, approved or changed.
 * Direction is judged per change: after − before.
 */
export const computeTeacherStats = (events, users = []) => {
  const nameOf = (id) => users.find((u) => u.id === id)?.name ?? id;
  const out = new Map();
  const of = (actor) => {
    if (!out.has(actor.id)) {
      out.set(actor.id, {
        teacherId: actor.id,
        name: actor.name,
        reviewedKeys: new Set(),
        changedKeys: new Set(),
        upward: 0,
        downward: 0,
        deltaSum: 0,
        afterRelease: 0,
        students: new Map(),
        tests: new Map(),
      });
    }
    return out.get(actor.id);
  };
  events.forEach((e) => {
    if (e.actor?.role !== "teacher" || !e.actor.id) return;
    const isGrade = TEACHER_GRADE_TYPES.has(e.type);
    if (!isGrade && e.type !== "test.update") return;
    const t = of(e.actor);
    if (!isGrade) return;
    const key = e.entity.id;
    if (REVIEW_TYPES.has(e.type)) t.reviewedKeys.add(key);
    if (e.meta?.afterRelease === true) t.afterRelease += 1;
    const test = (e.testId && t.tests.get(e.testId)) || { testId: e.testId, reviewedKeys: new Set(), changedKeys: new Set() };
    if (e.testId) t.tests.set(e.testId, test);
    if (REVIEW_TYPES.has(e.type)) test.reviewedKeys.add(key);
    if (e.type === "grade.override") {
      const d = (e.after?.marks ?? 0) - (e.before?.marks ?? 0);
      t.changedKeys.add(key);
      test.changedKeys.add(key);
      t.deltaSum += d;
      const s = t.students.get(e.studentId) ?? { id: e.studentId, name: nameOf(e.studentId), upward: 0, downward: 0 };
      if (d > 0) {
        t.upward += 1;
        s.upward += 1;
      } else if (d < 0) {
        t.downward += 1;
        s.downward += 1;
      }
      t.students.set(e.studentId, s);
    }
  });
  return [...out.values()].map((t) => {
    const changes = t.upward + t.downward;
    const reviewed = t.reviewedKeys.size;
    return {
      teacherId: t.teacherId,
      name: t.name,
      reviewed,
      overrides: t.changedKeys.size,
      overrideRate: reviewed ? t.changedKeys.size / reviewed : 0,
      upward: t.upward,
      downward: t.downward,
      avgDelta: changes ? t.deltaSum / changes : 0,
      afterRelease: t.afterRelease,
      students: [...t.students.values()].sort((a, b) => b.upward + b.downward - (a.upward + a.downward)),
      tests: [...t.tests.values()].map((x) => ({ testId: x.testId, reviewed: x.reviewedKeys.size, overrides: x.changedKeys.size })),
    };
  });
};

/** Other teachers' median change rate (only those with enough reviewed answers); null when there is nobody to compare. */
export const peerMedianRate = (allStats, teacherId, T = SIGNAL_THRESHOLDS) => {
  const others = allStats.filter((s) => s.teacherId !== teacherId && s.reviewed >= T.RATE_MIN_REVIEWED);
  return others.length ? median(others.map((s) => s.overrideRate)) : null;
};

const signal = (code, teacherId, text, evidence, extra = {}) => ({
  id: `${code}:${teacherId}${extra.studentId ? `:${extra.studentId}` : ""}`,
  code,
  ...SIGNAL_META[code],
  teacherId,
  text,
  evidence: evidence.slice(0, 50),
  ...extra,
});

/** Signals for one teacher, most serious first. */
export const computeSignals = ({ events, users = [], teacherId, T = SIGNAL_THRESHOLDS }) => {
  const all = computeTeacherStats(events, users);
  const me = all.find((s) => s.teacherId === teacherId);
  if (!me) return [];
  const mine = events.filter((e) => e.actor?.id === teacherId && e.actor.role === "teacher");
  const overrides = mine.filter((e) => e.type === "grade.override");
  const found = [];

  const peers = peerMedianRate(all, teacherId, T);
  if (me.reviewed >= T.RATE_MIN_REVIEWED && peers !== null && me.overrideRate >= Math.max(T.RATE_FACTOR * peers, T.RATE_FLOOR)) {
    found.push(
      signal(
        "OVERRIDE_RATE_HIGH",
        teacherId,
        `Changed ${me.overrides} of ${me.reviewed} reviewed answers (${pct(me.overrideRate)}); other teachers change about ${pct(peers)}.`,
        overrides.map((e) => e.seq),
      ),
    );
  }

  const changes = me.upward + me.downward;
  const lean = Math.max(me.upward, me.downward);
  if (changes >= T.BIAS_MIN_CHANGES && lean / changes >= T.BIAS_SHARE) {
    found.push(
      signal(
        "OVERRIDE_DIRECTION_BIAS",
        teacherId,
        `${lean} of ${changes} mark changes went ${me.upward >= me.downward ? "up" : "down"}.`,
        overrides.map((e) => e.seq),
      ),
    );
  }

  me.students.forEach((s) => {
    if (s.upward >= T.FAV_MIN_UPWARD && s.upward / Math.max(me.upward, 1) >= T.FAV_SHARE) {
      found.push(
        signal(
          "STUDENT_FAVOURITISM",
          teacherId,
          `${s.upward} increases for ${s.name}, ${pct(s.upward / me.upward)} of this teacher's increases.`,
          overrides.filter((e) => e.studentId === s.id && (e.after?.marks ?? 0) > (e.before?.marks ?? 0)).map((e) => e.seq),
          { studentId: s.id },
        ),
      );
    }
  });

  const confident = overrides.filter(
    (e) => (e.meta?.confidence ?? 0) >= T.CONFIDENT_AI && e.meta?.max > 0 && Math.abs((e.after?.marks ?? 0) - (e.before?.marks ?? 0)) >= T.CONFIDENT_DELTA * e.meta.max,
  );
  if (confident.length) {
    found.push(
      signal(
        "OVERRIDE_AGAINST_CONFIDENT_AI",
        teacherId,
        `${confident.length} mark ${confident.length === 1 ? "change" : "changes"} on answers the AI was at least ${pct(T.CONFIDENT_AI)} confident about, by ${pct(T.CONFIDENT_DELTA)} of the marks or more.`,
        confident.map((e) => e.seq),
      ),
    );
  }

  const late = mine.filter((e) => TEACHER_GRADE_TYPES.has(e.type) && e.meta?.afterRelease === true);
  if (late.length) {
    found.push(
      signal(
        "AFTER_RELEASE_CHANGE",
        teacherId,
        `${late.length} ${late.length === 1 ? "change" : "changes"} made after students could already see the result.`,
        late.map((e) => e.seq),
      ),
    );
  }

  const edits = mine.filter((e) => e.type === "test.update" && e.meta?.afterAttempts === true && (e.meta.changed ?? []).some((c) => c === "questions" || c === "settings"));
  if (edits.length) {
    found.push(
      signal(
        "EDIT_AFTER_ATTEMPTS",
        teacherId,
        `Edited the questions or settings of a published test after students had started it (${edits.length}×).`,
        edits.map((e) => e.seq),
        { testId: edits[0].testId },
      ),
    );
  }

  const batches = new Map();
  mine
    .filter((e) => e.type === "grade.approve" && e.meta?.bulk === true && e.meta.batchId)
    .forEach((e) => batches.set(e.meta.batchId, [...(batches.get(e.meta.batchId) ?? []), e]));
  [...batches.values()]
    .filter((b) => b.length >= T.BULK_MIN)
    .forEach((b) =>
      found.push(signal("BULK_APPROVE_LARGE", teacherId, `Approved ${b.length} AI marks in one action.`, b.map((e) => e.seq), { testId: b[0].testId })),
    );

  return found.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
};

export const countBySeverity = (signals) => ({
  high: signals.filter((s) => s.severity === "high").length,
  medium: signals.filter((s) => s.severity === "medium").length,
  low: signals.filter((s) => s.severity === "low").length,
});
