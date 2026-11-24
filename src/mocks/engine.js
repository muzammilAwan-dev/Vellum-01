import { isChoice } from "@/lib/questions";

// ═══════════════════════════════════════════════════════════════
// SERVER RULES (fake backend only)
//
// Everything here is behaviour a real backend owns: what status a test is
// in, who may see what, when results are released, how an attempt is graded
// and totalled. The frontend never imports this folder's code — it only ever
// sees the responses (src/mocks/handlers.js), exactly as it will with the real
// server. See API-CONTRACT.md for the rules a real backend must implement.
// ═══════════════════════════════════════════════════════════════
export const DEFAULT_SETTINGS = {
  release: "after_close", // "immediately" | "after_close"
  aiGrading: true,
  allowBack: true,
  requireFullscreen: true, // ask for fullscreen on Begin; leaving it is flagged
  blockCopyPaste: true, // no right-click / copy / cut / paste on the test page (attempts are flagged)
  shuffleQuestions: false, // order decided per attempt at start (lib/randomize.js)
  shuffleOptions: false,
};
export const settingsOf = (test) => ({ ...DEFAULT_SETTINGS, ...(test.settings ?? {}) });

/** draft | scheduled | live | completed — from what the teacher did and the clock. */
export const statusOf = (test, now = Date.now()) => {
  if (test.status === "draft") return "draft";
  if (test.stoppedAt && test.stoppedAt <= now) return "completed";
  const s = test.schedule;
  if (s?.availableUntil && now >= s.availableUntil) return "completed";
  if (s?.availableFrom && now < s.availableFrom) return "scheduled";
  return "live";
};

export const variantIndexFor = (test, studentName) =>
  (test.variants ?? []).findIndex((v) => v.studentName === studentName);

export const questionsFor = (test, variantIndex) =>
  test.mode === "personal"
    ? (test.variants?.[variantIndex]?.questions ?? [])
    : (test.questionSet ?? []);

export const sumMarks = (qs = []) => qs.reduce((s, q) => s + (Number(q.marks) || 0), 0);

export const deadlineFor = (test, startedAt) => {
  const limit = startedAt + (test.config?.duration ?? 30) * 60_000;
  const close = test.schedule?.availableUntil;
  return close ? Math.min(limit, close) : limit;
};

export const confidenceLabel = (c) =>
  c == null ? null : c < 0.6 ? "low" : c < 0.8 ? "med" : "high";

/** Totals count only final marks, so unreviewed AI output never reaches a student. */
export const totalsOf = (questions = [], grades = {}) => {
  let earned = 0;
  let max = 0;
  let notFinal = 0;
  questions.forEach((q) => {
    max += q.marks;
    const g = grades?.[q.id];
    if (g?.status === "final") earned += g.marks;
    else notFinal += 1;
  });
  return { earned, max, complete: notFinal === 0, notFinal };
};

export const isReleased = (test, attempt, now = Date.now()) =>
  attempt.status === "submitted" &&
  (settingsOf(test).release === "immediately" || statusOf(test, now) === "completed");

// ── response shapes ──────────────────────────────────────────────
export const stripQuestion = (q) => ({
  id: q.id,
  type: q.type,
  topic: q.topic,
  marks: q.marks,
  text: q.text,
  options: q.options,
});

export const counts = (test) => {
  const qs = test.mode === "personal" ? (test.variants?.[0]?.questions ?? []) : (test.questionSet ?? []);
  return { questionCount: qs.length, totalMarks: sumMarks(qs) };
};

/** How long the fake server "takes" to write one personalized test. */
export const GENERATION_MS_PER_TEST = 700;

/**
 * Progress of a personalized draft being written, or null when there is
 * nothing to report (class tests, older drafts). Worked out from the clock, so
 * it advances with no timers: { status: "running"|"done", done, total,
 * etaSeconds?, currentStudent? }.
 */
export const generationOf = (test, now) => {
  const g = test.generation;
  if (!g) return null;
  const elapsed = Math.max(0, now - g.startedAt);
  const done = Math.min(g.total, Math.floor(elapsed / g.perTestMs));
  if (done >= g.total) return { status: "done", done: g.total, total: g.total };
  return {
    status: "running",
    done,
    total: g.total,
    etaSeconds: Math.max(1, Math.ceil(((g.total - done) * g.perTestMs - (elapsed % g.perTestMs)) / 1000)),
    currentStudent: test.variants?.[done]?.studentName ?? null,
  };
};

/** Teacher: the whole test. While a personalized draft is still being written, only the finished variants are included. */
export const testForTeacher = (test, now) => {
  const generation = generationOf(test, now);
  return {
    ...test,
    ...(generation?.status === "running" ? { variants: (test.variants ?? []).slice(0, generation.done) } : {}),
    ...(generation ? { generation } : {}),
    settings: settingsOf(test),
    status: statusOf(test, now),
    ...counts(test),
  };
};

/** Student: metadata only — no questions, variants or answer keys. */
export const testForStudent = (test, now) => ({
  id: test.id,
  title: test.title,
  subject: test.subject,
  classId: test.classId,
  cls: test.cls,
  mode: test.mode,
  status: statusOf(test, now),
  schedule: test.schedule,
  settings: settingsOf(test),
  config: { duration: test.config?.duration ?? 30 },
  publishedAt: test.publishedAt,
  stoppedAt: test.stoppedAt,
  updatedAt: test.updatedAt,
  ...counts(test),
});

/** Student's own attempt: question text only, plus what they may know about results. */
export const attemptForStudent = (attempt, test, now) => {
  const released = test ? isReleased(test, attempt, now) : false;
  const { grades, ...rest } = attempt;
  delete rest.shuffle; // the order map is server-side (teacher results)
  return {
    ...rest,
    questions: (attempt.questions ?? []).map(stripQuestion),
    released,
    totals: released ? totalsOf(attempt.questions, grades) : null,
  };
};

// ── teacher-side attempt views (roster + results) ──────────────────
// The student's page pings the server about every 20 s (live-status, autosave,
// flags). No sign of life for three missed pings while the attempt is still open
// = "client silent": a clue (closed lid, lost connection, browser killed), never
// proof of anything. The server stamps `lastSeenAt` and owns the threshold.
export const SILENT_AFTER_MS = 60_000;
export const lastSeenOf = (attempt) => attempt.lastSeenAt ?? attempt.submittedAt ?? attempt.startedAt;
export const clientSilent = (attempt, test, now) =>
  attempt.status === "in_progress" && statusOf(test, now) === "live" && now - lastSeenOf(attempt) > SILENT_AFTER_MS;

/** One student's attempt as the teacher sees it. Never the answers or the key. */
export const attemptForTeacher = (attempt, test, now) => ({
  id: attempt.id,
  status: attempt.status,
  startedAt: attempt.startedAt,
  deadline: attempt.deadline,
  submittedAt: attempt.submittedAt,
  submitReason: attempt.submitReason,
  progress: { answered: answeredIn(attempt), total: (attempt.questions ?? []).length },
  flags: attempt.flags,
  lastSeenAt: lastSeenOf(attempt),
  clientSilent: clientSilent(attempt, test, now),
  // final marks only (same rule as students); `complete:false` = still being marked
  marks: attempt.status === "submitted" ? totalsOf(attempt.questions, attempt.grades) : null,
});

export const tabSwitches = (attempt) => attempt.flags.filter((f) => f.type === "tab-switch");
export const answeredIn = (attempt) =>
  (attempt.questions ?? []).filter((q) => {
    const a = attempt.answers?.[q.id];
    return isChoice(q) ? Number.isInteger(a) : typeof a === "string" && a.trim().length > 0;
  }).length;
