import { QUESTION_BANK } from "./bankSeed";
import { STUDENTS } from "@/data/users";
import { createId } from "@/lib/id";
import { seededRandom } from "@/lib/randomize";
import { isChoice } from "@/lib/questions";
import { buildQuestions, buildVariants } from "./generator";
import { buildGrades } from "./grader";
import { weakTopicMap } from "@/lib/analytics";
import { DEFAULT_TOPICS } from "./topics";
import { questionsFor, settingsOf } from "./engine";
import { seedAudit } from "./auditSeed";

// ═══════════════════════════════════════════════════════════════
// FAKE DATABASE (dev only)
//
// Stands in for MongoDB behind the fake server. Persisted to localStorage so
// the demo survives a refresh. Nothing in the app imports this: only
// src/mocks/handlers.js reads and writes it.
// ═══════════════════════════════════════════════════════════════
const STORAGE_KEY = "vellum.mockdb.v10";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// ── users ──
// Persisted in the db (admins create and remove accounts). Students carry
// their class as `cls` (code) + `classId`; teachers' classes live on
// `class.teacherIds`.
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[^a-z ]/g, "").replace(/ +/g, ".");
// 11A keeps exactly the six demo students (their tests and attempts are
// seeded by name); the other classes get a few extra so their rosters aren't empty.
const EXTRA_STUDENTS = [
  ["cls-11b", "11B", "Hana Yamada", "11B-02", "h.yamada"],
  ["cls-11b", "11B", "Kofi Mensah", "11B-05", "k.mensah"],
  ["cls-11b", "11B", "Lucia Romano", "11B-08", "l.romano"],
  ["cls-11b", "11B", "Noah Bergström", "11B-12", "n.bergstrom"],
  ["cls-11b", "11B", "Ravi Sharma", "11B-16", "r.sharma"],
  ["cls-11b", "11B", "Zara Ahmed", "11B-21", "z.ahmed"],
  ["cls-10a", "10A", "Aiden Kelly", "10A-03", "a.kelly"],
  ["cls-10a", "10A", "Beatriz Silva", "10A-07", "b.silva"],
  ["cls-10a", "10A", "Chen Wu", "10A-09", "c.wu"],
  ["cls-10a", "10A", "Elena Petrova", "10A-14", "e.petrova"],
  ["cls-10a", "10A", "Farid Khalil", "10A-18", "f.khalil"],
];
const seedUsers = () => [
  { id: "u-teacher", name: "Dr. R. Chen", email: "r.chen@westfield.edu", role: "teacher", active: true },
  { id: "u-park", name: "Mrs. L. Park", email: "l.park@westfield.edu", role: "teacher", active: true },
  { id: "u-osei", name: "Mr. D. Osei", email: "d.osei@westfield.edu", role: "teacher", active: true },
  { id: "u-admin", name: "S. Whitfield", email: "s.whitfield@westfield.edu", role: "admin", active: true },
  ...STUDENTS.map((s) => ({
    id: `u-${slug(s.name)}`,
    name: s.name,
    email: `${slug(s.name)}@westfield.edu`,
    role: "student",
    cls: "11A",
    classId: "cls-11a",
    roll: s.roll,
    active: true,
  })),
  ...EXTRA_STUDENTS.map(([classId, cls, name, roll, mail]) => ({
    id: `u-${slug(name)}`,
    name,
    email: `${mail}@westfield.edu`,
    role: "student",
    cls,
    classId,
    roll,
    active: true,
  })),
];
/** The signed-in-able accounts. Always read through this, never cache the array. */
export const users = () => db().users;

// ── classes & subjects ──
// Teachers see the classes whose `teacherIds` include them; students see
// only their own class.
export const CLASSES_SEED = [
  { id: "cls-11a", code: "11A", name: "Grade 11 — Section A", teacherIds: ["u-teacher", "u-park"] },
  { id: "cls-11b", code: "11B", name: "Grade 11 — Section B", teacherIds: ["u-teacher", "u-osei"] },
  { id: "cls-10a", code: "10A", name: "Grade 10 — Section A", teacherIds: ["u-park"] },
];
const SUBJECT_NAMES = {
  "cls-11a": ["Physics", "Chemistry", "Mathematics"],
  "cls-11b": ["Physics", "Chemistry"],
  "cls-10a": ["Physics", "Chemistry", "Mathematics", "Biology"],
};
export const subjectsSeed = (now) =>
  Object.entries(SUBJECT_NAMES).flatMap(([classId, names]) =>
    names.map((name) => ({
      id: `sub-${name.slice(0, 4).toLowerCase()}-${classId.slice(4)}`,
      classId,
      name,
      outline: "",
      createdAt: now,
      updatedAt: now,
    })),
  );

// ── seed ──
const baseTest = (now, over) => ({
  subject: "Physics",
  subjectId: "sub-phys-11a",
  classId: "cls-11a",
  cls: "11A",
  schedule: null,
  publishedAt: null,
  stoppedAt: null,
  regeneratedAt: null,
  settings: {},
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

const seedTest = (now, { title, mix, mode = "class", seed, weak, ...over }) => {
  const config = makeConfig(mix, { mode, duration: over.duration ?? 30 });
  return baseTest(now, {
    id: createId(),
    title,
    mode,
    config,
    questionSet: mode === "class" ? buildQuestions(mix, { seed }) : null,
    variants: mode === "personal" ? buildVariants(mix, STUDENTS, { seed, weak }) : null,
    ...over,
  });
};

// Students answer at different quality, which gives the review queue a
// spread of AI marks and confidence levels.
const QUALITY = {
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
  const words = model.split(" ");
  if (quality === "strong") return model;
  if (quality === "partial") return words.slice(0, Math.ceil(words.length / 2)).join(" ");
  if (quality === "vague") return "I think you use force and mass here.";
  return "";
};

const seedAttempt = (test, student, index) => {
  const quality = QUALITY[student] ?? "partial";
  const questions = questionsFor(test, null);
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
    attempt.answers[q.id] = isChoice(q)
      ? quality === "vague" || quality === "blank"
        ? (q.correctIndex + 1) % q.options.length
        : q.correctIndex
      : writtenAnswer(q, quality);
  });
  attempt.grades = buildGrades(questions, attempt.answers, {
    aiGrading: settingsOf(test).aiGrading,
  });
  return attempt;
};

// ── past results (so analytics has a real history to work from) ──
// Five finished, auto-graded tests (multiple choice + true/false) before
// "Kinematics — Quiz". Each student's target % is met by getting the questions
// from topics they're better at right first (with some deterministic noise), so
// the topic profile is consistent but not absolute: Newton's Laws / Kinematics
// high, Electromagnetism / Wave Optics low.
const TOPIC_BIAS = Object.fromEntries(DEFAULT_TOPICS.map((t, i) => [t, 0.5 - i * 0.2]));
const HISTORY = [
  { title: "Foundations — Diagnostic", daysAgo: 42, seed: 7 },
  { title: "Electromagnetism — Quiz 1", daysAgo: 35, seed: 8 },
  { title: "Thermodynamics — Quiz 3", daysAgo: 28, seed: 9 },
  { title: "Kinematics — Unit Test", daysAgo: 21, seed: 10 },
  { title: "Newton's Laws — Quiz", daysAgo: 14, seed: 11 },
];
const HISTORY_SCORES = {
  "Maya Okafor": [68, 74, 71, 80, 83],
  "Sofia Lindqvist": [82, 85, 84, 88, 90],
  "Priya Nair": [70, 72, 75, 76, 78],
  "Jayden Park": [66, 70, 74, 73, 77],
  "Adrian Bell": [55, 58, 52, 60, 57],
  "Tomás Reyes": [48, 52, 50, 56, 54],
};

const seedHistoryAttempt = (test, student, target, index) => {
  const questions = questionsFor(test, null);
  const rand = seededRandom(`${student}|${test.title}`);
  const rank = questions
    .map((q) => ({ q, key: (TOPIC_BIAS[q.topic] ?? 0) + (rand() - 0.5) * 1.6 }))
    .sort((a, b) => b.key - a.key);
  // Fill with right answers, best-ranked first, until the target marks are reached.
  const total = questions.reduce((n, q) => n + q.marks, 0);
  const goal = Math.round((target / 100) * total);
  const right = new Set();
  let got = 0;
  rank.forEach(({ q }) => {
    if (got + q.marks <= goal) {
      right.add(q.id);
      got += q.marks;
    }
  });
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
    flags: [],
    answers: {},
  };
  questions.forEach((q) => {
    attempt.answers[q.id] = right.has(q.id) ? q.correctIndex : (q.correctIndex + 1) % q.options.length;
  });
  attempt.grades = buildGrades(questions, attempt.answers, { aiGrading: false });
  return attempt;
};

// ── courses & lessons (F9a) ──
const COURSES_SEED = [
  {
    id: "crs-newton", subjectId: "sub-phys-11a", title: "Physics — Newtonian Mechanics",
    lessons: [
      { kind: "text", title: "Introduction to force and motion", duration: "8 min", body: "Force is any interaction that changes an object's motion. Newton's first law states that an object at rest stays at rest unless acted on by a net external force. Practically, this means that without a net force, velocity does not change: an object stays still if still, and keeps drifting at the same speed in the same direction if moving." },
      { kind: "video", title: "Newton's three laws, worked examples", duration: "14 min", url: "https://www.youtube.com/watch?v=kKKM8Y-u7ds", body: "A visual walkthrough of the three laws using classroom demonstrations." },
      { kind: "file", title: "Free body diagram reference sheet.pdf", duration: "2 pages", url: "https://res.cloudinary.com/demo/image/upload/sample.pdf", body: "A one-page reference you can keep on your desk when solving problems." },
      { kind: "text", title: "Applying F = ma to real problems", duration: "12 min", body: "Once you can draw a free body diagram, the algebra is straightforward. Identify all forces, resolve them by axis, sum them, and solve for the unknown. Remember that ΣF = ma applies component by component." },
      { kind: "video", title: "Common mistakes with sign conventions", duration: "9 min", url: "https://www.youtube.com/watch?v=Z7XeTUvK6BU", body: "The five most common errors students make when assigning signs to forces and accelerations." },
    ],
  },
  {
    id: "crs-waves", subjectId: "sub-phys-11a", title: "Physics — Waves & Optics",
    lessons: [
      { kind: "text", title: "Wave properties and terminology", duration: "10 min", body: "Wavelength, frequency, amplitude, and speed are the four properties every wave has. The relationship v = fλ ties them together." },
      { kind: "video", title: "Refraction and Snell's law", duration: "16 min", url: "https://www.youtube.com/watch?v=kJ4i5v6j1XU", body: "How light bends when it crosses between media, and how to use Snell's law to calculate the angles.", testTitle: "Wave Optics — Quiz 2" },
    ],
  },
  {
    id: "crs-bonding", subjectId: "sub-chem-11a", title: "Chemistry — Bonding & Structure",
    lessons: [
      { kind: "text", title: "Ionic vs covalent bonds", duration: "11 min", body: "Ionic bonds form between metals and non-metals through electron transfer. Covalent bonds form between non-metals through electron sharing." },
    ],
  },
];
// How many lessons of each course each student has finished (in course order).
const PROGRESS_SEED = {
  "Maya Okafor": { "crs-newton": 3, "crs-waves": 1, "crs-bonding": 0 },
  "Sofia Lindqvist": { "crs-newton": 5, "crs-waves": 2, "crs-bonding": 1 },
  "Priya Nair": { "crs-newton": 4, "crs-waves": 1, "crs-bonding": 0 },
  "Jayden Park": { "crs-newton": 3, "crs-waves": 1, "crs-bonding": 0 },
  "Adrian Bell": { "crs-newton": 2, "crs-waves": 0, "crs-bonding": 0 },
  "Tomás Reyes": { "crs-newton": 1, "crs-waves": 0, "crs-bonding": 0 },
};

const seedCourses = (now, tests) => {
  const courses = [];
  const lessons = [];
  const progress = [];
  COURSES_SEED.forEach((c, ci) => {
    courses.push({ id: c.id, subjectId: c.subjectId, title: c.title, createdAt: now - (30 - ci) * DAY });
    c.lessons.forEach((l, i) => {
      const { testTitle, ...rest } = l;
      lessons.push({
        id: `${c.id}-l${i + 1}`,
        courseId: c.id,
        order: i,
        url: "",
        testId: testTitle ? (tests.find((t) => t.title === testTitle)?.id ?? null) : null,
        createdAt: now - (30 - ci) * DAY,
        ...rest,
      });
    });
  });
  Object.entries(PROGRESS_SEED).forEach(([student, perCourse], si) =>
    Object.entries(perCourse).forEach(([courseId, n]) =>
      lessons
        .filter((l) => l.courseId === courseId)
        .slice(0, n)
        .forEach((l, k) => progress.push({ lessonId: l.id, student, doneAt: now - (6 - si) * DAY - k * HOUR })),
    ),
  );
  return { courses, lessons, progress };
};

// ── class discussion (F9b) ──
// [title, body, author, tag, ageHours, pinned, resolved, replies: [author, body, ageHours][]]
const THREADS_SEED = [
  ["Lens sign convention — when is v negative?", "In the lens equation 1/f = 1/v − 1/u, I keep getting confused about when the image distance is negative. Can someone explain with a concrete example?", "Tomás Reyes", "Question", 2, false, false, [
    ["Maya Okafor", "I always check: if the image forms on the same side as the object, it's virtual, so v is negative. Otherwise positive.", 1.2],
    ["Dr. R. Chen", "Maya's rule is correct for a single thin lens. The cleanest way is to draw the ray diagram first. The geometry tells you which side the image is on before you ever write an equation.", 0.75],
  ]],
  ["Extra practice problems for Wave Optics", "I've uploaded a 4-page set of extra problems focused on sign conventions and image formation. The answers are on the last page. Try them before Thursday's test.", "Dr. R. Chen", "Resource", 26, true, false, [
    ["Priya Nair", "Thanks, these are perfect. Q7 was tricky but I got it after looking at the diagram again.", 22],
  ]],
  ["Study group for the mid-term?", "Would anyone want to meet in the library on Saturday morning to review Newton's Laws together? Thinking 10 AM, 90 minutes.", "Sofia Lindqvist", "Discussion", 72, false, false, [
    ["Jayden Park", "Count me in.", 70],
    ["Adrian Bell", "Same. I'll bring the past papers.", 52],
    ["Tomás Reyes", "Can we push to 11? I have something until 10:30.", 50],
  ]],
  ["Reminder: test on Thursday covers Units 3 and 4", "Reminder that Thursday's test covers thermodynamics and waves. Format: 10 MCQs, 5 short answers, 2 long answers. Bring your calculators.", "Dr. R. Chen", "Announcement", 96, true, false, []],
  ["Understanding adiabatic vs isothermal — cleared up", "I was confused about the difference but after doing the two problems from Section 5.3 it clicked. In adiabatic processes Q = 0; in isothermal processes ΔU = 0.", "Priya Nair", "Discussion", 120, false, true, [
    ["Dr. R. Chen", "Exactly right, Priya. Marking this resolved.", 119],
  ]],
];

const seedThreads = (now, people) => {
  const idOf = (name) => people.find((u) => u.name === name)?.id ?? null;
  const roleOf = (name) => people.find((u) => u.name === name)?.role ?? "student";
  return THREADS_SEED.map(([title, body, author, tag, age, pinned, resolved, replies], i) => {
    const replyRows = replies.map(([name, text, rAge], k) => ({
      id: `th${i + 1}-r${k + 1}`,
      author: name,
      authorId: idOf(name),
      role: roleOf(name),
      body: text,
      createdAt: now - rAge * HOUR,
    }));
    return {
      id: `th${i + 1}`,
      classId: "cls-11a",
      title,
      body,
      author,
      authorId: idOf(author),
      role: roleOf(author),
      tag,
      pinned,
      resolved,
      createdAt: now - age * HOUR,
      lastActivityAt: now - (replyRows.length ? Math.min(...replies.map((r) => r[2])) : age) * HOUR,
      replies: replyRows,
    };
  });
};

const seed = () => {
  const now = Date.now();
  // Past results first: personalized variants lean on weak topics derived from them.
  const past = HISTORY.map((h) =>
    seedTest(now, {
      title: h.title,
      seed: h.seed,
      mix: [
        { type: "mcq", count: 10, marks: 2 },
        { type: "truefalse", count: 10, marks: 1 },
      ],
      status: "published",
      publishedAt: now - (h.daysAgo + 1) * DAY,
      stoppedAt: now - h.daysAgo * DAY,
      createdAt: now - (h.daysAgo + 2) * DAY,
      updatedAt: now - h.daysAgo * DAY,
    }),
  );
  const historyAttempts = past.flatMap((test, ti) =>
    STUDENTS.map((s, i) => seedHistoryAttempt(test, s.name, HISTORY_SCORES[s.name]?.[ti] ?? 65, i)),
  );
  const weak = weakTopicMap({
    tests: past,
    attempts: historyAttempts,
    students: STUDENTS.map((s) => ({ id: s.name, name: s.name, roll: s.roll })),
  });
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
      weak,
      duration: 60,
      mix: [
        { type: "mcq", count: 6, marks: 2 },
        { type: "short", count: 5, marks: 4 },
        { type: "long", count: 2, marks: 6 },
        { type: "numerical", count: 2, marks: 8 },
      ],
      status: "published",
      schedule: { availableFrom: now + DAY, availableUntil: now + DAY + 3 * HOUR },
      publishedAt: now - DAY,
      createdAt: now - 3 * DAY,
      updatedAt: now - DAY,
    }),
    seedTest(now, {
      title: "Bonding & Structure",
      subject: "Chemistry",
      subjectId: "sub-chem-11a",
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
  tests.push(...past);
  const lms = seedCourses(now, tests);
  // Two more finished written tests in the other classes (graded by the other
  // teachers) so the admin audit screens have real history; see auditFixture.js.
  const fixtureTests = [
    seedTest(now, {
      title: "Forces — Written Check",
      subjectId: "sub-phys-10a",
      classId: "cls-10a",
      cls: "10A",
      seed: 12,
      mix: [
        { type: "mcq", count: 3, marks: 2 },
        { type: "short", count: 3, marks: 4 },
      ],
      status: "published",
      publishedAt: now - 6 * DAY,
      stoppedAt: now - 5 * DAY,
      createdAt: now - 7 * DAY,
      updatedAt: now - 5 * DAY,
    }),
    seedTest(now, {
      title: "Energy — Written Check",
      subjectId: "sub-phys-11b",
      classId: "cls-11b",
      cls: "11B",
      seed: 13,
      mix: [
        { type: "mcq", count: 2, marks: 2 },
        { type: "short", count: 4, marks: 3 },
      ],
      status: "published",
      publishedAt: now - 4 * DAY,
      stoppedAt: now - 3 * DAY,
      createdAt: now - 5 * DAY,
      updatedAt: now - 3 * DAY,
    }),
  ];
  tests.push(...fixtureTests);
  const namesIn = (classId) => EXTRA_STUDENTS.filter((s) => s[0] === classId).map((s) => s[2]);
  const fixtureAttempts = [
    ...namesIn("cls-10a").map((name, i) => seedAttempt(fixtureTests[0], name, i)),
    ...namesIn("cls-11b").map((name, i) => seedAttempt(fixtureTests[1], name, i)),
  ];
  const state = {
    version: 10,
    bank: QUESTION_BANK.map((q, i) => ({
      id: `bq-${q.id}`,
      subjectId: "sub-phys-11a",
      text: q.text,
      topic: q.topic,
      type: q.type,
      marks: q.marks,
      options: q.options ?? null,
      correctIndex: q.options ? (q.id === "q3" ? 0 : 1) : null, // q1 = 4 m/s², q3 = internal energy
      expectedAnswer: q.expectedAnswer ?? "",
      rubric: q.rubric ?? [],
      source: q.source,
      used: q.used,
      lastUsed: q.used ? now - (i * 3 + 2) * 86_400_000 : null,
      createdAt: now - (i * 3 + 20) * 86_400_000,
      updatedAt: now - (i * 3 + 20) * 86_400_000,
    })),
    materials: [],
    users: seedUsers(),
    classes: CLASSES_SEED.map((c) => ({ ...c })),
    subjects: subjectsSeed(now),
    courses: lms.courses,
    lessons: lms.lessons,
    lessonProgress: lms.progress,
    threads: seedThreads(now, seedUsers()),
    tests,
    attempts: [
      ...STUDENTS.map((s, i) => seedAttempt(finished, s.name, i)),
      ...historyAttempts,
      ...fixtureAttempts,
    ],
  };
  seedAudit(state);
  return state;
};

// ── persistence ──
const load = () => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return parsed?.version === 10 && Array.isArray(parsed.tests) ? parsed : null;
  } catch {
    return null;
  }
};

let state = null;
let timer = null;
const persist = () => {
  clearTimeout(timer);
  timer = null;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — memory still works */
  }
};

/** The one handle handlers use. Mutate `db()` freely, then call `save()`. */
export const db = () => (state ??= load() ?? seed());
export const save = () => {
  if (timer == null) timer = setTimeout(persist, 200);
};
export const resetMockData = () => {
  state = seed();
  persist();
};

/**
 * Demo helper: quietly alter one stored audit event so the integrity check can be
 * shown catching it. Returns the event number, or null if there is no such event.
 * Run `__tamperVellumAudit(5)` in the console, then press "Verify now" on the
 * admin Audit overview. `__resetVellum()` puts everything back.
 */
export const tamperAuditEvent = (seq = 3) => {
  const event = db().auditLog?.[seq - 1];
  if (!event) return null;
  event.meta = { ...event.meta, edited: true };
  persist();
  return seq;
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", persist);
  window.__resetVellum = resetMockData;
  window.__tamperVellumAudit = tamperAuditEvent;
}
