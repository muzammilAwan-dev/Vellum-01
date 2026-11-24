// Parent / student report (F12b). Pure functions: the fake server and the report page
// share them, and the real backend ports this file unchanged (like lib/analytics.js).
//
// Rules (the contract; API-CONTRACT.md "Reports"):
//  - A report holds CONFIRMED marks only: final grades of tests whose results are already
//    released to the student. Pending or unreleased tests never appear in any number.
//  - No anti-cheat events, no other student's name or marks (only class averages) and no
//    question text ever appear in a report.
//  - The teacher's comment is printed but never stored: the server keeps only a hash.
import { TARGET_PERCENT, mean, trendOf } from "@/lib/analytics";
import { canonicalJson } from "@/lib/audit";
import { sha256Hex } from "@/lib/sha256";
import { STEP_TEXT } from "@/lib/reportLabels";
import { TREND_LABEL } from "@/lib/studentHistory";

export const REPORT_PRESETS = [
  { id: "weekly", label: "Progress report" },
  { id: "test", label: "One test" },
];
export const PERIOD_PRESETS = [
  { id: "thisWeek", label: "This week (Mon–Sun)" },
  { id: "last7", label: "Last 7 days" },
  { id: "thisMonth", label: "This month" },
  { id: "custom", label: "Custom dates" },
];
export const REPORT_SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "trend", label: "Trend chart" },
  { id: "topics", label: "Strong and weak topics" },
  { id: "tests", label: "List of tests" },
  { id: "comment", label: "Teacher's comment" },
  { id: "nextSteps", label: "Next steps" },
];
export const DEFAULT_REPORT_OPTIONS = {
  preset: "weekly",
  period: "thisWeek",
  subject: "",
  language: "en",
  sections: Object.fromEntries(REPORT_SECTIONS.map((s) => [s.id, true])),
};
export const COMMENT_MAX = 1000;
export const MAX_TOPICS = 3;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();

const dayLabel = (ts, withYear) =>
  new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
/** "2 Nov – 8 Nov 2026" (years shown when the range crosses a year). */
export const periodLabel = (from, to) => {
  const sameYear = new Date(from).getFullYear() === new Date(to).getFullYear();
  return startOfDay(new Date(from)) === startOfDay(new Date(to))
    ? dayLabel(from, true)
    : `${dayLabel(from, !sameYear)} – ${dayLabel(to, true)}`;
};

/**
 * A period preset → real timestamps in the *browser's* time zone (the server never guesses a
 * zone: the client always sends `from`/`to`). Weeks start on Monday. Returns
 * `{ key, from, to, label }`, or null when a custom range is missing or backwards.
 */
export const resolvePeriod = (key, { from, to } = {}, now = Date.now()) => {
  const d = new Date(now);
  let a;
  let b;
  if (key === "thisWeek") {
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    a = monday.getTime();
    b = endOfDay(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));
  } else if (key === "last7") {
    a = startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6));
    b = endOfDay(d);
  } else if (key === "thisMonth") {
    a = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    b = endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  } else if (key === "custom") {
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return null;
    a = from;
    b = to;
  } else return null;
  return { key, from: a, to: b, label: periodLabel(a, b) };
};

const slug = (s) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const isoDay = (ts) => {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** `Maya-Okafor-Weekly-2026-11-02.pdf`: ASCII only; a name with no Latin letters falls back to the student id. */
export const reportFileName = (report) => {
  const who = slug(report.header.student.name) || slug(report.header.student.id) || "Student";
  const key = report.header.period.key;
  const kind = report.kind === "test" ? "Test" : key === "thisMonth" ? "Monthly" : key === "custom" ? "Progress" : "Weekly";
  return `${who}-${kind}-${isoDay(report.header.period.from)}.pdf`;
};

export const REPORT_LANGS = ["en", "ur", "both"];

/** Rule-based advice from the weakest topics (the caller passes topics already under target). "both" lists each step in English, then Urdu. */
export const nextStepsFromTopics = (weak, lang = "en") => {
  const langs = lang === "both" ? ["en", "ur"] : [lang === "ur" ? "ur" : "en"];
  if (!weak.length) return langs.map((l) => STEP_TEXT[l].none);
  return weak.slice(0, MAX_TOPICS).flatMap((t) => langs.map((l) => (t.accuracy < 50 ? STEP_TEXT[l].low(t.name) : STEP_TEXT[l].mid(t.name))));
};

const firstName = (name) => String(name ?? "").trim().split(/\s+/)[0] || "The student";

/** A starting point for the comment box. The UI labels it "Draft — edit before sharing". */
export const draftComment = (report, lang = report.language ?? "en") => {
  const s = report.summary;
  if (!s || !s.tests) return "";
  const who = firstName(report.header.student.name);
  if (lang === "ur") {
    const bits = [`${who} کی اوسط کارکردگی ${s.tests} ${s.tests === 1 ? "ٹیسٹ" : "ٹیسٹوں"} میں ${s.average}% رہی۔`];
    if (s.classAverage != null) bits.push(`جماعت کی اوسط ${s.classAverage}% ہے۔`);
    const strong = report.topics?.strong?.[0];
    const weak = report.topics?.weak?.[0];
    if (strong) bits.push(`سب سے مضبوط موضوع: ${strong.name}۔`);
    if (weak) bits.push(`سب سے زیادہ محنت درکار: ${weak.name}۔`);
    return bits.join(" ");
  }
  const gap = s.classAverage == null ? null : s.average - s.classAverage;
  const vs =
    gap == null ? "" : gap >= 3 ? ` That is above the class average of ${s.classAverage}%.` : gap <= -3 ? ` The class average is ${s.classAverage}%.` : ` That is in line with the class average of ${s.classAverage}%.`;
  const bits = [`${who} averaged ${s.average}% across ${s.tests} ${s.tests === 1 ? "test" : "tests"}.${vs}`];
  const strong = report.topics?.strong?.[0];
  const weak = report.topics?.weak?.[0];
  if (strong) bits.push(`Strongest topic: ${strong.name}.`);
  if (weak) bits.push(`Needs most work: ${weak.name}.`);
  if (s.trend) bits.push(`Results are ${TREND_LABEL[s.trend].toLowerCase()}.`);
  return bits.join(" ");
};

const clean = (s) => String(s ?? "").replace(/\r\n/g, "\n").trim().slice(0, COMMENT_MAX);
const on = (options, id) => options?.sections?.[id] !== false;

/**
 * @param input.student     { id, name, roll, cls }
 * @param input.institution { name, shortName, city, logo } | null   (not part of the hash)
 * @param input.preset      "weekly" | "test"
 * @param input.period      { key, from, to } (weekly) — `from`/`to` are ignored for "test"
 * @param input.subjectName string | null
 * @param input.rows        released, final history rows (lib/studentHistory) up to the end of the period,
 *                          any order; for "test" the one row of that test
 * @param input.topics      [{ name, accuracy }] over the period (or that one test)
 * @param input.questions   null | [{ no, topic, marks, max, feedback }]   ("test" only)
 * @param input.excluded    { pending, unreleased } counts, for the teacher's notice only
 * @param input.options     { sections: { summary, trend, topics, tests, comment, nextSteps }, comment }
 * @returns report { kind, header, summary, trend, topics, tests, questions, comment, nextSteps, excluded, empty }
 *          — a section switched off is null / "" / [].
 */
export const buildReport = ({ student, institution = null, preset, period, subjectName = null, rows, topics = [], questions = null, excluded = { pending: 0, unreleased: 0 }, options = {}, now = Date.now() }) => {
  const isTest = preset === "test";
  const lang = REPORT_LANGS.includes(options.language) ? options.language : "en";
  const oldestFirst = [...rows].sort((a, b) => a.at - b.at);
  const inPeriod = isTest ? oldestFirst : oldestFirst.filter((r) => r.at >= period.from && r.at <= period.to);
  const percents = inPeriod.map((r) => r.percent);
  const classAvgs = inPeriod.map((r) => r.classAverage).filter((v) => v != null);
  const track = isTest ? null : trendOf(oldestFirst.filter((r) => r.at <= period.to).map((r) => r.percent));

  const strong = topics.filter((t) => t.accuracy >= TARGET_PERCENT).sort((a, b) => b.accuracy - a.accuracy).slice(0, MAX_TOPICS);
  const weak = topics.filter((t) => t.accuracy < TARGET_PERCENT).sort((a, b) => a.accuracy - b.accuracy).slice(0, MAX_TOPICS);

  const head = isTest && inPeriod[0] ? inPeriod[0] : null;
  const header = {
    institution,
    classCode: student.cls,
    student: { id: student.id, name: student.name, roll: student.roll },
    subject: isTest ? (head?.subject ?? subjectName) : subjectName,
    period: isTest
      ? { key: "test", from: head?.at ?? now, to: head?.at ?? now, label: head ? `${head.test} · ${dayLabel(head.at, true)}` : "" }
      : { key: period.key, from: period.from, to: period.to, label: periodLabel(period.from, period.to) },
    generatedAt: now,
  };

  return {
    kind: isTest ? "test" : "weekly",
    language: lang,
    header,
    empty: inPeriod.length === 0,
    summary: on(options, "summary")
      ? { tests: inPeriod.length, average: percents.length ? Math.round(mean(percents)) : null, classAverage: classAvgs.length ? Math.round(mean(classAvgs)) : null, trend: track }
      : null,
    trend: on(options, "trend") && !isTest ? inPeriod.map((r) => ({ testId: r.testId, label: r.test, at: r.at, you: r.percent, class: r.classAverage })) : [],
    topics: on(options, "topics") ? { strong, weak } : null,
    tests: on(options, "tests") || isTest ? [...inPeriod].reverse().map((r) => ({ testId: r.testId, title: r.test, subject: r.subject, at: r.at, marks: r.marks, max: r.max, percent: r.percent, classAverage: r.classAverage })) : [],
    questions: isTest ? (questions ?? []) : null,
    comment: on(options, "comment") ? clean(options.comment) : "",
    nextSteps: on(options, "nextSteps") ? nextStepsFromTopics(weak, lang) : [],
    excluded,
  };
};

/**
 * Fingerprint of what the sheet prints (not the letterhead, the print time or the teacher's counts):
 * the same input always gives the same code, so a printed sheet can be matched with its snapshot.
 */
export const reportContentHash = (report) =>
  sha256Hex(
    canonicalJson({
      kind: report.kind,
      language: report.language,
      student: report.header.student,
      classCode: report.header.classCode,
      subject: report.header.subject,
      period: { key: report.header.period.key, from: report.header.period.from, to: report.header.period.to },
      summary: report.summary,
      trend: report.trend,
      topics: report.topics,
      tests: report.tests,
      questions: report.questions,
      comment: report.comment,
      nextSteps: report.nextSteps,
    }),
  );
