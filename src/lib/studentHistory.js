// Student test history for teachers (F12a). Pure functions over plain data, so
// the mock server uses them now and the real backend ports this file to
// `server/src/domain/studentHistory.js` unchanged (like lib/analytics.js).
//
// Rules (the contract; see API-CONTRACT.md "Student history"):
//  - One row per SUBMITTED attempt at a published test of the student's class,
//    every subject. Teachers see everything, nothing is filtered by release.
//  - A row whose marks are not all final is `status: "pending"`: it is listed,
//    but its marks/percent are null and it is left out of every average.
//  - `classAverage` = mean % of all complete attempts at that test (null if none).
//  - Anti-cheat flags are counted by severity (see lib/antiCheat FLAG_TYPES).

import { mean, pct, scoreAttempt, trendOf } from "@/lib/analytics";
import { FLAG_TYPES } from "@/lib/antiCheat";

const flagCounts = (flags = []) => {
  const out = { high: 0, medium: 0, low: 0 };
  flags.forEach((f) => {
    const sev = FLAG_TYPES[f.type]?.severity;
    out[sev === "high" || sev === "medium" ? sev : "low"] += 1;
  });
  return out;
};

/**
 * @param {{ student: string, tests: object[], attempts: object[] }} input
 *   `student` = the student's name (attempts carry the name, as in lib/analytics);
 *   `tests` = the class's published tests (each with `subjectId` and `subject`);
 *   `attempts` = every attempt at those tests (classmates' too, for the averages).
 * → rows newest first: [{ id, testId, test, subjectId, subject, at, status: "final"|"pending",
 *     marks|null, max, percent|null, classAverage|null, timeTakenSec|null,
 *     submitReason|null, flags: { high, medium, low } }]
 */
export const buildStudentHistory = ({ student, tests, attempts }) => {
  const byId = new Map(tests.map((t) => [t.id, t]));
  const submitted = attempts.filter((a) => a.status === "submitted" && byId.has(a.testId));

  // class mean per test, from complete attempts only
  const classMean = new Map();
  const percentsByTest = new Map();
  submitted.forEach((a) => {
    const s = scoreAttempt(a);
    if (!s.complete || s.max <= 0) return;
    const list = percentsByTest.get(a.testId) ?? [];
    list.push(pct(s.earned, s.max));
    percentsByTest.set(a.testId, list);
  });
  percentsByTest.forEach((list, id) => classMean.set(id, Math.round(mean(list))));

  return submitted
    .filter((a) => a.student === student)
    .map((a) => {
      const test = byId.get(a.testId);
      const s = scoreAttempt(a);
      const final = s.complete && s.max > 0;
      return {
        id: a.id,
        testId: a.testId,
        test: test.title,
        subjectId: test.subjectId,
        subject: test.subject,
        at: a.submittedAt,
        status: final ? "final" : "pending",
        marks: final ? s.earned : null,
        max: s.max,
        percent: final ? pct(s.earned, s.max) : null,
        classAverage: classMean.get(a.testId) ?? null,
        timeTakenSec: a.startedAt != null && a.submittedAt != null ? Math.max(0, Math.round((a.submittedAt - a.startedAt) / 1000)) : null,
        submitReason: a.submitReason ?? null,
        flags: flagCounts(a.flags),
      };
    })
    .sort((a, b) => b.at - a.at || a.test.localeCompare(b.test));
};

/**
 * Narrow rows by subject id, an inclusive date range (ms) and/or final marks only.
 * Empty / null / undefined options mean "no limit".
 */
export const filterHistory = (rows, { subject, from, to, finalOnly } = {}) =>
  rows.filter(
    (r) =>
      (!subject || r.subjectId === subject) &&
      (from == null || r.at >= from) &&
      (to == null || r.at <= to) &&
      (!finalOnly || r.status === "final"),
  );

/**
 * Totals for a set of rows (pending rows never count towards averages).
 * → { count, final, pending, average|null, best|null, lowest|null,
 *     trend: "up"|"down"|"steady"|null, flags: { high, medium, low } }
 */
export const summarizeHistory = (rows) => {
  const final = rows.filter((r) => r.status === "final");
  const percents = final.map((r) => r.percent);
  const oldestFirst = [...final].sort((a, b) => a.at - b.at).map((r) => r.percent);
  const flags = { high: 0, medium: 0, low: 0 };
  rows.forEach((r) => Object.keys(flags).forEach((k) => (flags[k] += r.flags[k])));
  return {
    count: rows.length,
    final: final.length,
    pending: rows.length - final.length,
    average: final.length ? Math.round(mean(percents)) : null,
    best: final.length ? Math.max(...percents) : null,
    lowest: final.length ? Math.min(...percents) : null,
    trend: trendOf(oldestFirst),
    flags,
  };
};

/** Local calendar day (`YYYY-MM-DD` from a date input) → ms at its start / end. "" → null. */
export const dayStartMs = (v) => (v ? new Date(`${v}T00:00:00`).getTime() : null);
export const dayEndMs = (v) => (v ? new Date(`${v}T23:59:59.999`).getTime() : null);

/** "12 min" / "1 h 05 min" / "45 s"; "—" when unknown. */
export const formatDuration = (sec) => {
  if (sec == null) return "—";
  if (sec < 60) return `${sec} s`;
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
};

export const TREND_LABEL = { up: "Improving", down: "Slipping", steady: "Steady" };
/** A usable filter range: each end is a number or absent, and `from` is not after `to`. */
export const validRange = (from, to) =>
  (from == null || Number.isFinite(from)) && (to == null || Number.isFinite(to)) && (from == null || to == null || from <= to);
