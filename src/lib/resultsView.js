// Presentation helpers for the teacher's per-test results page (F7.4).
// The server supplies facts (marks, flags, lastSeenAt, clientSilent); this file
// only labels and orders them. Nothing here decides grading or integrity.
import { FLAG_TYPES, flagLabel } from "./antiCheat";

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };
export const SEVERITY_LABEL = { high: "High", medium: "Medium", low: "Low" };

export const severityOf = (type) => FLAG_TYPES[type]?.severity ?? "low";

/** { count, top, byType: [{ type, label, severity, count }] } — worst first, then most frequent. */
export const summarizeFlags = (flags = []) => {
  const map = new Map();
  flags.forEach((f) => map.set(f.type, (map.get(f.type) ?? 0) + 1));
  const byType = [...map.entries()]
    .map(([type, count]) => ({ type, label: flagLabel(type), severity: severityOf(type), count }))
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.count - a.count);
  return { count: flags.length, top: byType[0]?.severity ?? null, byType };
};

/** Events in time order with how far into the test each happened. */
export const flagTimeline = (flags = [], startedAt) =>
  [...flags]
    .sort((a, b) => a.at - b.at)
    .map((f) => ({
      ...f,
      label: flagLabel(f.type),
      severity: severityOf(f.type),
      offsetMs: Math.max(0, f.at - startedAt),
    }));

/** 754000 → "12:34"; hours only when needed ("1:02:03"). */
export const clock = (ms) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

export const percentOf = (marks) =>
  marks && marks.max > 0 ? Math.round((marks.earned / marks.max) * 100) : null;

/**
 * One row's state for display:
 *  not-started | working | silent | submitted | marking (submitted, marks not all final)
 * `ended` = the test is over, so an open attempt is just waiting to be closed.
 */
export const rowState = (attempt, ended) => {
  if (!attempt) return "not-started";
  if (attempt.status === "submitted") return attempt.marks && !attempt.marks.complete ? "marking" : "submitted";
  if (attempt.clientSilent) return "silent";
  return ended ? "closing" : "working";
};

export const SUBMIT_REASON = {
  manual: "Submitted by the student",
  timeout: "Time ran out",
  stopped: "Test was stopped",
};

export const RESULT_FILTERS = [
  { id: "all", label: "All" },
  { id: "flagged", label: "Flagged" },
  { id: "marking", label: "Awaiting marks" },
  { id: "missing", label: "Not submitted" },
];

export const matchesFilter = (row, filter, ended) => {
  const state = rowState(row.attempt, ended);
  if (filter === "flagged") return (row.attempt?.flags.length ?? 0) > 0;
  if (filter === "marking") return state === "marking";
  if (filter === "missing") return state !== "submitted" && state !== "marking";
  return true;
};
