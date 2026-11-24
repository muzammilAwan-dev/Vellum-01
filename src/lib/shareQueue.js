import { fitsWhatsApp, normalizePkPhone } from "./contact";

// ═══════════════════════════════════════════════════════════════
// SHARING REPORTS WITH PARENTS (F12d) — pure rules for the share dialog and the send queue.
// Vellum never sends anything: each message is opened in WhatsApp by the teacher, one parent at a time,
// and the row then says "Opened", never "sent" (WhatsApp is outside Vellum and gives no delivery receipt).
// ═══════════════════════════════════════════════════════════════
export const QUEUE_MAX = 60;
export const SHARE_AUDIENCES = ["student", "selected", "class"];
export const SHARE_PERIODS = ["thisWeek", "last7", "thisMonth"]; // custom dates stay in the report builder
export const SHARE_PRESETS = ["weekly", "test"];
export const SKIP_REASONS = { no_marks: "no confirmed marks in this period", not_ready: "result not final or not released yet" };

/** The student ids for an audience, in class order, limited to the class (ids of other classes are ignored). */
export const resolveAudience = ({ audience, studentId, selectedIds = [], classIds = [] }) => {
  const inClass = new Set(classIds);
  if (audience === "student") return studentId && inClass.has(studentId) ? [studentId] : [];
  if (audience === "selected") return classIds.filter((id) => new Set(selectedIds).has(id));
  return [...classIds]; // "class"
};

/** Why a share cannot start (one short sentence), or null. `ids` = resolveAudience(...). */
export const validateShare = ({ ids, preset, period, testId }) => {
  if (!ids?.length) return "Choose at least one student.";
  if (ids.length > QUEUE_MAX) return `Choose up to ${QUEUE_MAX} students at a time.`;
  if (!SHARE_PRESETS.includes(preset)) return "Choose a weekly or a test report.";
  if (preset === "weekly" && !SHARE_PERIODS.includes(period)) return "Choose the period.";
  if (preset === "test" && !testId) return "Choose the test.";
  return null;
};

/**
 * What one queue row can do. `built` = the summary `{ text, fits }` once the student's data has loaded (null before).
 * → "loading" | "no-number" | "too-long" | "ready". A missing number wins, because the text is useless without it;
 * "too-long" rows get "Copy text" instead of a link.
 */
export const queueRowState = ({ phone, built }) => {
  if (!built) return "loading";
  if (!normalizePkPhone(phone ?? "")) return "no-number";
  return built.fits && fitsWhatsApp(built.text) ? "ready" : "too-long";
};

const clock = (at) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
/** "Opened 10:42" / "Copied 10:42" / "" (not done yet). `done` = { at, how: "opened" | "copied" } or undefined. */
export const doneLabel = (done) => (done ? `${done.how === "copied" ? "Copied" : "Opened"} ${clock(done.at)}` : "");

/** "12 of 28 opened" (a copied text counts: the teacher has dealt with that parent). */
export const progressLabel = (total, doneCount) => `${doneCount} of ${total} opened`;

export const SHARE_NOTICE =
  "WhatsApp is outside Vellum. Each message goes to one parent; never post reports in a group. For students aged 18 or over, get the student's consent.";

// The queue (the batch of report snapshots, the request that made it and which rows were opened) lives in
// sessionStorage, so a reload or a trip to a student's page does not lose it. Report ids and student ids only:
// no names, numbers or message text. It ends with the tab and after 12 hours.
export const QUEUE_KEY = "vellum.share.queue";
const QUEUE_TTL = 12 * 3_600_000;

export const saveQueue = (queue, storage = globalThis.sessionStorage) => {
  try {
    storage.setItem(QUEUE_KEY, JSON.stringify({ ...queue, savedAt: Date.now() }));
  } catch {
    /* private mode or full: the queue still works for this visit */
  }
};

/** → { batch, request, done } or null (nothing saved, too old, or not a queue). */
export const loadQueue = (now = Date.now(), storage = globalThis.sessionStorage) => {
  try {
    const q = JSON.parse(storage.getItem(QUEUE_KEY) ?? "null");
    const ok = q && Array.isArray(q.batch?.reports) && Array.isArray(q.batch?.skipped) && q.request && typeof q.request === "object" && now - q.savedAt < QUEUE_TTL;
    return ok ? { batch: q.batch, request: q.request, done: q.done && typeof q.done === "object" ? q.done : {} } : null;
  } catch {
    return null;
  }
};
