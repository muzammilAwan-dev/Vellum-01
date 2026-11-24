import { createId } from "@/lib/id";
import { clusterQuestions, fakePaperQuestions, splitQuestions } from "./clusters";
import { attachSources, subjectTopics } from "./research";
import { FLAG_TYPES } from "@/lib/antiCheat";
import { buildClassAnalytics, buildStudentAnalytics, buildStudentDetail, weakTopicMap } from "@/lib/analytics";
import { buildStudentHistory, filterHistory, summarizeHistory, validRange } from "@/lib/studentHistory";
import { REPORT_SECTIONS, buildReport, reportContentHash } from "@/lib/report";
import { canResolve, validateReply, validateThread } from "@/lib/discussion";
import { courseProgress, isPermutation, validateLesson } from "@/lib/lms";
import { randomizeQuestions } from "@/lib/randomize";
import { QUESTION_TYPES, isChoice, normalizeQuestion, validateQuestions } from "@/lib/questions";
import { db, save, users } from "./db";
import {
  attemptForStudent,
  attemptForTeacher,
  counts,
  confidenceLabel,
  deadlineFor,
  generationOf,
  isReleased,
  questionsFor,
  settingsOf,
  statusOf,
  stripQuestion,
  sumMarks,
  testForStudent,
  testForTeacher,
  totalsOf,
  variantIndexFor,
  DEFAULT_SETTINGS,
  GENERATION_MS_PER_TEST,
} from "./engine";
import { buildQuestions, buildVariants } from "./generator";
import { buildGrades } from "./grader";
import { recordSubmission, withAudit } from "./auditHooks";
import { actorOf } from "./audit";
import { AUDIT_TYPES, GENESIS, REASON_MAX_LENGTH, needsReason, verifyChain } from "@/lib/audit";
import { buildTrailRows, trailTotals } from "@/lib/auditTrail";
import { computeSignals, computeTeacherStats, countBySeverity, peerMedianRate } from "@/lib/auditSignals";
import { filterEvents } from "@/lib/auditEvents";
import { mergePrefs, validateProfilePatch } from "@/lib/profile";
import { canSeePhoto, canUploadPhoto, validatePhotoDataUrl } from "@/lib/photoPolicy";
import { INSTITUTION_DEFAULTS, brandingOf, institutionChangedFields, validateInstitutionPatch } from "@/lib/institution";
import { effectivePolicy, privacyChangedFields, privacyView, validatePrivacyPatch } from "@/lib/privacy";
import { cleanGuardian, guardianView, validateGuardian } from "@/lib/contact";
import { PASSWORD_MESSAGES, generateTemporaryPassword, validatePassword } from "@/lib/password";
import { EXTRACTED_TOPICS } from "@/data/materials";

// ═══════════════════════════════════════════════════════════════
// FAKE BACKEND ENDPOINTS (dev only)
//
// One handler per row of API-CONTRACT.md. Each receives
//   { user, params, query, body, now }
// and returns the JSON the real server would send (or throws HttpError).
// Request bodies arrive already converted to the UI's conventions and
// responses are converted back to wire format by server.js, so the
// frontend's adapters are exercised for real.
// ═══════════════════════════════════════════════════════════════
export class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, message, code) => {
  throw new HttpError(status, message, code);
};
const as = (user, role) => user.role === role || fail(403, "You don't have access to this");

// ── classes & subjects (who may see / change what) ──
const classesFor = (user) => {
  const all = db().classes;
  if (user.role === "teacher") return all.filter((c) => c.teacherIds.includes(user.id));
  if (user.role === "student") return all.filter((c) => c.code === user.cls);
  return all;
};
const studentsOf = (cls) => users().filter((u) => u.role === "student" && u.classId === cls.id);
const teachersOf = (cls) => cls.teacherIds.map((id) => users().find((u) => u.id === id)).filter(Boolean);
const classView = (c) => ({
  id: c.id,
  code: c.code,
  name: c.name,
  studentCount: studentsOf(c).length,
  subjectCount: db().subjects.filter((s) => s.classId === c.id).length,
  teachers: teachersOf(c).map((t) => ({ id: t.id, name: t.name })),
});
// The ONE place a photo leaves the server: `photoFor(viewer, owner)` is the owner's photo when the
// viewer may see it (lib/photoPolicy.js), else null. Every payload that carries a person uses it.
const photoFor = (viewer, owner) =>
  owner?.photo &&
  canSeePhoto({
    viewer: { id: viewer.id, role: viewer.role, classIds: classesFor(viewer).map((c) => c.id) },
    owner: { id: owner.id, role: owner.role, classId: owner.classId },
    institution: institutionView(),
  })
    ? owner.photo
    : null;
const userView = (u, viewer = u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  active: u.active !== false,
  mustChangePassword: u.mustChangePassword === true,
  photoUrl: photoFor(viewer, u),
  ...(u.role === "student" ? { cls: u.cls ?? null, classId: u.classId ?? null, roll: u.roll } : {}),
  ...(u.role === "teacher"
    ? { classIds: db().classes.filter((c) => c.teacherIds.includes(u.id)).map((c) => c.id) }
    : {}),
});
// ── profile (own data only; identity fields stay admin-only) ──
// Optional fields `bio`, `phone`, `prefs` live on the user record; missing = defaults (no DB version bump).
const profileView = (u) => {
  const mine = classesFor(u);
  const logins = (db().auditLog ?? []).filter((e) => e.type === "auth.login" && e.actor?.id === u.id);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    ...(u.role === "student" ? { rollNo: u.roll ?? null } : {}),
    classes: u.role === "admin" ? [] : mine.map((c) => ({ id: c.id, code: c.code, name: c.name })),
    subjects: u.role === "admin" ? [] : db().subjects.filter((x) => mine.some((c) => c.id === x.classId)).map((x) => ({ id: x.id, name: x.name, classId: x.classId })),
    bio: u.bio ?? "",
    phone: u.phone ?? "",
    photoUrl: photoFor(u, u),
    prefs: u.prefs ?? {},
    // the newest sign-in is the current session, so the one before it is the "previous" one
    previousLoginAt: logins.length > 1 ? logins[logins.length - 2].at : null,
    passwordChangedAt: u.passwordChangedAt ?? null,
  };
};
// ── institution (one per installation; missing = defaults, no DB version bump) ──
const institutionView = () => ({ ...INSTITUTION_DEFAULTS, ...(db().institution ?? {}) });
const findSubject = (id, user) => {
  const sub = db().subjects.find((s) => s.id === id) ?? fail(404, "Subject not found");
  if (user && !classesFor(user).some((c) => c.id === sub.classId)) fail(404, "Subject not found");
  return sub;
};
const cleanSubject = ({ name, outline }, { partial = false } = {}) => {
  const out = {};
  if (!partial || name !== undefined) {
    const n = String(name ?? "").trim();
    if (!n) fail(400, "Give the subject a name", "INVALID_SUBJECT");
    if (n.length > 60) fail(400, "Subject names can be up to 60 characters", "INVALID_SUBJECT");
    out.name = n;
  }
  if (outline !== undefined) {
    if (typeof outline !== "string" || outline.length > 20_000)
      fail(400, "The outline is too long (20,000 characters max)", "INVALID_SUBJECT");
    out.outline = outline;
  }
  return out;
};
const sameName = (classId, name, exceptId) =>
  db().subjects.some(
    (s) => s.classId === classId && s.id !== exceptId && s.name.toLowerCase() === name.toLowerCase(),
  );

// ── admin: accounts & classes ──
const findClass = (id) => db().classes.find((c) => c.id === id) ?? fail(404, "Class not found");
const findUser = (id) => users().find((u) => u.id === id) ?? fail(404, "Account not found");
// A parent's contact is visible to admins and to the teacher of the student's class only: others get 404, students 403.
const guardianStudent = (user, id) => {
  if (user.role === "student") fail(403, "You don't have access to this");
  const student = users().find((u) => u.id === id && u.role === "student");
  const allowed = student && (user.role === "admin" || classesFor(user).some((c) => c.id === student.classId));
  return allowed ? student : fail(404, "Student not found");
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanName = (v, what) => {
  const n = String(v ?? "").trim().replace(/\s+/g, " ");
  if (!n) fail(400, `${what} is required`, "INVALID_INPUT");
  if (n.length > 80) fail(400, `${what} can be up to 80 characters`, "INVALID_INPUT");
  return n;
};
const teacherIdsOf = (ids) => {
  const list = [...new Set(ids ?? [])];
  list.forEach((id) => findUser(id).role === "teacher" || fail(400, "Only teachers can be assigned to a class", "INVALID_INPUT"));
  return list;
};
// "Grade 11 — Section A" → "11A"; anything else → its first letters/digits.
const codeFor = (name) => {
  const grade = /(\d+)/.exec(name)?.[1];
  const section = /section\s+([a-z0-9]+)/i.exec(name)?.[1];
  if (grade && section) return `${grade}${section.toUpperCase()}`;
  return name.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "CLS";
};
const nextRoll = (cls) => {
  const nums = studentsOf(cls).map((u) => Number(/-(\d+)$/.exec(u.roll ?? "")?.[1]) || 0);
  return `${cls.code}-${String(Math.max(0, ...nums) + 1).padStart(2, "0")}`;
};
const percentFor = (name) => {
  const done = db().attempts.filter((a) => a.student === name && a.status === "submitted");
  let earned = 0;
  let max = 0;
  done.forEach((a) => {
    const t = totalsOf(a.questions, a.grades);
    earned += t.earned;
    max += t.max;
  });
  return max ? Math.round((earned / max) * 100) : null;
};

// ── materials: validate the upload, then pretend to read each item ──
const UPLOAD_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif", "text/plain"];
const mockText = (m, route) => {
  const title = m.name.replace(/\.[^.]+$/, "");
  const unclear = route === "vision" || route === "ocr" ? "\n\nSign conventions matter! [unclear — probably \"positive direction is up the slope\"]" : "";
  return m.tag === "pastpaper"
    ? `${title} — Final Examination${m.year ? ` ${m.year}` : ""}\n\nSection A · Questions\n${fakePaperQuestions(m.year ?? m.name.length)}${unclear}`
    : `Course Outline — ${title}\n\nUnit 1 · Mechanics\nNewton's three laws of motion, free body diagrams, application of F = ma.\n\nUnit 2 · Energy & Momentum\nWork, kinetic and potential energy. Conservation of energy.\n\nUnit 3 · Thermodynamics\nTemperature and heat. First law of thermodynamics.${unclear}`;
};
const QUALITY = { direct: "high", "as-is": "high", vision: "med", ocr: "low" };
const materialView = (m) => ({
  id: m.id, subjectId: m.subjectId, name: m.name, tag: m.tag, ...(m.year ? { year: m.year } : {}),
  route: m.route, quality: m.quality, chars: m.text.length, text: m.text, edited: m.text !== m.original,
  warnings: m.warnings, createdAt: m.createdAt,
  ...(m.tag === "pastpaper" ? { questionCount: m.questions?.length ?? 0 } : {}),
});
const findMaterial = (id, user) => {
  const m = db().materials.find((x) => x.id === id) ?? fail(404, "Material not found");
  findSubject(m.subjectId, user);
  return m;
};
const extractMaterials = (body, now, subject) => {
  const bad = (msg, code, status = 400) => fail(status, msg, code);
  if (!(body instanceof FormData)) bad("Send the upload as multipart/form-data", "INVALID_UPLOAD");
  let manifest;
  try {
    manifest = JSON.parse(body.get("manifest") ?? "");
  } catch {
    bad("The upload is missing its manifest", "INVALID_UPLOAD");
  }
  if (!Array.isArray(manifest) || !manifest.length) bad("Add at least one item", "INVALID_UPLOAD");
  if (manifest.length > 20) bad("Upload up to 20 items at a time", "TOO_MANY_ITEMS");
  const files = body.getAll("files");
  const texts = body.getAll("pastedText");
  if (
    files.length !== manifest.filter((m) => m.source === "file").length ||
    texts.length !== manifest.filter((m) => m.source === "text").length
  )
    bad("The manifest doesn't match the files sent", "INVALID_UPLOAD");

  const thisYear = new Date(now).getFullYear();
  // Extracted items are stored on the subject so they can be reviewed and corrected.
  const records = []; // stored only once the whole upload validates
  const keep = (base, route, text, warnings) => {
    const rec = { id: createId(), subjectId: subject.id, name: base.name, tag: base.tag, year: base.year, route, quality: QUALITY[route], original: text, text, warnings, createdAt: now, ...(base.tag === "pastpaper" ? { questions: splitQuestions(text) } : {}) };
    records.push(rec);
    return { ...base, id: rec.id, status: "extracted", route, quality: rec.quality, chars: text.length, warnings };
  };
  let f = 0;
  let t = 0;
  const items = manifest.map((m, index) => {
    if (m.tag !== "outline" && m.tag !== "pastpaper") bad(`Item ${index + 1}: tag must be outline or pastpaper`, "INVALID_TAG");
    if (m.year !== undefined && (m.tag !== "pastpaper" || !Number.isInteger(m.year) || m.year < 1990 || m.year > thisYear))
      bad(`Item ${index + 1}: a year only applies to past papers (1990–${thisYear})`, "INVALID_YEAR");
    const base = { index, name: m.name, tag: m.tag, ...(m.year ? { year: m.year } : {}) };
    if (m.source === "text") {
      const text = String(texts[t++] ?? "");
      if (text.length > 200_000) bad("Pasted text is over 200,000 characters", "INVALID_UPLOAD", 413);
      if (!text.trim()) return { ...base, status: "failed", route: "as-is", chars: 0, warnings: [], error: "The pasted text is empty" };
      return keep(base, "as-is", text, []);
    }
    const file = files[f++];
    if (file.size > 25 * 1024 * 1024) bad(`${m.name} is over the 25 MB limit`, "FILE_TOO_LARGE", 413);
    if (file.type && !UPLOAD_TYPES.includes(file.type)) bad(`${m.name} isn't a supported file type`, "UNSUPPORTED_TYPE", 415);
    const route = file.type === "application/pdf" ? (/scan/i.test(m.name) ? "ocr" : "direct") : file.type.startsWith("image/") ? "vision" : "as-is";
    if (file.size === 0) return { ...base, status: "failed", route, chars: 0, warnings: [], error: "The file is empty" };
    if (/corrupt/i.test(m.name)) return { ...base, status: "failed", route, chars: 0, warnings: [], error: "We couldn't open this file — try exporting it again" };
    return keep(base, route, mockText(m, route), route === "ocr" ? ["Low-quality scan — check the extracted text before using it"] : []);
  });
  db().materials.push(...records);
  const ok = items.some((i) => i.status === "extracted");
  const noYear = items.filter((i) => i.status === "extracted" && i.tag === "pastpaper" && !i.year).length;
  return {
    topics: ok ? EXTRACTED_TOPICS : [],
    items,
    warnings: noYear ? [`${noYear} past paper${noYear > 1 ? "s have" : " has"} no year, so recurring-question counts will be less reliable`] : [],
  };
};

// ── question bank ──
const bankView = (b) => ({ ...b });
const findBank = (id, user) => {
  const b = db().bank.find((x) => x.id === id) ?? fail(404, "Question not found");
  findSubject(b.subjectId, user);
  return b;
};
const cleanBankQuestion = (body) => {
  const topic = String(body?.topic ?? "").trim();
  if (!topic) fail(400, "Give the question a topic", "INVALID_QUESTION");
  if (topic.length > 80) fail(400, "Topics can be up to 80 characters", "INVALID_QUESTION");
  const marks = Number(body?.marks);
  if (!Number.isInteger(marks) || marks < 1 || marks > 100) fail(400, "Marks must be a whole number from 1 to 100", "INVALID_QUESTION");
  const q = normalizeQuestion({ id: "x", ...body, topic, text: String(body?.text ?? "").trim() });
  if (!QUESTION_TYPES[body?.type]) fail(400, "Choose a question type", "INVALID_QUESTION");
  if (q.text.length > 4000) fail(400, "The question is over 4,000 characters", "INVALID_QUESTION");
  const issue = validateQuestions([q])[0];
  if (issue) fail(400, `This question isn't ready: ${issue.message}`, "INVALID_QUESTION");
  const { id, sources, bankId, ...fields } = q; // eslint-disable-line no-unused-vars
  return fields;
};
const sameText = (a, b) => a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");
/** On publish: reused bank questions count as used; new ones are kept for next time. */
const saveToBank = (test, now) => {
  const sets = test.mode === "personal" ? (test.variants ?? []).map((v) => v.questions) : [test.questionSet ?? []];
  const seen = new Set();
  let added = 0;
  let reused = 0;
  sets.flat().forEach((q) => {
    const key = q.bankId ?? q.text.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const existing = q.bankId
      ? db().bank.find((b) => b.id === q.bankId)
      : db().bank.find((b) => b.subjectId === test.subjectId && sameText(b.text, q.text));
    if (existing) {
      existing.used += 1;
      existing.lastUsed = now;
      reused++;
    } else {
      const { id, sources, bankId, ...fields } = q; // eslint-disable-line no-unused-vars
      db().bank.push({ id: createId(), subjectId: test.subjectId, ...fields, source: "generated", used: 1, lastUsed: now, createdAt: now, updatedAt: now });
      added++;
    }
  });
  return { added, reused };
};

/** Publish-dialog settings: known keys only, right types. Anything else is a 400. */
const SETTING_RULES = {
  release: (v) => v === "immediately" || v === "after_close",
  aiGrading: (v) => typeof v === "boolean",
  allowBack: (v) => typeof v === "boolean",
  requireFullscreen: (v) => typeof v === "boolean",
  blockCopyPaste: (v) => typeof v === "boolean",
  shuffleQuestions: (v) => typeof v === "boolean",
  shuffleOptions: (v) => typeof v === "boolean",
};
const cleanSettings = (input) => {
  if (input === undefined || input === null) return {};
  if (typeof input !== "object" || Array.isArray(input)) fail(400, "settings must be an object", "INVALID_SETTINGS");
  Object.entries(input).forEach(([key, value]) => {
    if (!SETTING_RULES[key]) fail(400, `Unknown setting "${key}"`, "INVALID_SETTINGS");
    if (!SETTING_RULES[key](value)) fail(400, `Invalid value for "${key}"`, "INVALID_SETTINGS");
  });
  return input;
};

// Live-row progress for the teacher's test list: who has started / submitted
// out of everyone who may sit it (class roster, or one variant per student).
const progressOf = (test) => {
  const attempts = db().attempts.filter((a) => a.testId === test.id);
  const cls = db().classes.find((c) => c.id === test.classId);
  const expected = test.mode === "personal" ? (test.variants?.length ?? 0) : cls ? studentsOf(cls).length : 0;
  return {
    started: attempts.length,
    submitted: attempts.filter((a) => a.status === "submitted").length,
    expected,
  };
};

const teacherNamesOf = (test) => {
  const cls = db().classes.find((c) => c.id === test.classId);
  return (cls?.teacherIds ?? []).map((id) => users().find((u) => u.id === id)?.name).filter(Boolean).join(", ");
};

const classCodesOf = (teacherId) =>
  db()
    .classes.filter((c) => c.teacherIds.includes(teacherId))
    .map((c) => c.code);

const findTest = (id) => db().tests.find((t) => t.id === id) ?? fail(404, "Test not found");
const touch = (test, patch) => {
  Object.assign(test, patch, { updatedAt: Date.now() });
  save();
  return test;
};

// ── attempts (server-side lifecycle) ─────────────────────────────
const submit = (attempt, test, reason, answers, now, actor = null) => {
  if (attempt.status === "submitted") return attempt;
  const finalAnswers = { ...attempt.answers, ...(answers ?? {}) };
  Object.assign(attempt, {
    answers: finalAnswers,
    status: "submitted",
    submittedAt: now,
    submitReason: reason,
    grades: buildGrades(attempt.questions, finalAnswers, { aiGrading: settingsOf(test).aiGrading }),
  });
  recordSubmission(attempt, test, reason, finalAnswers, actor, now);
  save();
  return attempt;
};

// Runs before every request, standing in for the server's own timers: close
// attempts that ran out of time, or whose test ended and the student's browser
// never submitted (they poll every ~20 s, so 30 s is generous).
const STOP_GRACE_MS = 30_000;
export const sweep = (now) => {
  db().attempts.forEach((a) => {
    if (a.status !== "in_progress") return;
    const test = db().tests.find((t) => t.id === a.testId);
    if (!test) return;
    if (now >= a.deadline) return submit(a, test, "timeout", null, now);
    const closedAt = test.stoppedAt ?? test.schedule?.availableUntil ?? null;
    if (closedAt && now >= closedAt && now - closedAt > STOP_GRACE_MS) {
      submit(a, test, "stopped", null, now);
    }
    return undefined;
  });
};

/** Every student the test applies to (the class; in personalized mode only those with a variant) + their attempt. */
const classRows = (test) =>
  users()
    .filter(
      (u) =>
        u.role === "student" &&
        u.cls === test.cls &&
        (test.mode !== "personal" || variantIndexFor(test, u.name) >= 0),
    )
    .map((u) => ({
      student: { id: u.id, name: u.name, roll: u.roll },
      attempt: db().attempts.find((x) => x.testId === test.id && x.student === u.name) ?? null,
    }));

/** A student's page just talked to the server: remember it (teacher's "no signal" clue). */
const seen = (attempt, now) => {
  if (attempt?.status === "in_progress") attempt.lastSeenAt = now;
};

/** Teacher analytics scope: a class of theirs + one of its subjects → that subject's published tests. */
const analyticsScope = (user, query, now) => {
  const cls = classesFor(user).find((c) => c.id === query.classId) ?? fail(404, "Class not found");
  const subject = db().subjects.find((x) => x.id === query.subjectId && x.classId === cls.id) ?? fail(404, "Subject not found");
  const tests = db().tests.filter((t) => t.subjectId === subject.id && statusOf(t, now) !== "draft");
  return { cls, subject, tests };
};

/** Reports (F12b) ─────────────────────────────────────────────── */
const REPORT_CHANNELS = ["pdf", "whatsapp", "copy"];
const toMs = (v) => (typeof v === "number" ? v : v ? Date.parse(v) : NaN);

/**
 * Everything the pure report builder needs, for one student of the teacher's class. A report holds
 * confirmed marks only: final grades of tests already released to the student. `q` is the GET query
 * or the POST body (same field names; `from`/`to` are ISO strings or ms).
 */
const reportInputs = (user, q, now) => {
  const student = users().find((u) => u.id === q.studentId && u.role === "student") ?? fail(404, "Student not found");
  const cls = classesFor(user).find((c) => c.id === student.classId) ?? fail(404, "Student not found");
  if (q.preset !== "weekly" && q.preset !== "test") fail(400, "Choose a report type", "INVALID_REPORT");
  const subjects = db().subjects.filter((s) => s.classId === cls.id);
  const subject = q.subjectId ? (subjects.find((s) => s.id === q.subjectId) ?? fail(404, "Subject not found")) : null;
  const tests = db().tests.filter((t) => (!subject || t.subjectId === subject.id) && subjects.some((s) => s.id === t.subjectId) && statusOf(t, now) !== "draft");
  const testIds = new Set(tests.map((t) => t.id));
  const attempts = db().attempts.filter((a) => testIds.has(a.testId));
  const all = buildStudentHistory({ student: student.name, tests, attempts });
  const attemptOfRow = (r) => attempts.find((a) => a.id === r.id);
  const isOut = (r) => r.status === "final" && isReleased(tests.find((t) => t.id === r.testId), attemptOfRow(r), now);
  const info = { id: student.id, name: student.name, roll: student.roll, cls: cls.code };
  const base = { student: info, subjects: subjects.map((s) => ({ id: s.id, name: s.name })), subjectName: subject?.name ?? null, preset: q.preset };
  const topicsOf = (rows) =>
    buildStudentAnalytics({ student: student.name, tests, attempts: attempts.filter((a) => rows.some((r) => r.id === a.id)), isReleased: () => true }).topics.map((t) => ({ name: t.name, accuracy: t.accuracy }));

  if (q.preset === "test") {
    const row = all.find((r) => r.testId === q.testId) ?? fail(404, "Test not found");
    if (!isOut(row)) fail(409, "This result isn't final and released to the student yet", "NOT_READY");
    const a = attemptOfRow(row);
    return {
      ...base,
      period: { key: "test", from: row.at, to: row.at },
      rows: [row],
      topics: topicsOf([row]),
      questions: a.questions.map((qn, i) => ({ no: i + 1, topic: qn.topic ?? "", marks: a.grades?.[qn.id]?.marks ?? 0, max: a.grades?.[qn.id]?.max ?? qn.marks, feedback: a.grades?.[qn.id]?.feedback ?? "" })),
      excluded: { pending: 0, unreleased: 0 },
    };
  }

  const from = toMs(q.from);
  const to = toMs(q.to);
  if (!validRange(from, to) || from == null || to == null) fail(400, "Pick a valid date range", "INVALID_REPORT");
  const inRange = all.filter((r) => r.at >= from && r.at <= to);
  const rows = all.filter((r) => isOut(r) && r.at <= to);
  return {
    ...base,
    period: { key: typeof q.period === "string" ? q.period : "custom", from, to },
    rows,
    topics: topicsOf(rows.filter((r) => r.at >= from)),
    questions: null,
    excluded: { pending: inRange.filter((r) => r.status === "pending").length, unreleased: inRange.filter((r) => r.status === "final" && !isOut(r)).length },
  };
};

/** One report snapshot (id + content hash, never the text) for what `reportInputs` returned. */
const issueReport = (user, i, body, now) => {
  const sections = Object.fromEntries(Object.entries(body?.options?.sections ?? {}).filter(([, v]) => typeof v === "boolean"));
  const options = { sections, language: body?.options?.language, comment: typeof body?.options?.comment === "string" ? body.options.comment : "" };
  const report = buildReport({ student: i.student, preset: i.preset, period: i.period, subjectName: i.subjectName, rows: i.rows, topics: i.topics, questions: i.questions, excluded: i.excluded, options, now });
  const snapshot = {
    id: createId(),
    studentId: i.student.id,
    createdBy: user.id,
    createdAt: now,
    preset: i.preset,
    period: i.preset === "test" ? null : { key: i.period.key, from: i.period.from, to: i.period.to },
    testId: i.preset === "test" ? body.testId : null,
    contentHash: reportContentHash(report),
  };
  (db().reports ??= []).push(snapshot);
  save();
  return snapshot;
};

/** Courses & lessons (F9a) ─────────────────────────────────────── */
const courseOr404 = (id, user) => {
  const c = db().courses.find((x) => x.id === id) ?? fail(404, "Course not found");
  findSubject(c.subjectId, user); // a teacher only reaches courses of their own classes
  return c;
};
const lessonOr404 = (id, user) => {
  const l = db().lessons.find((x) => x.id === id) ?? fail(404, "Lesson not found");
  return { lesson: l, course: courseOr404(l.courseId, user) };
};
const lessonsOf = (courseId) => db().lessons.filter((l) => l.courseId === courseId).sort((a, b) => a.order - b.order);
const classStudentNames = (classId) => users().filter((u) => u.role === "student" && u.classId === classId).map((u) => u.name);
const reindex = (courseId) => lessonsOf(courseId).forEach((l, i) => (l.order = i));

/** The lesson fields a teacher may set, cleaned; fails with the message the form shows. */
const cleanLesson = (body, subjectId, now) => {
  const lesson = {
    kind: body.kind,
    title: String(body.title ?? "").trim(),
    duration: String(body.duration ?? "").trim().slice(0, 40),
    body: String(body.body ?? ""),
    url: String(body.url ?? "").trim(),
    testId: body.testId || null,
  };
  const problem = validateLesson(lesson);
  if (problem) fail(400, problem, "INVALID_LESSON");
  if (lesson.kind === "text") lesson.url = "";
  if (lesson.testId) {
    const t = db().tests.find((x) => x.id === lesson.testId);
    if (!t || t.subjectId !== subjectId || statusOf(t, now) === "draft")
      fail(400, "Pick a published test from this subject", "INVALID_TEST");
  }
  return lesson;
};

const teacherCourse = (c) => {
  const subject = db().subjects.find((s) => s.id === c.subjectId);
  const names = new Set(classStudentNames(subject?.classId));
  return {
    id: c.id,
    subjectId: c.subjectId,
    subject: subject?.name ?? "",
    title: c.title,
    students: names.size,
    lessons: lessonsOf(c.id).map((l) => ({
      ...l,
      doneCount: db().lessonProgress.filter((p) => p.lessonId === l.id && names.has(p.student)).length,
    })),
  };
};

const studentCourse = (c, user, now) => {
  const subject = db().subjects.find((s) => s.id === c.subjectId);
  const mine = new Set(db().lessonProgress.filter((p) => p.student === user.name).map((p) => p.lessonId));
  const lessons = lessonsOf(c.id).map((l) => {
    const t = l.testId ? db().tests.find((x) => x.id === l.testId) : null;
    const status = t ? statusOf(t, now) : null;
    return {
      id: l.id,
      order: l.order,
      kind: l.kind,
      title: l.title,
      duration: l.duration,
      body: l.body,
      url: l.url,
      done: mine.has(l.id),
      test: t && status !== "draft" ? { id: t.id, title: t.title, status } : null,
    };
  });
  return { id: c.id, subject: subject?.name ?? "", title: c.title, lessons, progress: courseProgress(lessons, (l) => l.done) };
};

/** Class discussion (F9b) ───────────────────────────────────────── */
const talks = (user) => ["teacher", "student"].includes(user.role) || fail(403, "You don't have access to this");
/** The class a person is discussing in: a teacher picks one of theirs; a student has exactly one. */
const discussionClass = (user, classId) => {
  talks(user);
  const own = classesFor(user);
  return user.role === "student" ? (own[0] ?? fail(404, "Class not found")) : (own.find((c) => c.id === classId) ?? fail(404, "Class not found"));
};
const threadOr404 = (id, user) => {
  talks(user);
  const t = db().threads.find((x) => x.id === id) ?? fail(404, "Thread not found");
  if (!classesFor(user).some((c) => c.id === t.classId)) fail(404, "Thread not found");
  return t;
};
const threadView = (t, viewer) => {
  const photo = (id) => photoFor(viewer, users().find((u) => u.id === id));
  return {
    ...t,
    authorPhotoUrl: photo(t.authorId),
    replies: [...t.replies].sort((a, b) => a.createdAt - b.createdAt).map((r) => ({ ...r, authorPhotoUrl: photo(r.authorId) })),
  };
};

const myAttempt = (user, testId) =>
  db().attempts.find((a) => a.testId === testId && a.student === user.name) ?? null;

// ── generation ───────────────────────────────────────────────────
/** Personalized drafts are "written" one student at a time; class drafts are instant. */
const generationFor = (variants, now) =>
  variants ? { total: variants.length, startedAt: now, perTestMs: GENERATION_MS_PER_TEST } : null;
const stillGenerating = (test, now) => generationOf(test, now)?.status === "running";

const generateContent = (config, seed, subjectId, now) => {
  const opts = { seed, topics: config.focusTopics };
  // Personalized variants: the subject's class, each student's weak topic from their graded tests.
  const subject = db().subjects.find((x) => x.id === subjectId);
  const classStudents = users()
    .filter((u) => u.role === "student" && u.classId === subject?.classId)
    .map((u) => ({ id: u.id, name: u.name, roll: u.roll }));
  const subjectTests = db().tests.filter((t) => t.subjectId === subjectId && statusOf(t, now) !== "draft");
  const subjectTestIds = new Set(subjectTests.map((t) => t.id));
  const weak =
    config.mode === "personal"
      ? weakTopicMap({
          tests: subjectTests,
          attempts: db().attempts.filter((a) => subjectTestIds.has(a.testId)),
          students: classStudents,
        })
      : {};
  // Questions picked from the bank come first; the generated ones only fill
  // what's left of each type in the mix.
  const picked = (config.bankQuestionIds ?? []).map((id) => db().bank.find((b) => b.id === id)).filter(Boolean);
  const mix = config.mix.map((r) => ({ ...r }));
  picked.forEach((b) => {
    const row = mix.find((r) => r.type === b.type && r.count > 0);
    if (row) row.count -= 1;
  });
  const fromBank = () =>
    picked.map((b) =>
      normalizeQuestion({
        ...b,
        id: createId(),
        bankId: b.id,
        sources: [{ kind: "bank", label: "Your question bank", snippet: `Reused — used in ${b.used} test${b.used === 1 ? "" : "s"} so far.` }],
      }),
    );
  const content =
    config.mode === "personal"
      ? {
          questionSet: null,
          variants: buildVariants(mix, classStudents, { ...opts, weak }).map((v) => ({ ...v, questions: [...fromBank(), ...v.questions] })),
        }
      : { questionSet: [...fromBank(), ...buildQuestions(mix, opts)], variants: null };
  const topics = subjectTopics(db().materials.filter((m) => m.subjectId === subjectId));
  const lists = content.variants ? content.variants.map((v) => v.questions) : [content.questionSet];
  content.research = attachSources(lists, topics, { webResearch: config.webResearch, now });
  return content;
};
const autoTitle = (config) =>
  `${(config.focusTopics ?? []).slice(0, 2).join(" & ") || "Mixed topics"} — Test`;

// ── queue / review shaping ───────────────────────────────────────
const rollOf = (name) => users().find((u) => u.name === name)?.roll ?? "—";

// A teacher only sees (and grades) attempts of tests in their own classes.
const ownsAttempt = (user, attempt) => {
  const test = db().tests.find((t) => t.id === attempt?.testId);
  return Boolean(test) && classesFor(user).some((c) => c.id === test.classId);
};

const queueItems = (user, now = Date.now()) => {
  const items = [];
  db().attempts.forEach((a) => {
    if (a.status !== "submitted" || !a.grades) return;
    const test = db().tests.find((t) => t.id === a.testId);
    if (!test || !ownsAttempt(user, a)) return;
    const flags = a.flags.length;
    a.questions.forEach((q) => {
      if (isChoice(q)) return;
      const g = a.grades[q.id];
      if (!g) return;
      items.push({
        id: `${a.id}:${q.id}`,
        attemptId: a.id,
        questionId: q.id,
        testId: test.id,
        student: a.student,
        roll: rollOf(a.student),
        test: test.title,
        submittedAt: a.submittedAt,
        question: q.text,
        topic: q.topic,
        answer: a.answers[q.id] ?? "",
        modelAnswer: q.expectedAnswer ?? "",
        maxScore: g.max,
        score: g.marks,
        aiScore: g.aiMarks ?? null,
        confidence: confidenceLabel(g.confidence),
        manual: g.aiMarks == null,
        status: g.status === "final" ? "reviewed" : "pending",
        source: g.source,
        rubric: g.rubric,
        feedback: g.feedback ?? "",
        flags,
        released: isReleased(test, a, now),
      });
    });
  });
  return items;
};

// ── the route table ──────────────────────────────────────────────
const ROUTES = [
  // ───── auth ─────
  {
    method: "POST",
    path: "/auth/login",
    public: true,
    handler: ({ body }) => {
      // The real backend picks the account from the credentials. The fake
      // one also accepts a `role` hint so the demo can sign in as anyone.
      const user =
        users().find((u) => u.email === body?.email?.trim().toLowerCase()) ??
        users().find((u) => u.role === (body?.role ?? "teacher") && u.active) ??
        fail(401, "Wrong email or password");
      if (!user.active) fail(403, "This account has been deactivated. Ask your administrator.", "ACCOUNT_DISABLED");
      return { token: `mock.${user.id}`, user: userView(user) };
    },
  },
  { method: "GET", path: "/auth/me", handler: ({ user }) => userView(user) },
  {
    // The mock keeps no passwords, so it checks the rules and the flow, not that `current` is right
    // (the real server compares the hash and answers 400 WRONG_PASSWORD).
    method: "POST",
    path: "/auth/change-password",
    handler: ({ user, body, now }) => {
      const { current, next } = body ?? {};
      if (typeof current !== "string" || !current) fail(400, "Enter your current password", "INVALID_INPUT");
      if (typeof next !== "string") fail(400, "Enter a new password", "INVALID_INPUT");
      const problem = validatePassword(next, { email: user.email, current });
      if (problem) fail(400, PASSWORD_MESSAGES[problem], problem);
      user.mustChangePassword = false;
      user.passwordChangedAt = new Date(now).toISOString();
      save();
      return null;
    },
  },

  // ───── profile photo ─────
  {
    method: "PUT",
    path: "/profile/photo",
    handler: ({ user, body }) => {
      if (!canUploadPhoto({ role: user.role, institution: institutionView() })) fail(403, "Student photos are switched off by your institution", "PHOTOS_DISABLED");
      const problem = validatePhotoDataUrl(body?.dataUrl);
      if (problem) fail(400, problem, "INVALID_PHOTO");
      user.photo = body.dataUrl;
      save();
      return profileView(user);
    },
  },
  {
    method: "DELETE",
    path: "/profile/photo",
    handler: ({ user }) => {
      delete user.photo;
      save();
      return profileView(user);
    },
  },
  {
    method: "DELETE",
    path: "/users/:id/photo",
    handler: ({ user, params }) => {
      as(user, "admin");
      delete findUser(params.id).photo;
      save();
      return null;
    },
  },

  // ───── institution (every role reads; admin writes) ─────
  { method: "GET", path: "/institution/public", public: true, handler: () => brandingOf(institutionView()) },
  { method: "GET", path: "/institution", handler: () => institutionView() },
  {
    // A partial update (only the fields sent change), kept as PUT to match the contract.
    method: "PUT",
    path: "/institution",
    handler: ({ user, body, now }) => {
      as(user, "admin");
      const patch = body && typeof body === "object" && !Array.isArray(body) ? body : {};
      const errors = validateInstitutionPatch(patch);
      if (errors) fail(400, Object.values(errors)[0], "INVALID_INSTITUTION");
      const before = institutionView();
      const next = { ...before };
      for (const k of Object.keys(patch)) next[k] = typeof patch[k] === "string" ? patch[k].trim() : patch[k];
      if (institutionChangedFields(before, next).length) {
        next.updatedAt = new Date(now).toISOString();
        db().institution = next;
        save();
      }
      return institutionView();
    },
  },

  // ───── privacy policy (public to read; admin writes; the text is plain text, never HTML) ─────
  {
    method: "GET",
    path: "/institution/privacy",
    public: true,
    handler: ({ user }) => privacyView(db().privacy ?? null, institutionView(), { admin: user?.role === "admin" }),
  },
  {
    method: "PUT",
    path: "/institution/privacy",
    handler: ({ user, body, now }) => {
      as(user, "admin");
      const errors = validatePrivacyPatch(body);
      if (errors) fail(400, Object.values(errors)[0], "INVALID_PRIVACY");
      const cur = effectivePolicy(db().privacy ?? null);
      const next = { ...cur };
      if ("text" in body) next.text = body.text.trim() + "\n";
      if ("effectiveDate" in body) next.effectiveDate = body.effectiveDate || "";
      if ("reviewed" in body) next.reviewed = body.reviewed;
      if (next.text !== cur.text) next.version = cur.version + 1; // only a change of wording is a new version
      const changed = privacyChangedFields(cur, next);
      if (changed.length) {
        next.updatedAt = new Date(now).toISOString();
        db().privacy = next;
        save();
      }
      return privacyView(db().privacy ?? null, institutionView(), { admin: true });
    },
  },

  // ───── profile (everyone, own data only) ─────
  { method: "GET", path: "/profile", handler: ({ user }) => profileView(user) },
  {
    method: "PATCH",
    path: "/profile",
    handler: ({ user, body }) => {
      const patch = body && typeof body === "object" && !Array.isArray(body) ? body : {};
      const prefsAfter = "prefs" in patch && patch.prefs && typeof patch.prefs === "object" && !Array.isArray(patch.prefs)
        ? mergePrefs(user.prefs, patch.prefs)
        : undefined;
      const errors = validateProfilePatch(patch, prefsAfter);
      if (errors) fail(400, Object.values(errors)[0], "INVALID_PROFILE");
      if (patch.prefs?.parentSummary != null && user.role !== "teacher") fail(400, "Only teachers have a parent message style", "INVALID_PROFILE");
      if ("bio" in patch) user.bio = patch.bio.trim();
      if ("phone" in patch) user.phone = patch.phone.trim();
      if (prefsAfter) user.prefs = prefsAfter;
      save();
      return profileView(user);
    },
  },

  // ───── admin: accounts ─────
  {
    method: "GET",
    path: "/users",
    handler: ({ user, query }) => {
      as(user, "admin");
      return users()
        .filter((u) => u.role !== "admin" && (!query.role || u.role === query.role))
        // The list only says whether a parent number is on file (admin home + Accounts filter); never the number.
        .map((u) => ({ ...userView(u, user), ...(u.role === "student" ? { hasParentContact: !!u.guardianPhone } : {}) }));
    },
  },
  {
    method: "POST",
    path: "/users",
    handler: ({ user, body }) => {
      as(user, "admin");
      const name = cleanName(body?.name, "Name");
      const email = String(body?.email ?? "").trim().toLowerCase();
      if (!EMAIL.test(email)) fail(400, "Enter a valid email address", "INVALID_INPUT");
      if (users().some((u) => u.email === email)) fail(409, "An account with this email already exists", "DUPLICATE_EMAIL");
      const role = body?.role;
      if (role !== "teacher" && role !== "student") fail(400, "Role must be teacher or student", "INVALID_INPUT");
      // The mock keeps no passwords. The temporary one is generated here, returned once, and must be changed at first sign-in.
      const account = { id: createId(), name, email, role, active: true, mustChangePassword: true };
      if (role === "student") {
        const cls = findClass(body?.classId ?? fail(400, "Choose a class for the student", "INVALID_INPUT"));
        Object.assign(account, { cls: cls.code, classId: cls.id, roll: nextRoll(cls) });
        // optional parent contact (F12c1): validated before anything is created; empty = none
        const given = { name: body?.guardianName ?? "", phone: body?.guardianPhone ?? "" };
        const bad = validateGuardian(given);
        if (bad) fail(400, Object.values(bad)[0], "INVALID_GUARDIAN");
        const g = cleanGuardian(given);
        if (g.name) account.guardianName = g.name;
        if (g.phone) account.guardianPhone = g.phone;
      } else if (body?.guardianName || body?.guardianPhone) {
        fail(400, "Only students have a parent contact", "INVALID_INPUT");
      }
      users().push(account);
      if (role === "teacher") {
        teacherIdsOf([account.id]); // (validates the new account is a teacher)
        (body?.classIds ?? []).forEach((id) => findClass(id).teacherIds.push(account.id));
      }
      save();
      return { ...userView(account, user), temporaryPassword: generateTemporaryPassword() };
    },
  },
  {
    method: "POST",
    path: "/users/:id/reset-password",
    handler: ({ user, params }) => {
      as(user, "admin");
      const account = findUser(params.id);
      if (account.role === "admin") fail(409, "Administrator accounts can't be reset here", "CANNOT_CHANGE_ADMIN");
      account.mustChangePassword = true;
      save();
      return { temporaryPassword: generateTemporaryPassword() };
    },
  },
  {
    method: "PUT",
    path: "/users/:id",
    handler: ({ user, params, body }) => {
      as(user, "admin");
      const account = findUser(params.id);
      if (account.role === "admin") fail(409, "Administrator accounts can't be changed here", "CANNOT_CHANGE_ADMIN");
      if (body?.active !== undefined) {
        if (account.id === user.id) fail(409, "You can't deactivate your own account", "CANNOT_CHANGE_SELF");
        account.active = !!body.active;
      }
      if (body && "classId" in body) {
        if (account.role !== "student") fail(400, "Only students are enrolled in a class", "INVALID_INPUT");
        const cls = body.classId ? findClass(body.classId) : null;
        Object.assign(account, {
          classId: cls?.id ?? null,
          cls: cls?.code ?? null,
          roll: cls ? (account.roll?.startsWith(`${cls.code}-`) ? account.roll : nextRoll(cls)) : account.roll,
        });
      }
      save();
      return userView(account, user);
    },
  },
  {
    method: "DELETE",
    path: "/users/:id",
    handler: ({ user, params }) => {
      as(user, "admin");
      const account = findUser(params.id);
      if (account.role === "admin") fail(409, "Administrator accounts can't be removed here", "CANNOT_CHANGE_ADMIN");
      db().users = users().filter((u) => u.id !== account.id);
      db().classes.forEach((c) => (c.teacherIds = c.teacherIds.filter((id) => id !== account.id)));
      save();
      return null;
    },
  },

  // ───── parent contact (admin, or the teacher of the student's class; never the student) ─────
  {
    method: "GET",
    path: "/students/:id/guardian",
    handler: ({ user, params }) => guardianView(guardianStudent(user, params.id)),
  },
  {
    method: "PUT",
    path: "/students/:id/guardian",
    handler: ({ user, params, body }) => {
      const student = guardianStudent(user, params.id);
      const errors = validateGuardian(body);
      if (errors) fail(400, Object.values(errors)[0], "INVALID_GUARDIAN");
      // only the keys sent change; "" removes
      const next = cleanGuardian({ name: "name" in body ? body.name : student.guardianName, phone: "phone" in body ? body.phone : student.guardianPhone });
      if (next.name) student.guardianName = next.name;
      else delete student.guardianName;
      if (next.phone) student.guardianPhone = next.phone;
      else delete student.guardianPhone;
      save();
      return guardianView(student);
    },
  },

  // ───── classes & subjects ─────
  {
    method: "GET",
    path: "/classes",
    handler: ({ user }) => classesFor(user).map(classView),
  },
  {
    method: "POST",
    path: "/classes",
    handler: ({ user, body }) => {
      as(user, "admin");
      const name = cleanName(body?.name, "Class name");
      const code = codeFor(name);
      if (db().classes.some((c) => c.code === code || c.name.toLowerCase() === name.toLowerCase()))
        fail(409, `A class like "${name}" already exists`, "DUPLICATE_CLASS");
      const cls = { id: `cls-${code.toLowerCase()}`, code, name, teacherIds: teacherIdsOf(body?.teacherIds) };
      db().classes.push(cls);
      save();
      return classView(cls);
    },
  },
  {
    method: "PUT",
    path: "/classes/:id",
    handler: ({ user, params, body }) => {
      as(user, "admin");
      const cls = findClass(params.id);
      if (body?.name !== undefined) {
        const name = cleanName(body.name, "Class name");
        if (db().classes.some((c) => c.id !== cls.id && c.name.toLowerCase() === name.toLowerCase()))
          fail(409, `A class called "${name}" already exists`, "DUPLICATE_CLASS");
        cls.name = name;
      }
      if (body?.teacherIds !== undefined) cls.teacherIds = teacherIdsOf(body.teacherIds);
      save();
      return classView(cls);
    },
  },
  {
    method: "DELETE",
    path: "/classes/:id",
    handler: ({ user, params }) => {
      as(user, "admin");
      const cls = findClass(params.id);
      if (db().tests.some((t) => t.classId === cls.id))
        fail(409, "This class has tests — delete them first", "CLASS_IN_USE");
      studentsOf(cls).forEach((u) => Object.assign(u, { classId: null, cls: null }));
      db().subjects = db().subjects.filter((s) => s.classId !== cls.id);
      db().classes = db().classes.filter((c) => c.id !== cls.id);
      save();
      return null;
    },
  },
  {
    method: "GET",
    path: "/classes/:id/roster",
    handler: ({ user, params }) => {
      as(user, "admin");
      const cls = findClass(params.id);
      return {
        teachers: teachersOf(cls).map((t) => ({
          id: t.id,
          name: t.name,
          email: t.email,
          classCount: db().classes.filter((c) => c.teacherIds.includes(t.id)).length,
        })),
        students: studentsOf(cls).map((u) => ({
          id: u.id,
          name: u.name,
          roll: u.roll,
          email: u.email,
          active: u.active !== false,
          average: percentFor(u.name),
        })),
      };
    },
  },
  {
    method: "GET",
    path: "/subjects",
    handler: ({ user, query }) => {
      const ids = new Set(classesFor(user).map((c) => c.id));
      return db().subjects.filter(
        (s) => ids.has(s.classId) && (!query.classId || s.classId === query.classId),
      );
    },
  },
  {
    method: "POST",
    path: "/subjects",
    handler: ({ user, body, now }) => {
      as(user, "teacher");
      const cls = classesFor(user).find((c) => c.id === body?.classId) ?? fail(404, "Class not found");
      const fields = cleanSubject(body);
      if (sameName(cls.id, fields.name))
        fail(409, `${cls.code} already has a subject called ${fields.name}`, "DUPLICATE_SUBJECT");
      const subject = { id: createId(), classId: cls.id, outline: "", ...fields, createdAt: now, updatedAt: now };
      db().subjects.push(subject);
      save();
      return subject;
    },
  },
  {
    method: "PUT",
    path: "/subjects/:id",
    handler: ({ user, params, body, now }) => {
      as(user, "teacher");
      const subject = findSubject(params.id, user);
      const fields = cleanSubject(body, { partial: true });
      if (fields.name && sameName(subject.classId, fields.name, subject.id))
        fail(409, `That class already has a subject called ${fields.name}`, "DUPLICATE_SUBJECT");
      Object.assign(subject, fields, { updatedAt: now });
      // Tests carry the subject's name for display; keep it in step.
      if (fields.name) db().tests.forEach((t) => t.subjectId === subject.id && (t.subject = fields.name));
      save();
      return subject;
    },
  },
  {
    method: "DELETE",
    path: "/subjects/:id",
    handler: ({ user, params }) => {
      as(user, "teacher");
      const subject = findSubject(params.id, user);
      if (db().tests.some((t) => t.subjectId === subject.id) || db().courses.some((c) => c.subjectId === subject.id))
        fail(409, "This subject has tests or courses — delete or move them first", "SUBJECT_IN_USE");
      db().subjects = db().subjects.filter((s) => s.id !== subject.id);
      save();
      return null;
    },
  },

  // ───── materials ─────
  {
    method: "POST",
    path: "/subjects/:id/materials",
    delay: 2600, // extraction is slow on a real server too
    handler: ({ user, params, body, now }) => {
      as(user, "teacher");
      const subject = findSubject(params.id, user);
      const out = extractMaterials(body, now, subject);
      save();
      return out;
    },
  },
  {
    method: "GET",
    path: "/subjects/:id/materials",
    handler: ({ user, params }) => {
      as(user, "teacher");
      findSubject(params.id, user);
      return db().materials.filter((m) => m.subjectId === params.id).map(materialView);
    },
  },
  {
    method: "PUT",
    path: "/materials/:id",
    handler: ({ user, params, body }) => {
      as(user, "teacher");
      const m = findMaterial(params.id, user);
      const text = body?.text;
      if (typeof text !== "string" || !text.trim()) fail(400, "The text can't be empty", "INVALID_TEXT");
      if (text.length > 200_000) fail(413, "The text is over 200,000 characters", "INVALID_TEXT");
      m.text = text;
      if (m.tag === "pastpaper") m.questions = splitQuestions(text); // editing the text re-splits it
      save();
      return materialView(m);
    },
  },
  {
    method: "GET",
    path: "/tests/:id/generation",
    handler: ({ user, params, now }) => {
      as(user, "teacher");
      const test = findTest(params.id);
      return generationOf(test, now) ?? { status: "done" };
    },
  },
  {
    method: "GET",
    path: "/subjects/:id/bank",
    handler: ({ user, params, query }) => {
      as(user, "teacher");
      findSubject(params.id, user);
      return db()
        .bank.filter((b) => b.subjectId === params.id && (!query.topic || b.topic === query.topic) && (!query.source || b.source === query.source))
        .map(bankView);
    },
  },
  {
    method: "POST",
    path: "/subjects/:id/bank",
    handler: ({ user, params, body, now }) => {
      as(user, "teacher");
      findSubject(params.id, user);
      const fields = cleanBankQuestion(body);
      const b = { id: createId(), subjectId: params.id, ...fields, source: "manual", used: 0, lastUsed: null, createdAt: now, updatedAt: now };
      db().bank.push(b);
      save();
      return bankView(b);
    },
  },
  {
    method: "PUT",
    path: "/bank/:id",
    handler: ({ user, params, body, now }) => {
      as(user, "teacher");
      const b = findBank(params.id, user);
      Object.assign(b, cleanBankQuestion(body), { updatedAt: now });
      save();
      return bankView(b);
    },
  },
  {
    method: "DELETE",
    path: "/bank/:id",
    handler: ({ user, params }) => {
      as(user, "teacher");
      const b = findBank(params.id, user);
      db().bank = db().bank.filter((x) => x.id !== b.id);
      save();
      return null;
    },
  },
  {
    method: "GET",
    path: "/subjects/:id/topics",
    handler: ({ user, params }) => {
      as(user, "teacher");
      findSubject(params.id, user);
      return subjectTopics(db().materials.filter((m) => m.subjectId === params.id));
    },
  },
  {
    method: "GET",
    path: "/subjects/:id/clusters",
    handler: ({ user, params, query }) => {
      as(user, "teacher");
      findSubject(params.id, user);
      const threshold = query.threshold === undefined ? 0.3 : Number(query.threshold);
      if (!(threshold >= 0.1 && threshold <= 0.9)) fail(400, "threshold must be between 0.1 and 0.9", "INVALID_THRESHOLD");
      const papers = db().materials.filter((m) => m.subjectId === params.id && m.tag === "pastpaper");
      const forClustering = papers.map((p) => ({
        id: p.id,
        name: p.name,
        year: p.year,
        questions: (p.questions ?? []).map((text, i) => ({ id: `${p.id}:${i + 1}`, text })),
      }));
      const clusters = clusterQuestions(forClustering, threshold);
      return {
        threshold,
        papers: papers.map((p) => ({ id: p.id, name: p.name, ...(p.year ? { year: p.year } : {}), questionCount: p.questions?.length ?? 0 })),
        questionCount: forClustering.reduce((n, p) => n + p.questions.length, 0),
        clusters,
      };
    },
  },
  {
    method: "GET",
    path: "/materials/:id/questions",
    handler: ({ user, params }) => {
      as(user, "teacher");
      const m = findMaterial(params.id, user);
      if (m.tag !== "pastpaper") fail(409, "Only past papers are split into questions", "NOT_A_PAST_PAPER");
      return { materialId: m.id, name: m.name, questions: m.questions ?? [] };
    },
  },
  {
    method: "PUT",
    path: "/materials/:id/questions",
    handler: ({ user, params, body }) => {
      as(user, "teacher");
      const m = findMaterial(params.id, user);
      if (m.tag !== "pastpaper") fail(409, "Only past papers are split into questions", "NOT_A_PAST_PAPER");
      const list = body?.questions;
      if (!Array.isArray(list) || !list.length || list.length > 200 || list.some((q) => typeof q !== "string" || !q.trim() || q.length > 2000))
        fail(400, "Send 1–200 questions, each non-empty and up to 2,000 characters", "INVALID_QUESTIONS");
      m.questions = list.map((q) => q.trim());
      save();
      return { materialId: m.id, name: m.name, questions: m.questions };
    },
  },
  {
    method: "DELETE",
    path: "/materials/:id",
    handler: ({ user, params }) => {
      as(user, "teacher");
      const m = findMaterial(params.id, user);
      db().materials = db().materials.filter((x) => x.id !== m.id);
      save();
      return null;
    },
  },
  {
    method: "POST",
    path: "/materials/:id/reextract",
    delay: 900,
    handler: ({ user, params }) => {
      as(user, "teacher");
      const m = findMaterial(params.id, user);
      m.text = m.original; // a fresh read of the stored original
      if (m.tag === "pastpaper") m.questions = splitQuestions(m.text);
      save();
      return materialView(m);
    },
  },

  // ───── tests (read) ─────
  {
    method: "GET",
    path: "/tests",
    handler: ({ user, now }) => {
      if (user.role === "teacher") {
        return [...db().tests]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((t) => {
            const view = testForTeacher(t, now);
            return view.status === "live" ? { ...view, progress: progressOf(t) } : view;
          });
      }
      if (user.role === "student") {
        return db()
          .tests.filter(
            (t) =>
              t.status !== "draft" &&
              t.cls === user.cls &&
              (t.mode !== "personal" || variantIndexFor(t, user.name) >= 0),
          )
          .map((t) => testForStudent(t, now));
      }
      return [];
    },
  },

  // ───── tests (teacher writes) ─────
  {
    method: "POST",
    path: "/tests/generate",
    handler: ({ user, body, now }) => {
      as(user, "teacher");
      const { title, subjectId, ...rules } = body;
      if (!subjectId) fail(400, "Pick a subject first", "SUBJECT_REQUIRED");
      const subject = findSubject(subjectId, user);
      const cls = db().classes.find((c) => c.id === subject.classId);
      const bankIds = rules.bankQuestionIds ?? [];
      if (!Array.isArray(bankIds) || bankIds.some((id) => !db().bank.some((b) => b.id === id && b.subjectId === subject.id)))
        fail(400, "Some of the chosen bank questions aren't in this subject's bank", "INVALID_BANK_IDS");
      if (!rules.mix?.some((r) => r.count > 0) && !bankIds.length) fail(400, "Add at least one question first");
      if (rules.webResearch !== undefined && typeof rules.webResearch !== "boolean")
        fail(400, "webResearch must be true or false", "INVALID_INPUT");
      const test = {
        id: createId(),
        title: title?.trim() || autoTitle(rules),
        subject: subject.name,
        subjectId: subject.id,
        classId: cls.id,
        cls: cls.code,
        status: "draft",
        mode: rules.mode,
        config: rules,
        ...generateContent(rules, 0, subject.id, now),
        schedule: null,
        publishedAt: null,
        stoppedAt: null,
        regeneratedAt: null,
        settings: {},
        createdAt: now,
        updatedAt: now,
      };
      if (test.variants) test.generation = generationFor(test.variants, now);
      db().tests.unshift(test);
      save();
      return testForTeacher(test, now);
    },
  },
  {
    method: "PUT",
    path: "/tests/:id",
    handler: ({ user, params, body, now }) => {
      as(user, "teacher");
      const test = findTest(params.id);
      if (statusOf(test, now) !== "draft" && statusOf(test, now) !== "scheduled") {
        fail(409, "This test is live or finished and can't be edited", "NOT_EDITABLE");
      }
      // Edits to the questions would be applied to a half-written set of variants.
      if (stillGenerating(test, now) && (body.questionSet !== undefined || body.variants !== undefined))
        fail(409, "The personalized tests are still being generated", "GENERATION_IN_PROGRESS");
      const patch = {};
      ["title", "questionSet", "variants", "config"].forEach((k) => {
        if (body[k] !== undefined) patch[k] = body[k];
      });
      return testForTeacher(touch(test, patch), now);
    },
  },
  {
    method: "POST",
    path: "/tests/:id/regenerate",
    handler: ({ user, params, now }) => {
      as(user, "teacher");
      const test = findTest(params.id);
      if (test.status !== "draft") fail(409, "Only drafts can be regenerated");
      if (stillGenerating(test, now)) fail(409, "The personalized tests are still being generated", "GENERATION_IN_PROGRESS");
      const regenCount = (test.regenCount ?? 0) + 1;
      return testForTeacher(
        touch(test, {
          ...(() => {
            const content = generateContent(test.config, regenCount * 3, test.subjectId, now);
            return content.variants ? { ...content, generation: generationFor(content.variants, now) } : content;
          })(),
          regenCount,
          regeneratedAt: now,
        }),
        now,
      );
    },
  },
  {
    method: "POST",
    path: "/tests/:id/duplicate",
    handler: ({ user, params, now }) => {
      as(user, "teacher");
      const src = findTest(params.id);
      const reId = (qs) => (qs ? qs.map((q) => ({ ...q, id: createId() })) : qs);
      const copy = {
        ...JSON.parse(JSON.stringify(src)),
        id: createId(),
        title: `${src.title} (copy)`,
        status: "draft",
        schedule: null,
        publishedAt: null,
        stoppedAt: null,
        regeneratedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      copy.questionSet = reId(copy.questionSet);
      copy.variants = copy.variants?.map((v) => ({ ...v, questions: reId(v.questions) }));
      db().tests.unshift(copy);
      save();
      return testForTeacher(copy, now);
    },
  },
  {
    method: "DELETE",
    path: "/tests/:id",
    handler: ({ user, params, now }) => {
      as(user, "teacher");
      const test = findTest(params.id);
      if (statusOf(test, now) === "live") fail(409, "Stop the test before deleting it");
      db().tests = db().tests.filter((t) => t.id !== test.id);
      db().attempts = db().attempts.filter((a) => a.testId !== test.id);
      db().lessons.forEach((l) => {
        if (l.testId === test.id) l.testId = null; // a lesson never points at a deleted test
      });
      save();
      return { deleted: true };
    },
  },
  {
    method: "POST",
    path: "/tests/:id/publish",
    handler: ({ user, params, body, now }) => {
      as(user, "teacher");
      const test = findTest(params.id);
      if (test.status !== "draft") fail(409, "This test is already published");
      if (stillGenerating(test, now)) fail(409, "Wait until every personalized test has been generated", "GENERATION_IN_PROGRESS");
      const sets =
        test.mode === "personal"
          ? (test.variants ?? []).map((v) => v.questions)
          : [test.questionSet ?? []];
      if (sets.some((qs) => validateQuestions(qs).length > 0)) {
        fail(400, "Fix the highlighted questions before publishing", "INVALID_QUESTIONS");
      }
      const { availableFrom, availableUntil } = body ?? {};
      const settings = cleanSettings(body?.settings); // checked before anything is saved
      const bankSummary = saveToBank(test, now);
      return testForTeacher(
        touch(test, {
          bankSummary,
          status: "published",
          settings: { ...DEFAULT_SETTINGS, ...settings },
          schedule:
            availableFrom || availableUntil
              ? { availableFrom: availableFrom ?? now, availableUntil: availableUntil ?? null }
              : null,
          publishedAt: now,
          stoppedAt: null,
        }),
        now,
      );
    },
  },
  {
    method: "POST",
    path: "/tests/:id/start-now",
    handler: ({ user, params, now }) => {
      as(user, "teacher");
      const test = findTest(params.id);
      if (statusOf(test, now) !== "scheduled") fail(409, "Only a scheduled test can be started early");
      const until = test.schedule?.availableUntil ?? null;
      return testForTeacher(
        touch(test, { schedule: until && until <= now ? null : { availableFrom: now, availableUntil: until } }),
        now,
      );
    },
  },
  {
    method: "POST",
    path: "/tests/:id/stop-now",
    handler: ({ user, params, now }) => {
      as(user, "teacher");
      const test = findTest(params.id);
      if (statusOf(test, now) !== "live") fail(409, "This test isn't live");
      return testForTeacher(touch(test, { stoppedAt: now }), now);
    },
  },
  {
    method: "POST",
    path: "/tests/:id/extend",
    handler: ({ user, params, body, now }) => {
      as(user, "teacher");
      const test = findTest(params.id);
      if (statusOf(test, now) !== "live") fail(409, "This test has already ended");
      const ms = Number(body?.minutes) * 60_000;
      if (!(ms > 0)) fail(400, "Enter a number of minutes");
      const until = test.schedule?.availableUntil ?? null;
      if (until) touch(test, { schedule: { ...test.schedule, availableUntil: until + ms } });
      db().attempts.forEach((a) => {
        if (a.testId === test.id && a.status === "in_progress") a.deadline += ms;
      });
      save();
      return { closesAt: until ? until + ms : null };
    },
  },
  {
    method: "GET",
    path: "/tests/:id/attempts",
    handler: ({ user, params, now }) => {
      as(user, "teacher");
      const test = findTest(params.id);
      return classRows(test).map(({ student, attempt }) => ({
        student,
        attempt: attempt ? attemptForTeacher(attempt, test, now) : null,
      }));
    },
  },
  {
    method: "GET",
    path: "/tests/:id/results",
    handler: ({ user, params, now }) => {
      as(user, "teacher");
      const test = findTest(params.id);
      const status = statusOf(test, now);
      if (status === "draft") fail(409, "This test hasn't been published", "NOT_PUBLISHED");
      const rows = classRows(test).map(({ student, attempt }) => ({
        student,
        attempt: attempt ? attemptForTeacher(attempt, test, now) : null,
      }));
      const submitted = rows.filter((r) => r.attempt?.status === "submitted");
      const complete = submitted.filter((r) => r.attempt.marks.complete && r.attempt.marks.max > 0);
      const pct = complete.map((r) => Math.round((r.attempt.marks.earned / r.attempt.marks.max) * 100));
      return {
        test: {
          id: test.id,
          title: test.title,
          subject: test.subject,
          cls: test.cls,
          status,
          schedule: test.schedule,
          settings: settingsOf(test),
          duration: test.config?.duration ?? 30,
          ...counts(test),
        },
        summary: {
          students: rows.length,
          started: rows.filter((r) => r.attempt).length,
          submitted: submitted.length,
          awaitingMarks: submitted.length - complete.length,
          flagged: rows.filter((r) => r.attempt?.flags.length).length,
          silent: rows.filter((r) => r.attempt?.clientSilent).length,
          // over submitted attempts whose marks are all final; null when there are none
          averagePercent: pct.length ? Math.round(pct.reduce((a, b) => a + b, 0) / pct.length) : null,
          highestPercent: pct.length ? Math.max(...pct) : null,
          lowestPercent: pct.length ? Math.min(...pct) : null,
        },
        rows,
      };
    },
  },

  // ───── student: taking a test ─────
  {
    method: "GET",
    path: "/tests/:id/start",
    handler: ({ user, params, now }) => {
      as(user, "student");
      const test = findTest(params.id);
      const existing = myAttempt(user, test.id);
      if (existing) {
        seen(existing, now);
        save();
        return attemptForStudent(existing, test, now);
      }
      if (statusOf(test, now) !== "live") fail(409, "This test isn't open right now", "NOT_OPEN");
      let variantIndex = null;
      if (test.mode === "personal") {
        variantIndex = variantIndexFor(test, user.name);
        if (variantIndex < 0) fail(403, "No test was generated for you — ask your teacher", "NO_VARIANT");
      }
      const id = createId();
      const { shuffleQuestions, shuffleOptions } = settingsOf(test);
      // Snapshot in the order this student will see; correctIndex is remapped, so
      // grading and review need no further mapping. `shuffle` keeps the way back.
      const { questions, order } = randomizeQuestions(questionsFor(test, variantIndex), {
        shuffleQuestions,
        shuffleOptions,
        seed: id,
      });
      const attempt = {
        id,
        testId: test.id,
        student: user.name,
        variantIndex,
        startedAt: now,
        deadline: deadlineFor(test, now),
        status: "in_progress",
        submittedAt: null,
        submitReason: null,
        questions,
        shuffle: shuffleQuestions || shuffleOptions ? order : null,
        answers: {},
        flags: [],
        grades: null,
      };
      db().attempts.push(attempt);
      save();
      return attemptForStudent(attempt, test, now);
    },
  },
  {
    method: "GET",
    path: "/tests/:id/live-status",
    handler: ({ user, params, now }) => {
      as(user, "student");
      const test = findTest(params.id);
      const attempt = myAttempt(user, test.id);
      seen(attempt, now);
      save();
      return {
        stopped: statusOf(test, now) === "completed",
        closesAt: test.schedule?.availableUntil ?? null,
        deadline: attempt?.deadline ?? null,
      };
    },
  },
  {
    method: "PUT",
    path: "/attempts/:id/answers",
    handler: ({ user, params, body, now }) => {
      as(user, "student");
      const a = db().attempts.find((x) => x.id === params.id && x.student === user.name) ?? fail(404, "Attempt not found");
      if (a.status === "in_progress") {
        a.answers[body.questionId] = body.value;
        seen(a, now);
        save();
      }
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/tests/:id/flag",
    handler: ({ user, params, body, now }) => {
      as(user, "student");
      if (!FLAG_TYPES[body?.type]) fail(400, "Unknown event type", "INVALID_FLAG");
      const a = myAttempt(user, params.id) ?? fail(404, "Attempt not found");
      if (a.status === "in_progress") {
        a.flags.push({ type: body.type, at: now });
        seen(a, now);
        save();
      }
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "/tests/:id/submit",
    handler: ({ user, params, body, now }) => {
      as(user, "student");
      const test = findTest(params.id);
      const a = myAttempt(user, test.id) ?? fail(404, "Attempt not found");
      submit(a, test, body?.reason ?? "manual", body?.answers, now, actorOf(user));
      return attemptForStudent(a, test, now);
    },
  },
  {
    method: "GET",
    path: "/attempts",
    handler: ({ user, now }) => {
      as(user, "student");
      return db()
        .attempts.filter((a) => a.student === user.name)
        .map((a) => attemptForStudent(a, db().tests.find((t) => t.id === a.testId), now));
    },
  },

  // ───── analytics ─────
  {
    method: "GET",
    path: "/analytics/me",
    handler: ({ user, now }) => {
      as(user, "student");
      const tests = db().tests.filter((t) => t.cls === user.cls && statusOf(t, now) !== "draft");
      const ids = new Set(tests.map((t) => t.id));
      const attempts = db().attempts.filter((a) => ids.has(a.testId));
      return {
        student: { name: user.name, roll: user.roll, cls: user.cls },
        ...buildStudentAnalytics({
          student: user.name,
          tests,
          attempts,
          isReleased: (test, attempt) => isReleased(test, attempt, now),
        }),
      };
    },
  },

  {
    method: "GET",
    path: "/analytics/class",
    handler: ({ user, query, now }) => {
      as(user, "teacher");
      const { cls, subject, tests } = analyticsScope(user, query, now);
      const ids = new Set(tests.map((t) => t.id));
      return {
        cls: { id: cls.id, name: cls.name, code: cls.code },
        subject: { id: subject.id, name: subject.name },
        ...buildClassAnalytics({
          tests,
          attempts: db().attempts.filter((a) => ids.has(a.testId)),
          students: users()
            .filter((u) => u.role === "student" && u.classId === cls.id)
            .map((u) => ({ id: u.id, name: u.name, roll: u.roll })),
        }),
      };
    },
  },
  {
    method: "GET",
    path: "/analytics/students/:id",
    handler: ({ user, params, query, now }) => {
      as(user, "teacher");
      const { cls, subject, tests } = analyticsScope(user, query, now);
      const student = users().find((u) => u.id === params.id && u.role === "student" && u.classId === cls.id) ?? fail(404, "Student not found");
      const ids = new Set(tests.map((t) => t.id));
      return {
        student: { id: student.id, name: student.name, roll: student.roll, cls: cls.code },
        subject: { id: subject.id, name: subject.name },
        ...buildStudentDetail({
          student: student.name,
          tests,
          attempts: db().attempts.filter((a) => ids.has(a.testId)),
        }),
      };
    },
  },

  {
    // F12a: every subject, optional ?subject=<subjectId>&from=&to= (ISO timestamps, inclusive).
    method: "GET",
    path: "/analytics/students/:id/history",
    handler: ({ user, params, query, now }) => {
      as(user, "teacher");
      const student = users().find((u) => u.id === params.id && u.role === "student") ?? fail(404, "Student not found");
      const cls = classesFor(user).find((c) => c.id === student.classId) ?? fail(404, "Student not found");
      const parse = (v) => (v ? Date.parse(v) : null);
      const from = parse(query.from);
      const to = parse(query.to);
      if (!validRange(from, to)) fail(400, "Pick a valid date range", "INVALID_FILTER");
      const subjects = db().subjects.filter((s) => s.classId === cls.id);
      const subjectIds = new Set(subjects.map((s) => s.id));
      const tests = db().tests.filter((t) => subjectIds.has(t.subjectId) && statusOf(t, now) !== "draft");
      const ids = new Set(tests.map((t) => t.id));
      const rows = filterHistory(
        buildStudentHistory({ student: student.name, tests, attempts: db().attempts.filter((a) => ids.has(a.testId)) }),
        { subject: query.subject || null, from, to },
      );
      return {
        student: { id: student.id, name: student.name, roll: student.roll, cls: cls.code },
        subjects: subjects.map((s) => ({ id: s.id, name: s.name })),
        rows,
        summary: summarizeHistory(rows),
      };
    },
  },

  // ───── reports (F12b): teacher only; snapshots keep a hash, never the text ─────
  {
    method: "GET",
    path: "/reports/data",
    handler: ({ user, query, now }) => {
      as(user, "teacher");
      const i = reportInputs(user, { ...query, studentId: query.studentId }, now);
      // No flags, time taken or submit reason travel to the report page: it never needs them.
      const rows = i.rows.map(({ flags, timeTakenSec, submitReason, ...r }) => r); // eslint-disable-line no-unused-vars
      return { student: i.student, subjects: i.subjects, subjectName: i.subjectName, rows, topics: i.topics, questions: i.questions, excluded: i.excluded };
    },
  },
  {
    method: "POST",
    path: "/reports",
    handler: ({ user, body, now }) => {
      as(user, "teacher");
      const made = issueReport(user, reportInputs(user, body ?? {}, now), body ?? {}, now);
      return { id: made.id, generatedAt: now, contentHash: made.contentHash };
    },
  },
  {
    // F12d: one snapshot (and one report.generate event) per student. All-or-nothing on scope (a student outside the
    // teacher's classes → 404, nothing is made); a student with nothing to report is skipped, not an error.
    method: "POST",
    path: "/reports/batch",
    handler: ({ user, body, now }) => {
      as(user, "teacher");
      const ids = Array.isArray(body?.studentIds) ? [...new Set(body.studentIds.filter((x) => typeof x === "string"))] : [];
      if (!ids.length) fail(400, "Choose at least one student", "INVALID_REPORT");
      if (ids.length > 60) fail(400, "Choose up to 60 students at a time", "INVALID_REPORT");
      const prepared = [];
      const skipped = [];
      for (const studentId of ids) {
        try {
          const i = reportInputs(user, { ...body, studentId }, now);
          const hasMarks = i.preset === "test" || i.rows.some((r) => r.at >= i.period.from && r.at <= i.period.to);
          if (hasMarks) prepared.push({ studentId, i });
          else skipped.push({ studentId, reason: "no_marks" });
        } catch (err) {
          if (err?.status === 409) skipped.push({ studentId, reason: "not_ready" });
          else throw err;
        }
      }
      const options = { sections: Object.fromEntries(REPORT_SECTIONS.map((x) => [x.id, true])), language: body?.options?.language, comment: "" };
      const reports = prepared.map(({ studentId, i }) => ({ studentId, reportId: issueReport(user, i, { ...body, studentId, options }, now).id, generatedAt: now }));
      return { reports, skipped };
    },
  },
  {
    method: "POST",
    path: "/reports/:id/exported",
    handler: ({ user, params, body }) => {
      as(user, "teacher");
      const rep = (db().reports ?? []).find((r) => r.id === params.id && r.createdBy === user.id) ?? fail(404, "Report not found");
      if (!REPORT_CHANNELS.includes(body?.channel)) fail(400, "Unknown way of sharing", "INVALID_CHANNEL");
      return { id: rep.id, channel: body.channel };
    },
  },

  // ───── courses & lessons ─────
  {
    method: "GET",
    path: "/courses",
    handler: ({ user, query, now }) => {
      if (user.role === "teacher") {
        const subject = findSubject(query.subjectId, user);
        return db().courses.filter((c) => c.subjectId === subject.id).map(teacherCourse);
      }
      as(user, "student");
      const subjectIds = new Set(db().subjects.filter((s) => s.classId === user.classId).map((s) => s.id));
      return db().courses.filter((c) => subjectIds.has(c.subjectId)).map((c) => studentCourse(c, user, now));
    },
  },
  {
    method: "POST",
    path: "/courses",
    handler: ({ user, body, now }) => {
      as(user, "teacher");
      const subject = findSubject(body.subjectId, user);
      const title = String(body.title ?? "").trim();
      if (!title) fail(400, "Give the course a title", "INVALID_COURSE");
      if (title.length > 140) fail(400, "Title is too long (140 characters at most)", "INVALID_COURSE");
      const course = { id: createId(), subjectId: subject.id, title, createdAt: now };
      db().courses.push(course);
      save();
      return teacherCourse(course);
    },
  },
  {
    method: "PUT",
    path: "/courses/:id",
    handler: ({ user, params, body }) => {
      as(user, "teacher");
      const course = courseOr404(params.id, user);
      const title = String(body.title ?? "").trim();
      if (!title) fail(400, "Give the course a title", "INVALID_COURSE");
      if (title.length > 140) fail(400, "Title is too long (140 characters at most)", "INVALID_COURSE");
      course.title = title;
      save();
      return teacherCourse(course);
    },
  },
  {
    method: "DELETE",
    path: "/courses/:id",
    handler: ({ user, params }) => {
      as(user, "teacher");
      const course = courseOr404(params.id, user);
      const ids = new Set(lessonsOf(course.id).map((l) => l.id));
      db().courses = db().courses.filter((c) => c.id !== course.id);
      db().lessons = db().lessons.filter((l) => l.courseId !== course.id);
      db().lessonProgress = db().lessonProgress.filter((p) => !ids.has(p.lessonId));
      save();
      return null;
    },
  },
  {
    method: "PUT",
    path: "/courses/:id/lessons/order",
    handler: ({ user, params, body }) => {
      as(user, "teacher");
      const course = courseOr404(params.id, user);
      const current = lessonsOf(course.id).map((l) => l.id);
      if (!isPermutation(body.ids, current)) fail(400, "The order must list every lesson of the course exactly once", "INVALID_ORDER");
      body.ids.forEach((id, i) => (db().lessons.find((l) => l.id === id).order = i));
      save();
      return teacherCourse(course);
    },
  },
  {
    method: "POST",
    path: "/courses/:id/lessons",
    handler: ({ user, params, body, now }) => {
      as(user, "teacher");
      const course = courseOr404(params.id, user);
      const fields = cleanLesson(body, course.subjectId, now);
      db().lessons.push({ id: createId(), courseId: course.id, order: lessonsOf(course.id).length, createdAt: now, ...fields });
      save();
      return teacherCourse(course);
    },
  },
  {
    method: "PUT",
    path: "/lessons/:id",
    handler: ({ user, params, body, now }) => {
      as(user, "teacher");
      const { lesson, course } = lessonOr404(params.id, user);
      Object.assign(lesson, cleanLesson(body, course.subjectId, now));
      save();
      return teacherCourse(course);
    },
  },
  {
    method: "DELETE",
    path: "/lessons/:id",
    handler: ({ user, params }) => {
      as(user, "teacher");
      const { lesson, course } = lessonOr404(params.id, user);
      db().lessons = db().lessons.filter((l) => l.id !== lesson.id);
      db().lessonProgress = db().lessonProgress.filter((p) => p.lessonId !== lesson.id);
      reindex(course.id);
      save();
      return teacherCourse(course);
    },
  },
  {
    method: "PUT",
    path: "/lessons/:id/progress",
    handler: ({ user, params, body, now }) => {
      as(user, "student");
      const lesson = db().lessons.find((l) => l.id === params.id) ?? fail(404, "Lesson not found");
      const course = db().courses.find((c) => c.id === lesson.courseId);
      const subject = db().subjects.find((s) => s.id === course?.subjectId);
      if (!subject || subject.classId !== user.classId) fail(404, "Lesson not found");
      if (typeof body.done !== "boolean") fail(400, "Say whether the lesson is done", "INVALID_PROGRESS");
      const rest = db().lessonProgress.filter((p) => !(p.lessonId === lesson.id && p.student === user.name));
      db().lessonProgress = body.done ? [...rest, { lessonId: lesson.id, student: user.name, doneAt: now }] : rest;
      save();
      return studentCourse(course, user, now);
    },
  },

  // ───── class discussion ─────
  {
    method: "GET",
    path: "/threads",
    handler: ({ user, query }) => {
      const cls = discussionClass(user, query.classId);
      return db().threads.filter((t) => t.classId === cls.id).map((t) => threadView(t, user));
    },
  },
  {
    method: "POST",
    path: "/threads",
    handler: ({ user, body, now }) => {
      const cls = discussionClass(user, body.classId);
      const problem = validateThread(body, user.role);
      if (problem) fail(400, problem, "INVALID_THREAD");
      const thread = {
        id: createId(),
        classId: cls.id,
        title: String(body.title).trim(),
        body: String(body.body).trim(),
        author: user.name,
        authorId: user.id,
        role: user.role,
        tag: body.tag,
        pinned: false,
        resolved: false,
        createdAt: now,
        lastActivityAt: now,
        replies: [],
      };
      db().threads.push(thread);
      save();
      return threadView(thread, user);
    },
  },
  {
    method: "PUT",
    path: "/threads/:id",
    handler: ({ user, params, body }) => {
      const t = threadOr404(params.id, user);
      if (body.pinned !== undefined) {
        if (user.role !== "teacher") fail(403, "Only teachers can pin threads");
        if (typeof body.pinned !== "boolean") fail(400, "pinned must be true or false", "INVALID_THREAD");
      }
      if (body.resolved !== undefined) {
        if (!canResolve(user.role, user.id, t)) fail(403, "Only teachers or the person who asked can resolve this");
        if (typeof body.resolved !== "boolean") fail(400, "resolved must be true or false", "INVALID_THREAD");
      }
      if (body.pinned !== undefined) t.pinned = body.pinned;
      if (body.resolved !== undefined) t.resolved = body.resolved;
      save();
      return threadView(t, user);
    },
  },
  {
    method: "DELETE",
    path: "/threads/:id",
    handler: ({ user, params }) => {
      as(user, "teacher");
      const t = threadOr404(params.id, user);
      db().threads = db().threads.filter((x) => x.id !== t.id);
      save();
      return null;
    },
  },
  {
    method: "POST",
    path: "/threads/:id/replies",
    handler: ({ user, params, body, now }) => {
      const t = threadOr404(params.id, user);
      const problem = validateReply(body.body);
      if (problem) fail(400, problem, "INVALID_REPLY");
      t.replies.push({ id: createId(), author: user.name, authorId: user.id, role: user.role, body: String(body.body).trim(), createdAt: now });
      t.lastActivityAt = now;
      save();
      return threadView(t, user);
    },
  },
  {
    method: "DELETE",
    path: "/threads/:id/replies/:replyId",
    handler: ({ user, params }) => {
      as(user, "teacher");
      const t = threadOr404(params.id, user);
      if (!t.replies.some((r) => r.id === params.replyId)) fail(404, "Reply not found");
      t.replies = t.replies.filter((r) => r.id !== params.replyId);
      save();
      return threadView(t, user);
    },
  },

  // ───── grading (teacher) ─────
  {
    method: "GET",
    path: "/grading/queue",
    handler: ({ user, now }) => {
      as(user, "teacher");
      return queueItems(user, now);
    },
  },
  {
    method: "PATCH",
    path: "/grades/:attemptId/:questionId",
    handler: ({ user, params, body, now }) => {
      as(user, "teacher");
      const attempt = db().attempts.find((a) => a.id === params.attemptId);
      const g = (ownsAttempt(user, attempt) ? attempt.grades?.[params.questionId] : null) ?? fail(404, "Grade not found");
      const marks = Number(body?.marks);
      if (!Number.isFinite(marks) || marks < 0 || marks > g.max) {
        fail(400, `Marks must be between 0 and ${g.max}`, "INVALID_MARKS");
      }
      const reason = String(body?.reason ?? "").trim();
      if (reason.length > REASON_MAX_LENGTH) fail(400, `Keep the reason under ${REASON_MAX_LENGTH} characters`, "INVALID_INPUT");
      const afterRelease = g.status === "final" && isReleased(findTest(attempt.testId), attempt, now);
      if (needsReason({ max: g.max, current: g.marks, ai: g.aiMarks ?? null, to: marks, afterRelease }) && !reason) {
        fail(400, afterRelease ? "This result is already released. Say why you are changing it." : "Please give a reason for this change", "REASON_REQUIRED");
      }
      const final = body.final !== false;
      attempt.grades[params.questionId] = {
        ...g,
        marks,
        feedback: body.feedback ?? "",
        source: g.aiMarks == null || marks !== g.aiMarks ? "teacher" : g.source,
        status: final ? "final" : g.status === "pending" ? "pending" : "ai_draft",
        reviewedAt: final ? now : g.reviewedAt,
      };
      save();
      return attempt.grades[params.questionId];
    },
  },
  {
    method: "POST",
    path: "/grading/approve",
    handler: ({ user, body, now }) => {
      as(user, "teacher");
      const wanted = new Set((body?.items ?? []).map((i) => `${i.attemptId}:${i.questionId}`));
      let approved = 0;
      db().attempts.forEach((a) => {
        Object.entries(a.grades ?? {}).forEach(([qid, g]) => {
          if (g.status === "ai_draft" && wanted.has(`${a.id}:${qid}`) && ownsAttempt(user, a)) {
            a.grades[qid] = { ...g, status: "final", reviewedAt: now };
            approved += 1;
          }
        });
      });
      save();
      return { approved };
    },
  },

  // ───── student review ─────
  // ───── audit (admin, read-only) ─────
  {
    method: "GET",
    path: "/audit/tests",
    handler: ({ user, now }) => {
      as(user, "admin");
      return db()
        .tests.filter((t) => t.publishedAt)
        .sort((a, b) => b.publishedAt - a.publishedAt)
        .map((t) => {
          const attempts = db().attempts.filter((a) => a.testId === t.id);
          const totals = trailTotals(
            buildTrailRows({ attempts, events: (db().auditLog ?? []).filter((e) => e.testId === t.id), users: users() }),
          );
          return {
            testId: t.id,
            title: t.title,
            subject: t.subject,
            cls: t.cls,
            teacher: teacherNamesOf(t),
            status: statusOf(t, now),
            attempts: attempts.filter((a) => a.status === "submitted").length,
            ...totals,
          };
        });
    },
  },
  {
    method: "GET",
    path: "/audit/tests/:testId",
    handler: ({ user, params, query, now }) => {
      as(user, "admin");
      const test = findTest(params.testId);
      const attempts = db().attempts.filter((a) => a.testId === test.id);
      const rows = buildTrailRows({ attempts, events: (db().auditLog ?? []).filter((e) => e.testId === test.id), users: users() });
      const limit = Math.min(Math.max(Number(query?.limit) || 200, 1), 500);
      const offset = Math.max(Number(query?.cursor) || 0, 0);
      return {
        test: {
          id: test.id,
          title: test.title,
          subject: test.subject,
          cls: test.cls,
          teacher: teacherNamesOf(test),
          status: statusOf(test, now),
          publishedAt: test.publishedAt ?? null,
          settings: settingsOf(test),
        },
        totals: trailTotals(rows),
        rows: rows.slice(offset, offset + limit),
        nextCursor: offset + limit < rows.length ? String(offset + limit) : null,
      };
    },
  },

  {
    method: "GET",
    path: "/audit/teachers",
    handler: ({ user }) => {
      as(user, "admin");
      const events = db().auditLog ?? [];
      const stats = computeTeacherStats(events, users());
      return users()
        .filter((u) => u.role === "teacher")
        .map((u) => {
          const mine = stats.find((s) => s.teacherId === u.id);
          return {
            teacherId: u.id,
            name: u.name,
            email: u.email,
            classes: classCodesOf(u.id),
            reviewed: mine?.reviewed ?? 0,
            overrides: mine?.overrides ?? 0,
            overrideRate: mine?.overrideRate ?? 0,
            upward: mine?.upward ?? 0,
            downward: mine?.downward ?? 0,
            signals: countBySeverity(computeSignals({ events, users: users(), teacherId: u.id })),
          };
        });
    },
  },
  {
    method: "GET",
    path: "/audit/teachers/:teacherId",
    handler: ({ user, params }) => {
      as(user, "admin");
      const teacher = users().find((u) => u.id === params.teacherId && u.role === "teacher") ?? fail(404, "Teacher not found");
      const events = db().auditLog ?? [];
      const all = computeTeacherStats(events, users());
      const mine = all.find((s) => s.teacherId === teacher.id);
      return {
        teacher: { id: teacher.id, name: teacher.name, email: teacher.email, classes: classCodesOf(teacher.id) },
        stats: {
          reviewed: mine?.reviewed ?? 0,
          overrides: mine?.overrides ?? 0,
          overrideRate: mine?.overrideRate ?? 0,
          upward: mine?.upward ?? 0,
          downward: mine?.downward ?? 0,
          avgDelta: mine?.avgDelta ?? 0,
          afterRelease: mine?.afterRelease ?? 0,
        },
        peerMedianRate: peerMedianRate(all, teacher.id),
        signals: computeSignals({ events, users: users(), teacherId: teacher.id }),
        students: (mine?.students ?? []).slice(0, 10),
        tests: (mine?.tests ?? []).map((t) => ({ ...t, title: db().tests.find((x) => x.id === t.testId)?.title ?? "Deleted test" })),
      };
    },
  },
  {
    method: "GET",
    path: "/audit/events",
    handler: ({ user, query }) => {
      as(user, "admin");
      const log = db().auditLog ?? [];
      const matching = filterEvents(log, query ?? {}).reverse(); // newest first
      const limit = Math.min(Math.max(Number(query?.limit) || 50, 1), 500);
      const before = query?.cursor ? Number(query.cursor) : Infinity;
      const rest = matching.filter((e) => e.seq < before);
      const events = rest.slice(0, limit);
      const ids = new Set(events.map((e) => e.studentId).filter(Boolean));
      const tests = new Set(events.map((e) => e.testId).filter(Boolean));
      const actors = new Map();
      log.forEach((e) => {
        const key = e.actor?.role === "system" ? "system" : e.actor?.id;
        if (key && !actors.has(key)) actors.set(key, { id: key, name: e.actor.name, role: e.actor.role });
      });
      return {
        events,
        nextCursor: rest.length > limit ? String(events[events.length - 1].seq) : null,
        total: matching.length,
        names: {
          users: Object.fromEntries([...ids].map((id) => [id, users().find((u) => u.id === id)?.name ?? "Removed account"])),
          tests: Object.fromEntries([...tests].map((id) => [id, db().tests.find((t) => t.id === id)?.title ?? "Deleted test"])),
        },
        facets: { actors: [...actors.values()] },
      };
    },
  },
  {
    method: "GET",
    path: "/audit/integrity",
    handler: ({ user, now }) => {
      as(user, "admin");
      const log = db().auditLog ?? [];
      return { ...verifyChain(log), total: log.length, lastSeq: log.length, headHash: log.length ? log[log.length - 1].hash : GENESIS, verifiedAt: now };
    },
  },
  {
    method: "POST",
    path: "/audit/export-log",
    handler: ({ user, body }) => {
      as(user, "admin");
      const rows = Number(body?.rows);
      if (!Number.isInteger(rows) || rows < 0) fail(400, "rows must be a whole number", "INVALID_INPUT");
      return null;
    },
  },
  {
    method: "GET",
    path: "/audit/mine",
    handler: ({ user, query }) => {
      as(user, "teacher");
      const log = db().auditLog ?? [];
      const mine = log.filter((e) => e.actor?.id === user.id && (e.type.startsWith("grade.") || e.type.startsWith("test."))).reverse();
      const limit = Math.min(Math.max(Number(query?.limit) || 50, 1), 500);
      const before = query?.cursor ? Number(query.cursor) : Infinity;
      const rest = mine.filter((e) => e.seq < before);
      const page = rest.slice(0, limit);
      const stats = computeTeacherStats(log, users()).find((s) => s.teacherId === user.id);
      return {
        totals: {
          reviewed: stats?.reviewed ?? 0,
          overrides: stats?.overrides ?? 0,
          overrideRate: stats?.overrideRate ?? 0,
          upward: stats?.upward ?? 0,
          downward: stats?.downward ?? 0,
          afterRelease: stats?.afterRelease ?? 0,
        },
        items: page.map((e) => ({
          seq: e.seq,
          at: e.at,
          type: e.type,
          label: AUDIT_TYPES[e.type] ?? e.type,
          testId: e.testId,
          testTitle: db().tests.find((t) => t.id === e.testId)?.title ?? (e.testId ? "Deleted test" : null),
          studentName: e.studentId ? (users().find((u) => u.id === e.studentId)?.name ?? "Removed account") : null,
          beforeMarks: e.before?.marks ?? null,
          afterMarks: e.after?.marks ?? null,
          max: e.meta?.max ?? null,
          reason: e.meta?.reason ?? null,
          afterRelease: e.meta?.afterRelease === true,
          bulk: e.meta?.bulk === true,
        })),
        nextCursor: rest.length > limit ? String(page[page.length - 1].seq) : null,
      };
    },
  },
  {
    method: "GET",
    path: "/attempts/:id/review",
    handler: ({ user, params, now }) => {
      as(user, "student");
      const a = db().attempts.find((x) => x.id === params.id && x.student === user.name);
      if (!a || a.status !== "submitted") fail(404, "Attempt not found");
      const test = findTest(a.testId);
      if (!isReleased(test, a, now)) fail(403, "Results aren't released yet", "NOT_RELEASED");
      return {
        attemptId: a.id,
        test: { title: test.title, subject: test.subject, cls: test.cls },
        submittedAt: a.submittedAt,
        submitReason: a.submitReason,
        flags: a.flags.length,
        totals: totalsOf(a.questions, a.grades),
        items: a.questions.map((q) => {
          const g = a.grades?.[q.id];
          return {
            question: stripQuestion(q),
            answer: a.answers[q.id] ?? null,
            correctIndex: isChoice(q) ? q.correctIndex : null,
            modelAnswer: isChoice(q) ? "" : (q.expectedAnswer ?? ""),
            grade:
              g?.status === "final"
                ? { status: "final", marks: g.marks, max: g.max, feedback: g.feedback ?? "" }
                : { status: "grading", max: q.marks },
          };
        }),
      };
    },
  },
];

export const routes = withAudit(ROUTES);

export { sumMarks };
