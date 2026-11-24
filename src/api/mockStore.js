import { STUDENTS } from "@/data/users";
import { buildQuestions, buildVariants } from "./mockGenerator";
import { createId } from "@/lib/id";
import { gradeObjective, questionsFor } from "@/lib/attempts";
import { buildGrades } from "./mockGrader";
import { getSettings } from "@/lib/testSettings";
import { isChoice } from "@/lib/questions";

// ═══════════════════════════════════════════════════════════════
// MOCK DATABASE
//
// Stands in for MongoDB while there is no backend. One small observable
// store, persisted to localStorage, that api/*.js modules read and write.
// Components never touch it directly: they read through hooks/useTests
// and write through api/tests.js — the same two seams a real backend
// would sit behind, so nothing in the UI changes when this goes away.
//
// Shape follows Section 6 of the guide. `tests` is the Test collection
// (a personalized test carries its Student Test Variants inline).
// ═══════════════════════════════════════════════════════════════
const STORAGE_KEY = "vellum.mockdb";
const VERSION = 1;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const baseTest = (now, over) => ({
  subject: "Physics",
  classId: "cls-11a",
  cls: "11A",
  schedule: null,
  publishedAt: null,
  stoppedAt: null,
  regeneratedAt: null,
  settings: {}, // reserved: release policy, AI grading, anti-cheat (publish step)
  createdAt: now,
  updatedAt: now,
  ...over,
});

const makeConfig = (mix, extra = {}) => ({
  mix,
  targetMarks: mix.reduce((s, r) => s + r.count * r.marks, 0),
  duration: 30,
  mode: "class",
  difficulty: "balanced",
  focusTopics: [],
  instruction: "",
  ...extra,
});

const seedTest = (now, { title, mix, mode = "class", seed, ...over }) => {
  const config = makeConfig(mix, { mode, duration: over.duration ?? 30 });
  return baseTest(now, {
    id: createId(),
    title,
    mode,
    config,
    questionSet: mode === "class" ? buildQuestions(mix, { seed }) : null,
    variants: mode === "personal" ? buildVariants(mix, STUDENTS, { seed }) : null,
    ...over,
  });
};

// Finished attempts on the Kinematics quiz, so the grade review and history
// screens have something to show on first run. Each student answers at a
// different quality — strong, partial, vague, blank — which is what gives the
// review queue a spread of AI marks and confidence levels.
const ANSWER_QUALITY = {
  "Maya Okafor": "strong",
  "Sofia Lindqvist": "strong",
  "Priya Nair": "partial",
  "Jayden Park": "partial",
  "Adrian Bell": "vague",
  "Tomás Reyes": "blank",
};
const FLAG_COUNTS = { "Adrian Bell": 2, "Tomás Reyes": 1 };

const writtenAnswer = (q, quality) => {
  const model = q.expectedAnswer || "";
  if (quality === "strong") return model;
  if (quality === "partial") return model.split(" ").slice(0, Math.ceil(model.split(" ").length / 2)).join(" ");
  if (quality === "vague") return "I think you use force and mass here.";
  return "";
};

const seedAttempt = (test, student, index) => {
  const quality = ANSWER_QUALITY[student] ?? "partial";
  const questions = questionsFor(test, { variantIndex: null });
  const submittedAt = test.stoppedAt - (9 + index) * MINUTE;
  const attempt = {
    id: createId(),
    testId: test.id,
    student,
    variantIndex: null,
    questions,
    startedAt: submittedAt - (20 - index) * MINUTE,
    deadline: test.stoppedAt - 5 * MINUTE,
    status: "submitted",
    submittedAt,
    submitReason: "manual",
    flags: Array.from({ length: FLAG_COUNTS[student] ?? 0 }, (_, i) => ({
      type: "tab-switch",
      at: submittedAt - (4 + i * 3) * MINUTE,
    })),
    answers: {},
  };
  questions.forEach((q) => {
    // Weak students also miss some multiple-choice questions.
    attempt.answers[q.id] = isChoice(q)
      ? quality === "vague" || quality === "blank"
        ? (q.correctIndex + 1) % q.options.length
        : q.correctIndex
      : writtenAnswer(q, quality);
  });
  attempt.objective = gradeObjective(questions, attempt.answers);
  attempt.grades = buildGrades(questions, attempt.answers, {
    aiGrading: getSettings(test).aiGrading,
  });
  return attempt;
};

const seed = () => {
  const now = Date.now();
  const tests = [
      seedTest(now, {
        title: "Wave Optics — Quiz 2",
        seed: 4,
        mix: [
          { type: "mcq", count: 5, marks: 2 },
          { type: "short", count: 3, marks: 4 },
          { type: "numerical", count: 2, marks: 4 },
        ],
        status: "published",
        publishedAt: now - 10 * MINUTE,
        createdAt: now - 2 * DAY,
        updatedAt: now - 10 * MINUTE,
      }),
      seedTest(now, {
        title: "Newton's Laws — Unit Test",
        seed: 0,
        mix: [
          { type: "mcq", count: 6, marks: 2 },
          { type: "short", count: 2, marks: 4 },
          { type: "numerical", count: 4, marks: 5 },
        ],
        status: "draft",
        createdAt: now - 3 * HOUR,
        updatedAt: now - 2 * MINUTE,
      }),
      seedTest(now, {
        title: "Thermodynamics — Mid-term",
        seed: 2,
        mode: "personal",
        duration: 60,
        mix: [
          { type: "mcq", count: 6, marks: 2 },
          { type: "short", count: 5, marks: 4 },
          { type: "long", count: 2, marks: 6 },
          { type: "numerical", count: 2, marks: 8 },
        ],
        status: "published",
        schedule: {
          availableFrom: now + DAY,
          availableUntil: now + DAY + 3 * HOUR,
        },
        publishedAt: now - DAY,
        createdAt: now - 3 * DAY,
        updatedAt: now - DAY,
      }),
      seedTest(now, {
        title: "Bonding & Structure",
        seed: 6,
        mix: [
          { type: "mcq", count: 4, marks: 2 },
          { type: "short", count: 4, marks: 3 },
          { type: "numerical", count: 2, marks: 5 },
        ],
        status: "draft",
        createdAt: now - 4 * DAY,
        updatedAt: now - 3 * DAY,
      }),
      seedTest(now, {
        title: "Kinematics — Quiz",
        seed: 1,
        mix: [
          { type: "mcq", count: 5, marks: 2 },
          { type: "numerical", count: 3, marks: 5 },
        ],
        status: "published",
        publishedAt: now - 8 * DAY,
        stoppedAt: now - 7 * DAY,
        createdAt: now - 9 * DAY,
        updatedAt: now - 7 * DAY,
      }),
    ];
  const finished = tests.find((t) => t.title === "Kinematics — Quiz");
  return {
    version: VERSION,
    tests,
    attempts: STUDENTS.map((st, i) => seedAttempt(finished, st.name, i)),
  };
};

// Older saved data (from earlier builds of this mock) lacked the question
// snapshot and grades on attempts; fill them in rather than wiping the store.
const migrate = (parsed) => {
  const tests = parsed.tests;
  const attempts = (parsed.attempts ?? []).map((a) => {
    const test = tests.find((t) => t.id === a.testId);
    const questions = a.questions ?? (test ? questionsFor(test, a) : []);
    const next = { ...a, questions };
    if (a.status === "submitted" && !a.grades && test) {
      next.grades = buildGrades(questions, a.answers, { aiGrading: getSettings(test).aiGrading });
    }
    return next;
  });
  return { ...parsed, attempts };
};

const load = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.version === VERSION && Array.isArray(parsed.tests) ? migrate(parsed) : null;
  } catch {
    return null;
  }
};

let state = load() ?? seed();
const listeners = new Set();

// Typing in the review editor updates the store on every keystroke; writing
// the whole DB to localStorage each time would be wasteful, so persistence
// is debounced (and flushed when the tab closes).
let persistTimer = null;
const persistNow = () => {
  clearTimeout(persistTimer);
  persistTimer = null;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded / private mode — the in-memory store still works */
  }
};
const schedulePersist = () => {
  if (persistTimer == null) persistTimer = setTimeout(persistNow, 250);
};
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", persistNow);
  // Another tab (say, the student's) wrote to the store: pick it up, so a
  // teacher's Stop in one tab reaches a student's open test in another.
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue);
      if (parsed?.version !== VERSION) return;
      state = migrate(parsed);
      listeners.forEach((l) => l());
    } catch {
      /* ignore a malformed write */
    }
  });
}

export const getState = () => state;

export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setState = (updater) => {
  state = typeof updater === "function" ? updater(state) : updater;
  schedulePersist();
  listeners.forEach((l) => l());
};

/** Dev helper: restore the seed data (also exposed as window.__resetVellum). */
export const resetMockData = () => setState(seed());
if (typeof window !== "undefined" && import.meta.env?.DEV) {
  window.__resetVellum = resetMockData;
}
