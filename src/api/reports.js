import { call } from "./client";

// ═══════════════════════════════════════════════════════════════
// REPORTS API (API-CONTRACT.md "Reports"). Teacher only. A report holds confirmed marks only
// (final grades of tests already released to the student); the page builds the sheet with
// lib/report.js, the server keeps a snapshot (id + content hash), never the text.
//   GET  /api/reports/data?studentId=&preset=weekly&period=&from=&to=&subjectId=   (from/to ISO)
//        or ?studentId=&preset=test&testId=&subjectId=
//     → { student, subjects, subjectName, rows, topics, questions, excluded }
//   POST /api/reports { studentId, preset, period, from, to, testId, subjectId, options } → { id, generatedAt, contentHash }
//   POST /api/reports/batch { studentIds (≤ 60), preset, period, from, to, testId, subjectId, options: { language } } → { reports, skipped }
//   POST /api/reports/:id/exported { channel: "pdf"|"whatsapp"|"copy" } → { id, channel }
// ═══════════════════════════════════════════════════════════════
const iso = (ms) => new Date(ms).toISOString();

const params = ({ studentId, preset, period, from, to, testId, subjectId }) => {
  const q = new URLSearchParams({ studentId, preset });
  if (preset === "weekly") {
    q.set("period", period);
    q.set("from", iso(from));
    q.set("to", iso(to));
  } else if (testId) q.set("testId", testId);
  if (subjectId) q.set("subjectId", subjectId);
  return q;
};

export const getReportData = (p) => call(`/reports/data?${params(p)}`);

export const createReport = ({ options, ...p }) =>
  call("/reports", {
    method: "POST",
    body: { studentId: p.studentId, preset: p.preset, period: p.period, from: p.preset === "weekly" ? iso(p.from) : undefined, to: p.preset === "weekly" ? iso(p.to) : undefined, testId: p.testId || undefined, subjectId: p.subjectId || undefined, options },
  });

/** F12d: one snapshot per student → { reports: [{ studentId, reportId, generatedAt }], skipped: [{ studentId, reason }] }. Max 60. */
export const createReportBatch = ({ studentIds, preset, period, from, to, testId, subjectId, language }) =>
  call("/reports/batch", {
    method: "POST",
    body: { studentIds, preset, period: preset === "weekly" ? period : undefined, from: preset === "weekly" ? iso(from) : undefined, to: preset === "weekly" ? iso(to) : undefined, testId: testId || undefined, subjectId: subjectId || undefined, options: { language } },
  });

export const markReportExported = (id, channel) => call(`/reports/${encodeURIComponent(id)}/exported`, { method: "POST", body: { channel } });
